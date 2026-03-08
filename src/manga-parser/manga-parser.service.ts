import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { TitlesService } from '../titles/titles.service';
import { ChaptersService } from '../chapters/chapters.service';
import { FilesService } from '../files/files.service';
import { CreateTitleDto } from '../titles/dto/create-title.dto';
import { CreateChapterDto } from '../chapters/dto/create-chapter.dto';
import { ParseTitleDto } from './dto/parse-title.dto';
import { ParseChapterDto } from './dto/parse-chapter.dto';
import { ParseChaptersInfoDto } from './dto/parse-chapters-info.dto';
import { MangaParser, ChapterInfo } from './parsers/base.parser';
import { SenkuroParser } from './parsers/senkuro.parser';
import { MangaShiParser } from './parsers/manga-shi.parser';
import { MangabuffParser } from './parsers/mangabuff.parser';
import { MangahubParser } from './parsers/mangahub.parser';
import { MangahubCcParser } from './parsers/mangahub-cc.parser';
import { TelemangaParser } from './parsers/telemanga.parser';
import { Ab728TeamParser } from './parsers/ab-728-team.parser';

/**
 * Result of parsing chapters info from a single source
 */
export interface ParsingSourceResult {
  url: string;
  success: boolean;
  title?: string;
  chapters: ChapterInfo[];
  error?: string;
  chapterCount: number;
}

/**
 * Result of sequential parsing from multiple sources
 */
export interface SequentialParsingResult {
  success: boolean;
  usedSourceUrl?: string;
  title?: string;
  chapters: ChapterInfo[];
  totalSourcesTried: number;
  errors: string[];
}

@Injectable()
export class MangaParserService {
  private readonly logger = new Logger(MangaParserService.name);
  private readonly baseUrl = 'https://telemanga.me';
  private session: AxiosInstance;
  private parsers: Map<string, MangaParser>;

  constructor(
    private titlesService: TitlesService,
    private chaptersService: ChaptersService,
    private filesService: FilesService,
    @Inject(CACHE_MANAGER)
    private cacheManager: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void> },
  ) {
    this.session = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
      },
    });

    this.parsers = new Map();

    this.parsers.set('manga-shi.org', new MangaShiParser());
    this.parsers.set('senkuro.me', new SenkuroParser());
    this.parsers.set('mangabuff.ru', new MangabuffParser());
    this.parsers.set('v2.mangahub.one', new MangahubParser());
    this.parsers.set('mangahub.one', new MangahubParser());
    this.parsers.set('mangahub.cc', new MangahubCcParser());
    this.parsers.set('telemanga.me', new TelemangaParser());
    this.parsers.set('ab.728.team', new Ab728TeamParser());
  }

  private sanitizeFilename(name: string): string {
    if (!name) return 'unknown';
    return name.replace(/[\\/*?:"<>|]/g, '_').trim();
  }

  /** Убирает точку с запятой в конце и пробелы — из-за этого иногда терялась последняя страница при парсинге */
  private normalizeImageUrl(url: string): string {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/;\s*$/, '').trim();
  }

  private generateSlug(name: string): string {
    if (!name) return 'unknown-title';

    // Транслитерация кириллических символов
    const translitMap: { [key: string]: string } = {
      а: 'a',
      б: 'b',
      в: 'v',
      г: 'g',
      д: 'd',
      е: 'e',
      ё: 'e',
      ж: 'zh',
      з: 'z',
      и: 'i',
      й: 'y',
      к: 'k',
      л: 'l',
      м: 'm',
      н: 'n',
      о: 'o',
      п: 'p',
      р: 'r',
      с: 's',
      т: 't',
      у: 'u',
      ф: 'f',
      х: 'h',
      ц: 'ts',
      ч: 'ch',
      ш: 'sh',
      щ: 'sch',
      ъ: '',
      ы: 'y',
      ь: '',
      э: 'e',
      ю: 'yu',
      я: 'ya',
    };

    let result = '';
    for (let i = 0; i < name.length; i++) {
      const char = name[i].toLowerCase();
      if (translitMap[char]) {
        result += translitMap[char];
      } else if (/[a-z0-9]/.test(char)) {
        result += char;
      } else if (/[а-яё]/.test(char)) {
        result += translitMap[char] || char;
      } else if (/\s/.test(char)) {
        result += '-';
      }
      // Остальные символы (', ", и т.д.) не добавляем — ломают ссылки
    }

    // Оставляем только символы, безопасные для URL: a-z, 0-9, дефис
    const safe = result
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
    return safe || 'unknown-title';
  }

  private parseChapterNumbers(chapterNumbers: string[]): Set<number> {
    const numbers = new Set<number>();
    for (const item of chapterNumbers) {
      if (item.includes('-')) {
        const [start, end] = item.split('-').map((s) => parseInt(s.trim(), 10));
        if (isNaN(start) || isNaN(end) || start > end) {
          throw new BadRequestException(`Invalid range: ${item}`);
        }
        for (let i = start; i <= end; i++) {
          numbers.add(i);
        }
      } else {
        const num = parseInt(item.trim(), 10);
        if (isNaN(num)) {
          throw new BadRequestException(`Invalid number: ${item}`);
        }
        numbers.add(num);
      }
    }
    return numbers;
  }

  /**
   * Улучшенный метод для скачивания изображений с mangabuff.ru
   * Теперь корректно извлекает все изображения главы
   */
  private async downloadMangabuffChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
    titleId: string,
    options?: { syncTempSuffix?: string },
  ): Promise<string[]> {
    if (!chapter.url) {
      throw new BadRequestException('Chapter URL is required for downloading');
    }

    try {
      // Создаем сессию с заголовками для mangabuff
      const mangabuffSession = axios.create({
        timeout: 30000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        },
      });

      // Получаем страницу главы
      const chapterResponse = await mangabuffSession.get(chapter.url, {
        maxRedirects: 5,
      });

      const $chapter = cheerio.load(chapterResponse.data);

      // Извлекаем все изображения страниц
      const imageUrls: string[] = [];

      // Ищем все элементы reader__item внутри reader__pages
      $chapter('.reader__pages .reader__item').each((index, element) => {
        const imgElement = $chapter(element).find('img');

        if (imgElement.length > 0) {
          // Пробуем получить URL из data-src или src
          let imgUrl = imgElement.attr('data-src') || imgElement.attr('src');

          if (imgUrl) {
            // Если URL относительный, преобразуем в абсолютный
            if (imgUrl.startsWith('//')) {
              imgUrl = 'https:' + imgUrl;
            } else if (imgUrl.startsWith('/')) {
              imgUrl = 'https://mangabuff.ru' + imgUrl;
            }

            // Очищаем URL от лишних параметров (в т.ч. ; в конце) — иначе может теряться страница
            imgUrl = this.normalizeImageUrl(imgUrl);
            if (imgUrl) imageUrls.push(imgUrl);

            this.logger.debug(`Found image ${index + 1}: ${imgUrl}`);
          }
        }
      });

      // Альтернативный способ: ищем все изображения с определенными атрибутами
      if (imageUrls.length === 0) {
        $chapter('img[data-src], img[src]').each((index, element) => {
          const imgElement = $chapter(element);
          // Пропускаем изображения из рекламы и других мест
          if (
            imgElement.parents('.rek, .ad, .advertisement, .ads').length === 0
          ) {
            let imgUrl = imgElement.attr('data-src') || imgElement.attr('src');

            if (
              imgUrl &&
              (imgUrl.includes('/chapters/') || imgUrl.includes('/img/'))
            ) {
              if (imgUrl.startsWith('//')) {
                imgUrl = 'https:' + imgUrl;
              } else if (imgUrl.startsWith('/')) {
                imgUrl = 'https://mangabuff.ru' + imgUrl;
              }

              imgUrl = this.normalizeImageUrl(imgUrl);
              if (imgUrl && !imageUrls.includes(imgUrl)) {
                imageUrls.push(imgUrl);
              }
            }
          }
        });
      }

      if (imageUrls.length === 0) {
        throw new Error(
          'No images found in chapter. Selectors might be outdated.',
        );
      }

      this.logger.log(
        `Found ${imageUrls.length} images for chapter ${chapter.number || 'unknown'}`,
      );

      // Скачиваем изображения
      const pagePaths: string[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const imgUrl = imageUrls[i];

        // Пропускаем явно рекламные URL
        if (
          imgUrl.includes('yandex.ru') ||
          imgUrl.includes('ads') ||
          imgUrl.includes('rek')
        ) {
          this.logger.debug(`Skipping ad image: ${imgUrl}`);
          continue;
        }

        try {
          this.logger.debug(
            `Downloading image ${i + 1}/${imageUrls.length}: ${imgUrl}`,
          );

          const pagePath = await this.filesService.downloadImageFromUrl(
            imgUrl,
            chapterId,
            i + 1,
            titleId,
            {
              headers: {
                Referer: 'https://mangabuff.ru/',
                Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site',
              },
              syncTempSuffix: options?.syncTempSuffix,
            },
          );

          pagePaths.push(pagePath);
          this.logger.debug(`Successfully downloaded image ${i + 1}`);
        } catch (imageError) {
          this.logger.error(
            `Failed to download image ${imgUrl}: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`,
          );

          // Пробуем альтернативный сервер для изображений
          if (imgUrl.includes('c3.mangabuff.ru')) {
            const alternativeUrl = imgUrl.replace(
              'c3.mangabuff.ru',
              'c2.mangabuff.ru',
            );
            this.logger.debug(`Trying alternative server: ${alternativeUrl}`);

            try {
              const altPagePath = await this.filesService.downloadImageFromUrl(
                alternativeUrl,
                chapterId,
                i + 1,
                titleId,
                {
                  headers: {
                    Referer: 'https://mangabuff.ru/',
                    Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Sec-Fetch-Dest': 'image',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site',
                  },
                  syncTempSuffix: options?.syncTempSuffix,
                },
              );
              pagePaths.push(altPagePath);
              this.logger.debug(
                `Successfully downloaded from alternative server`,
              );
            } catch (altError) {
              this.logger.error(
                `Alternative server also failed: ${altError instanceof Error ? altError.message : 'Unknown error'}`,
              );
            }
          }
        }

        // Пауза между загрузками, чтобы не перегружать сервер
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (pagePaths.length === 0) {
        throw new Error('No images could be downloaded');
      }

      this.logger.log(
        `Successfully downloaded ${pagePaths.length} pages for chapter ${chapter.number || 'unknown'}`,
      );
      return pagePaths;
    } catch (error) {
      this.logger.error(
        `Failed to download mangabuff chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to download chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Download chapter images for manga-shi.org
   */
  private async downloadMangaShiChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
    titleId: string,
    options?: { syncTempSuffix?: string },
  ): Promise<string[]> {
    if (!chapter.url) {
      throw new BadRequestException('Chapter URL is required for downloading');
    }

    try {
      const mangaShiSession = axios.create({
        timeout: 20000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
          Referer: 'https://manga-shi.org/',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      const chapterResponse = await mangaShiSession.get(chapter.url);
      const $chapter = cheerio.load(chapterResponse.data);
      const baseUrl = new URL(chapter.url).origin;

      const imageUrls: string[] = [];
      // New layout: one img per .reader-page (data-src for lazy, src for first)
      $chapter('.reader-page').each((_, pageEl) => {
        const img = $chapter(pageEl).find('.reader-image img, img').first();
        const src = img.attr('data-src') || img.attr('src');
        if (src) {
          const normalized = this.normalizeImageUrl(src);
          if (normalized) {
            const absoluteUrl =
              normalized.startsWith('http') ? normalized : `${baseUrl}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
            imageUrls.push(absoluteUrl);
          }
        }
      });
      // Legacy: .page-break img
      if (imageUrls.length === 0) {
        $chapter('.page-break img').each((_, element) => {
          const src =
            $chapter(element).attr('data-src') || $chapter(element).attr('src');
          if (src) {
            const normalized = this.normalizeImageUrl(src);
            if (normalized) {
              const absoluteUrl = new URL(normalized, chapter.url).href;
              imageUrls.push(absoluteUrl);
            }
          }
        });
      }

      if (imageUrls.length === 0) {
        throw new Error('No images found in chapter');
      }

      const pagePaths: string[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const imgUrl = imageUrls[i];
        try {
          const pagePath = await this.filesService.downloadImageFromUrl(
            imgUrl,
            chapterId,
            i + 1,
            titleId,
            { syncTempSuffix: options?.syncTempSuffix },
          );
          pagePaths.push(pagePath);
        } catch (imageError) {
          this.logger.error(
            `Failed to download image ${imgUrl}: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (pagePaths.length === 0) {
        throw new Error('No images could be downloaded');
      }

      return pagePaths;
    } catch (error) {
      this.logger.error(
        `Failed to download manga-shi chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to download chapter images');
    }
  }

  /**
   * Download chapter images for senkuro.me (GraphQL API)
   */
  private async downloadChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
    domain: string,
    titleId: string,
    options?: { syncTempSuffix?: string },
  ): Promise<string[]> {
    if (!chapter.slug) {
      throw new BadRequestException('Chapter slug is required for downloading');
    }

    try {
      const graphqlUrl = `https://api.${domain}/graphql`;
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: `https://${domain}`,
        Referer: `https://${domain}/`,
      };

      const query = `
        query Chapter($slug: String!) {
          mangaChapter(slug: $slug) {
            id
            name
            number
            pages {
              number
              image {
                original {
                  url
                }
              }
            }
          }
        }
      `;

      const response = await this.session.post(
        graphqlUrl,
        {
          query,
          variables: { slug: chapter.slug },
        },
        { headers },
      );

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      const data = response.data;
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      const chapterData = data.data?.mangaChapter;
      if (!chapterData) {
        throw new Error('No chapter data in response');
      }

      const pages = chapterData.pages || [];
      if (pages.length === 0) {
        throw new Error('No pages found in chapter');
      }

      const pagePaths: string[] = [];
      for (const page of pages) {
        const rawUrl = page.image?.original?.url;
        const imgUrl = rawUrl ? this.normalizeImageUrl(rawUrl) : '';
        if (!imgUrl) continue;

        const pagePath = await this.filesService.downloadImageFromUrl(
          imgUrl,
          chapterId,
          page.number,
          titleId,
          { syncTempSuffix: options?.syncTempSuffix },
        );
        pagePaths.push(pagePath);

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return pagePaths;
    } catch (error) {
      this.logger.error(
        `Failed to download chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to download chapter images');
    }
  }

  /**
   * Download chapter images for telemanga.me.
   * URL-ы собираем так же, как на сайте: cdn.telemanga.me/mangas/{slug}/glava-{номер}/{страница}.jpg
   * (API может отдавать storage.yandexcloud.net с другими путями и 404.)
   */
  private async downloadTelemangaChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
    mangaSlug: string,
    titleId: string,
    options?: { syncTempSuffix?: string },
  ): Promise<string[]> {
    if (!chapter.number) {
      throw new BadRequestException(
        'Chapter number is required for downloading telemanga.me chapters',
      );
    }

    try {
      const chapterPagesUrl = `${this.baseUrl}/api/manga/${encodeURIComponent(mangaSlug)}/chapter/${chapter.number}`;

      const response = await this.session.get(chapterPagesUrl);

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const pagesData = response.data.result?.pages || [];
      if (!Array.isArray(pagesData) || pagesData.length === 0) {
        throw new Error('No pages found in chapter response');
      }

      const cdnBase = 'https://cdn.telemanga.me';
      const pagePaths: string[] = [];
      for (let i = 0; i < pagesData.length; i++) {
        const pageNum = i + 1;
        const imgUrl = `${cdnBase}/mangas/${encodeURIComponent(mangaSlug)}/glava-${chapter.number}/${pageNum}.jpg`;

        try {
          const pagePath = await this.filesService.downloadImageFromUrl(
            imgUrl,
            chapterId,
            pageNum,
            titleId,
            {
              headers: {
                Referer: 'https://telemanga.me/',
                Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
              },
              syncTempSuffix: options?.syncTempSuffix,
            },
          );
          pagePaths.push(pagePath);
        } catch (imageError) {
          this.logger.error(
            `Failed to download telemanga image ${pageNum}: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (pagePaths.length === 0) {
        throw new Error('No images could be downloaded');
      }

      return pagePaths;
    } catch (error) {
      this.logger.error(
        `Failed to download telemanga chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Failed to download chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Download chapter images for ab.728.team (HTML reader page)
   */
  private async downloadAb728TeamChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
    titleId: string,
    options?: { syncTempSuffix?: string },
  ): Promise<string[]> {
    if (!chapter.url) {
      throw new BadRequestException(
        'Chapter URL is required for downloading ab.728.team chapters',
      );
    }

    const baseUrl = 'https://ab.728.team';
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ru,en;q=0.9',
      Origin: baseUrl,
      Referer: `${baseUrl}/`,
      'X-Requested-With': 'XMLHttpRequest',
      'its-728': 'true',
    };

    try {
      const urlMatch = chapter.url.match(/ab\.728\.team\/comic\/([^/]+)\/([^/?#]+)/);
      const comicSlug = urlMatch?.[1];
      const ordinal = urlMatch?.[2];
      const apiHeaders = {
        ...headers,
        Accept: 'application/json',
      };
      let imageUrls: string[] = [];

      if (comicSlug && ordinal) {
        try {
          const apiRes = await this.session.get(
            `${baseUrl}/backend/chapter.get`,
            {
              params: { target: comicSlug, chapter: ordinal },
              headers: apiHeaders,
            },
          );
          const apiData = apiRes.data as {
            end?: string;
            server?: { chapter?: { pages?: string[] }; pages?: string[] };
          };
          if (apiData?.end === 'success') {
            const pages =
              apiData.server?.chapter?.pages ?? apiData.server?.pages;
            if (Array.isArray(pages) && pages.length > 0) {
              imageUrls = pages
                .map((p) => {
                  const u = typeof p === 'string' ? p : '';
                  const full = u.startsWith('http') ? u : `${baseUrl}/storage/${u.replace(/^\//, '')}`;
                  return this.normalizeImageUrl(full);
                })
                .filter(Boolean);
            }
          }
        } catch {
          // API not available or different shape, fall back to HTML
        }
      }

      if (imageUrls.length === 0) {
        const response = await this.session.get(chapter.url, { headers });
        if (response.status !== 200) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const $ = cheerio.load(response.data);
        const pushSrc = (src: string | undefined): void => {
          const normalized = src ? this.normalizeImageUrl(src) : '';
          if (!normalized) return;
          const absolute =
            normalized.startsWith('http') ? normalized : new URL(normalized, chapter.url).href;
          if (!imageUrls.includes(absolute)) imageUrls.push(absolute);
        };
        $('img[data-src]').each((_, el) => pushSrc($(el).attr('data-src')));
        $('.reader img, .reader-page img, .chapter-reader img, [class*="reader"] img').each(
          (_, el) => {
            const img = $(el);
            pushSrc(img.attr('data-src') || img.attr('src'));
          },
        );
        $('img[src*="storage"], img[src*="upload"], img[data-src*="storage"]').each(
          (_, el) => {
            const img = $(el);
            pushSrc(img.attr('data-src') || img.attr('src'));
          },
        );
        if (imageUrls.length === 0) {
          $('img').each((_, el) => {
            const img = $(el);
            const src = img.attr('data-src') || img.attr('src');
            if (src && !/avatar|logo|icon|\.(svg|gif)/i.test(src)) pushSrc(src);
          });
        }
        const scriptJson = $('script:not([src])')
          .toArray()
          .map((el) => $(el).html())
          .join('\n');
        const nuxtMatch = scriptJson.match(/__NUXT__(?:_DATA__)?\s*=\s*(\{[\s\S]*?\});?\s*(?:<\/script>|$)/m);
        if (nuxtMatch && imageUrls.length === 0) {
          try {
            const data = JSON.parse(nuxtMatch[1]);
            const pages =
              data?.data?.[0]?.pages ||
              data?.state?.data?.pages ||
              data?.page?.images ||
              data?.chapter?.pages;
            if (Array.isArray(pages)) {
              for (const p of pages) {
                const raw = typeof p === 'string' ? p : p?.url ?? p?.src ?? p?.image;
                const url = raw ? this.normalizeImageUrl(String(raw)) : '';
                if (url) imageUrls.push(url.startsWith('http') ? url : new URL(url, chapter.url).href);
              }
            }
          } catch {
            // ignore JSON parse errors
          }
        }
      }

      if (imageUrls.length === 0) {
        throw new Error('No images found in chapter page');
      }

      const pagePaths: string[] = [];
      const referer = chapter.url?.startsWith('http') ? chapter.url : `${baseUrl}/`;
      for (let i = 0; i < imageUrls.length; i++) {
        try {
          const pagePath = await this.filesService.downloadImageFromUrl(
            imageUrls[i],
            chapterId,
            i + 1,
            titleId,
            {
              headers: {
                Referer: referer,
                Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
              },
              syncTempSuffix: options?.syncTempSuffix,
            },
          );
          pagePaths.push(pagePath);
        } catch (imageError) {
          this.logger.error(
            `Failed to download ab.728.team image ${i + 1}: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (pagePaths.length === 0) {
        throw new Error('No images could be downloaded');
      }
      return pagePaths;
    } catch (error) {
      this.logger.error(
        `Failed to download ab.728.team chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        `Failed to download chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async parseAndImportTitle(
    parseTitleDto: ParseTitleDto,
  ): Promise<{ title: any; importedChapters: any[]; totalChapters: number }> {
    const {
      url,
      chapterNumbers,
      customTitle,
      customDescription,
      customGenres,
      customType,
    } = parseTitleDto;

    const parser = this.getParserForUrl(url);
    if (!parser) {
      const { sites } = await this.getSupportedSites();
      throw new BadRequestException(
        `Unsupported site. Supported: ${sites.join(', ')}`,
      );
    }

    const parsedData = await parser.parse(url);

    let chapters = parsedData.chapters;
    if (chapterNumbers && chapterNumbers.length > 0) {
      const requestedNumbers = this.parseChapterNumbers(chapterNumbers);
      chapters = chapters.filter(
        (ch) => ch.number && requestedNumbers.has(ch.number),
      );
    }

    if (chapters.length === 0) {
      throw new BadRequestException('No chapters found on the source website');
    }

    const createTitleDto: CreateTitleDto = {
      name: customTitle || this.sanitizeFilename(parsedData.title),
      slug: this.generateSlug(customTitle || parsedData.title),
      altNames: parsedData.alternativeTitles || [],
      description:
        customDescription || parsedData.description || `Imported from ${url}`,
      genres: customGenres || parsedData.genres || ['Unknown'],
      coverImage: parsedData.coverUrl,
      type: customType ?? parsedData.type,
      author: parsedData.author,
      artist: parsedData.artist,
      tags: parsedData.tags,
      releaseYear: parsedData.releaseYear,
      isPublished: true,
    };

    const createdTitle = await this.titlesService.create(createTitleDto);
    this.logger.log(`Created title: ${createdTitle.name}`);

    if (parsedData.coverUrl) {
      try {
        const localCoverPath = await this.filesService.downloadTitleCover(
          parsedData.coverUrl,
          createdTitle._id.toString(),
        );
        await this.titlesService.update(createdTitle._id.toString(), {
          coverImage: localCoverPath,
        });
        this.logger.log(`Downloaded and saved title cover: ${localCoverPath}`);
      } catch (error) {
        this.logger.error(
          `Failed to download title cover: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    const importedChapters: any[] = [];
    const domain = this.extractDomain(url);
    const mangaSlug = this.extractMangaSlug(url);

    try {
      for (const chapter of chapters) {
        try {
          const chapterNumber = chapter.number || 1;

          const createChapterDto: CreateChapterDto = {
            titleId: createdTitle._id.toString(),
            chapterNumber,
            name: chapter.name,
            isPublished: true,
            sourceChapterUrl: chapter.url ?? null,
          };

          const createdChapter =
            await this.chaptersService.create(createChapterDto);

          if (chapter.slug || chapter.url) {
            const pagePaths = await this.downloadPagesForChapterInfo(
              chapter,
              createdChapter._id.toString(),
              createdTitle._id.toString(),
              domain,
              mangaSlug,
            );
            if (pagePaths.length > 0) {
              await this.chaptersService.update(createdChapter._id.toString(), {
                pages: pagePaths,
                sourceChapterUrl: chapter.url ?? null,
              });
              if (chapter.pageCount != null && pagePaths.length !== chapter.pageCount) {
                this.logger.warn(
                  `Chapter ${chapterNumber}: expected ${chapter.pageCount} pages from source, got ${pagePaths.length}`,
                );
              }
              this.logger.log(
                `Downloaded ${pagePaths.length} pages for chapter ${chapterNumber}`,
              );
            }
          }

          importedChapters.push(createdChapter);
          this.logger.log(`Imported chapter ${chapterNumber}: ${chapter.name}`);
        } catch (error) {
          this.logger.error(
            `Failed to import chapter ${chapter.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    } finally {
      // Всегда освобождаем ресурсы водяных знаков (предотвращение утечек ОЗУ)
      this.filesService.disposeWatermarkResources();
    }

    return {
      title: createdTitle,
      importedChapters,
      totalChapters: importedChapters.length,
    };
  }

  async parseAndImportChapters(
    parseChapterDto: ParseChapterDto,
  ): Promise<any[]> {
    const { url, titleId, chapterNumbers } = parseChapterDto;

    await this.titlesService.findById(titleId);

    const parser = this.getParserForUrl(url);
    if (!parser) {
      const { sites } = await this.getSupportedSites();
      throw new BadRequestException(
        `Unsupported site for chapter import. Supported: ${sites.join(', ')}`,
      );
    }

    const parsedData = await parser.parse(url);
    let selectedChapters = parsedData.chapters;

    if (chapterNumbers && chapterNumbers.length > 0) {
      const requestedNumbers = this.parseChapterNumbers(chapterNumbers);
      selectedChapters = parsedData.chapters.filter(
        (ch) => ch.number && requestedNumbers.has(ch.number),
      );
    }

    if (selectedChapters.length === 0) {
      if (parsedData.chapters.length === 0) {
        throw new BadRequestException(
          'No chapters found on the source website',
        );
      } else {
        // Return empty array instead of throwing - all chapters may already exist
        this.logger.log(
          'No new chapters to import (all chapters may already exist)',
        );
        return [];
      }
    }

    const importedChapters: any[] = [];
    const domain = this.extractDomain(url);
    const mangaSlug = this.extractMangaSlug(url);

    try {
      for (const chapter of selectedChapters) {
        try {
          const chapterNumber = chapter.number || 1;

          const createChapterDto: CreateChapterDto = {
            titleId,
            chapterNumber,
            name: chapter.name,
            isPublished: true,
            sourceChapterUrl: chapter.url ?? null,
          };

          const createdChapter =
            await this.chaptersService.create(createChapterDto);

          if (chapter.slug || chapter.url) {
            const pagePaths = await this.downloadPagesForChapterInfo(
              chapter,
              createdChapter._id.toString(),
              titleId,
              domain,
              mangaSlug,
            );
            if (pagePaths.length > 0) {
              await this.chaptersService.update(createdChapter._id.toString(), {
                pages: pagePaths,
                sourceChapterUrl: chapter.url ?? null,
              });
              if (chapter.pageCount != null && pagePaths.length !== chapter.pageCount) {
                this.logger.warn(
                  `Chapter ${chapterNumber}: expected ${chapter.pageCount} pages from source, got ${pagePaths.length}`,
                );
              }
              this.logger.log(
                `Downloaded ${pagePaths.length} pages for chapter ${chapterNumber}`,
              );
            }
          }

          importedChapters.push(createdChapter);
          this.logger.log(`Imported chapter ${chapterNumber}: ${chapter.name}`);
        } catch (error) {
          this.logger.error(
            `Failed to import chapter ${chapter.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    } finally {
      // Всегда освобождаем ресурсы водяных знаков (предотвращение утечек ОЗУ)
      this.filesService.disposeWatermarkResources();
    }

    return importedChapters;
  }

  getParserForUrl(url: string): MangaParser | null {
    for (const [site, parser] of this.parsers) {
      if (url.includes(site)) {
        return parser;
      }
    }
    return null;
  }

  private extractDomain(url: string): string {
    const urlObj = new URL(url);
    return urlObj.hostname;
  }

  private extractMangaSlug(url: string): string | null {
    // Extract slug from URL for sites like telemanga.me
    // Format: https://telemanga.me/manga/{slug}
    const match = url.match(/telemanga\.me\/manga\/([^/]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    // Format: https://ab.728.team/comic/{slug}
    const abMatch = url.match(/ab\.728\.team\/comic\/([^/?#]+)/);
    if (abMatch) {
      return decodeURIComponent(abMatch[1]);
    }
    return null;
  }

  /**
   * Возвращает список URL изображений главы без скачивания (для проверки 200 перед синхронизацией).
   */
  private async getChapterImageUrls(
    chapterInfo: ChapterInfo,
    domain: string,
    mangaSlug: string | null,
  ): Promise<string[]> {
    if (domain.includes('telemanga.me') && mangaSlug && chapterInfo.number != null) {
      const chapterPagesUrl = `${this.baseUrl}/api/manga/${encodeURIComponent(mangaSlug)}/chapter/${chapterInfo.number}`;
      const response = await this.session.get(chapterPagesUrl);
      if (response.status !== 200) return [];
      const pagesData = response.data.result?.pages || [];
      if (!Array.isArray(pagesData) || pagesData.length === 0) return [];
      const cdnBase = 'https://cdn.telemanga.me';
      return Array.from(
        { length: pagesData.length },
        (_, i) =>
          `${cdnBase}/mangas/${encodeURIComponent(mangaSlug)}/glava-${chapterInfo.number}/${i + 1}.jpg`,
      );
    }
    if (domain.includes('mangabuff.ru') && chapterInfo.url) {
      const session = axios.create({
        timeout: 30000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
        },
      });
      const res = await session.get(chapterInfo.url, { maxRedirects: 5 });
      const $ = cheerio.load(res.data);
      const urls: string[] = [];
      $('.reader__pages .reader__item img').each((_, el) => {
        let src = $(el).attr('data-src') || $(el).attr('src');
        if (src) {
          src = this.normalizeImageUrl(src);
          if (src) {
            if (src.startsWith('//')) src = 'https:' + src;
            else if (src.startsWith('/')) src = 'https://mangabuff.ru' + src;
            if (!urls.includes(src)) urls.push(src);
          }
        }
      });
      if (urls.length === 0) {
        $('img[data-src], img[src]').each((_, el) => {
          const $el = $(el);
          if ($el.parents('.rek, .ad').length > 0) return;
          let src = $el.attr('data-src') || $el.attr('src');
          if (src && (src.includes('/chapters/') || src.includes('/img/'))) {
            src = this.normalizeImageUrl(src);
            if (src) {
              if (src.startsWith('//')) src = 'https:' + src;
              else if (src.startsWith('/')) src = 'https://mangabuff.ru' + src;
              if (!urls.includes(src)) urls.push(src);
            }
          }
        });
      }
      return urls.filter(
        (u) => !u.includes('yandex.ru') && !u.includes('ads') && !u.includes('rek'),
      );
    }
    if (domain.includes('manga-shi.org') && chapterInfo.url) {
      const session = axios.create({
        timeout: 20000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://manga-shi.org/',
        },
      });
      const res = await session.get(chapterInfo.url);
      const $ = cheerio.load(res.data);
      const baseUrl = new URL(chapterInfo.url).origin;
      const urls: string[] = [];
      $('.reader-page').each((_, pageEl) => {
        const src = $(pageEl).find('.reader-image img, img').first().attr('data-src') || $(pageEl).find('img').first().attr('src');
        if (src) {
          const normalized = this.normalizeImageUrl(src);
          if (normalized) urls.push(normalized.startsWith('http') ? normalized : `${baseUrl}${normalized.startsWith('/') ? '' : '/'}${normalized}`);
        }
      });
      if (urls.length === 0) {
        $('.page-break img').each((_, el) => {
          const src = $(el).attr('data-src') || $(el).attr('src');
          if (src) {
            const normalized = this.normalizeImageUrl(src);
            if (normalized) urls.push(new URL(normalized, chapterInfo.url).href);
          }
        });
      }
      return urls;
    }
    if (domain.includes('ab.728.team') && chapterInfo.url) {
      const baseUrl = 'https://ab.728.team';
      const res = await this.session.get(chapterInfo.url);
      if (res.status !== 200) return [];
      const $ = cheerio.load(res.data);
      const urls: string[] = [];
      const pushSrc = (src: string | undefined) => {
        const normalized = src ? this.normalizeImageUrl(src) : '';
        if (!normalized) return;
        const absolute = normalized.startsWith('http') ? normalized : new URL(normalized, chapterInfo.url).href;
        if (!urls.includes(absolute)) urls.push(absolute);
      };
      $('img[data-src]').each((_, el) => pushSrc($(el).attr('data-src')));
      $('.reader img, .reader-page img').each((_, el) => {
        const img = $(el);
        pushSrc(img.attr('data-src') || img.attr('src'));
      });
      $('img[src*="storage"], img[data-src*="storage"]').each((_, el) => {
        const img = $(el);
        pushSrc(img.attr('data-src') || img.attr('src'));
      });
      return urls;
    }
    return [];
  }

  /**
   * Проверяет, что все URL отдают статус 200 (HEAD или GET).
   */
  private async validateImageUrls(
    urls: string[],
    headers?: Record<string, string>,
  ): Promise<{ allOk: boolean; failed?: { url: string; status: number } }> {
    const defaultHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
      ...headers,
    };
    const normalize = (u: string) => u.replace(/\s*;\s*$/, '').trim().replace(/ /g, '%20');
    for (const url of urls) {
      try {
        const normalized = normalize(String(url));
        const res = await axios.head(normalized, {
          timeout: 10000,
          headers: defaultHeaders,
          validateStatus: () => true,
        });
        if (res.status !== 200) {
          return { allOk: false, failed: { url: normalized, status: res.status } };
        }
      } catch {
        try {
          const normalized = normalize(String(url));
          const res = await axios.get(normalized, {
            timeout: 10000,
            responseType: 'arraybuffer',
            maxContentLength: 1,
            headers: defaultHeaders,
            validateStatus: () => true,
          });
          if (res.status !== 200) {
            return { allOk: false, failed: { url: normalized, status: res.status } };
          }
        } catch (e) {
          const status = (e as any)?.response?.status ?? 0;
          return { allOk: false, failed: { url: String(url), status: status || 500 } };
        }
      }
    }
    return { allOk: true };
  }

  /**
   * Скачивает страницы главы с источника (общая логика для импорта и ре-синхронизации).
   * При syncTempSuffix сохраняет во временную папку (для замены старых страниц после успешной загрузки).
   */
  private async downloadPagesForChapterInfo(
    chapterInfo: ChapterInfo,
    chapterId: string,
    titleId: string,
    domain: string,
    mangaSlug: string | null,
    options?: { syncTempSuffix?: string },
  ): Promise<string[]> {
    const downloadOpts = { syncTempSuffix: options?.syncTempSuffix };
    if (domain.includes('senkuro.me') || domain.includes('sencuro.me')) {
      return this.downloadChapterImages(
        chapterInfo,
        chapterId,
        domain,
        titleId,
        downloadOpts,
      );
    }
    if (domain.includes('manga-shi.org')) {
      return this.downloadMangaShiChapterImages(chapterInfo, chapterId, titleId, downloadOpts);
    }
    if (domain.includes('mangabuff.ru')) {
      return this.downloadMangabuffChapterImages(chapterInfo, chapterId, titleId, downloadOpts);
    }
    if (domain.includes('mangahub.one')) {
      throw new BadRequestException(
        'MangaHub image downloading requires additional implementation with browser automation',
      );
    }
    if (domain.includes('telemanga.me') && mangaSlug) {
      return this.downloadTelemangaChapterImages(
        chapterInfo,
        chapterId,
        mangaSlug,
        titleId,
        downloadOpts,
      );
    }
    if (domain.includes('ab.728.team')) {
      return this.downloadAb728TeamChapterImages(
        chapterInfo,
        chapterId,
        titleId,
        downloadOpts,
      );
    }
    throw new BadRequestException(`Unsupported domain: ${domain}`);
  }

  /**
   * Повторная синхронизация страниц уже созданных глав с источника.
   * Парсит источник по sourceUrl, находит главы по номерам, заново скачивает страницы и обновляет главы.
   */
  async syncChaptersFromSource(
    titleId: string,
    sourceUrl: string,
    chapterNumbers?: number[],
  ): Promise<{
    synced: { chapterId: string; chapterNumber: number; pagesCount: number }[];
    skipped: { chapterNumber: number; reason: string }[];
    errors: { chapterNumber: number; error: string }[];
  }> {
    await this.titlesService.findById(titleId);
    const parser = this.getParserForUrl(sourceUrl);
    if (!parser) {
      const { sites } = await this.getSupportedSites();
      throw new BadRequestException(
        `Unsupported site for sync. Supported: ${sites.join(', ')}`,
      );
    }
    const parsedData = await parser.parse(sourceUrl);
    const sourceChapters = parsedData.chapters;
    const domain = this.extractDomain(sourceUrl);
    const mangaSlug = this.extractMangaSlug(sourceUrl);

    const dbChapters = await this.chaptersService.findManyByTitleId(
      titleId,
      chapterNumbers,
    );
    const synced: { chapterId: string; chapterNumber: number; pagesCount: number }[] = [];
    const skipped: { chapterNumber: number; reason: string }[] = [];
    const errors: { chapterNumber: number; error: string }[] = [];

    for (const dbChapter of dbChapters) {
      const num = dbChapter.chapterNumber;
      const sourceChapter = sourceChapters.find(
        (ch) => ch.number != null && ch.number === num,
      );
      if (!sourceChapter) {
        skipped.push({
          chapterNumber: num,
          reason: 'chapter_not_found_on_source',
        });
        continue;
      }
      if (!sourceChapter.url && !sourceChapter.slug) {
        skipped.push({
          chapterNumber: num,
          reason: 'source_has_no_url_or_slug',
        });
        continue;
      }
      try {
        const chapterId = dbChapter._id.toString();

        const imageUrls = await this.getChapterImageUrls(
          sourceChapter,
          domain,
          mangaSlug,
        );
        if (imageUrls.length > 0) {
          const validation = await this.validateImageUrls(imageUrls);
          if (!validation.allOk && validation.failed) {
            errors.push({
              chapterNumber: num,
              error: `source_page_not_200: ${validation.failed.url} => ${validation.failed.status}`,
            });
            continue;
          }
        }

        const syncTempSuffix = '_sync_temp';
        const tempPagePaths = await this.downloadPagesForChapterInfo(
          sourceChapter,
          chapterId,
          titleId,
          domain,
          mangaSlug,
          { syncTempSuffix },
        );
        if (tempPagePaths.length === 0) {
          errors.push({
            chapterNumber: num,
            error: 'no_pages_downloaded',
          });
          continue;
        }

        const pagePaths = await this.filesService.replaceChapterPagesFromTemp(
          chapterId,
          titleId,
        );
        await this.chaptersService.update(chapterId, {
          pages: pagePaths,
          sourceChapterUrl: sourceChapter.url ?? null,
        });
        synced.push({
          chapterId,
          chapterNumber: num,
          pagesCount: pagePaths.length,
        });
        if (sourceChapter.pageCount != null && pagePaths.length !== sourceChapter.pageCount) {
          this.logger.warn(
            `Synced chapter ${num}: expected ${sourceChapter.pageCount} pages from source, got ${pagePaths.length}`,
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Sync chapter ${num} failed: ${message}`);
        errors.push({ chapterNumber: num, error: message });
      }
    }

    try {
      this.filesService.disposeWatermarkResources();
    } catch {
      // ignore
    }
    return { synced, skipped, errors };
  }

  async parseChaptersInfo(
    parseChaptersInfoDto: ParseChaptersInfoDto,
  ): Promise<{ title: string; chapters: ChapterInfo[] }> {
    const { url, chapterNumbers } = parseChaptersInfoDto;

    const parser = this.getParserForUrl(url);
    if (!parser) {
      const { sites } = await this.getSupportedSites();
      throw new BadRequestException(
        `Unsupported site. Supported: ${sites.join(', ')}`,
      );
    }

    const parsedData = await parser.parse(url);

    let chapters = parsedData.chapters;
    if (chapterNumbers && chapterNumbers.length > 0) {
      const requestedNumbers = this.parseChapterNumbers(chapterNumbers);
      chapters = chapters.filter(
        (ch) => ch.number && requestedNumbers.has(ch.number),
      );
    }

    if (chapters.length === 0 && parsedData.chapters.length > 0) {
      // Return empty chapters instead of throwing - all chapters may already exist
      this.logger.log(
        'No chapters match the requested numbers (all may already exist)',
      );
      return {
        title: parsedData.title,
        chapters: [],
      };
    }

    if (chapters.length === 0 && parsedData.chapters.length === 0) {
      throw new BadRequestException('No chapters found on the source website');
    }

    return {
      title: parsedData.title,
      chapters,
    };
  }

  /**
   * Только парсинг метаданных тайтла (без импорта). Для проверки полей и отладки.
   */
  async parseMetadata(url: string): Promise<{
    title: string;
    alternativeTitles?: string[];
    description?: string;
    coverUrl?: string;
    genres?: string[];
    author?: string;
    artist?: string;
    tags?: string[];
    releaseYear?: number;
    type?: string;
    chapterCount: number;
  }> {
    const parser = this.getParserForUrl(url);
    if (!parser) {
      const { sites } = await this.getSupportedSites();
      throw new BadRequestException(
        `Unsupported site. Supported: ${sites.join(', ')}`,
      );
    }
    const data = await parser.parse(url);
    return {
      title: data.title,
      alternativeTitles: data.alternativeTitles,
      description: data.description,
      coverUrl: data.coverUrl,
      genres: data.genres,
      author: data.author,
      artist: data.artist,
      tags: data.tags,
      releaseYear: data.releaseYear,
      type: data.type,
      chapterCount: data.chapters.length,
    };
  }

  async getSupportedSites(): Promise<{ sites: string[] }> {
    const cacheKey = 'manga-parser:supported-sites';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached as { sites: string[] };
    const result = {
      sites: [
        'manga-shi.org',
        'senkuro.me',
        'mangabuff.ru',
        'v2.mangahub.one',
        'mangahub.one',
        'mangahub.cc',
        'telemanga.me',
      ],
    };
    await this.cacheManager.set(cacheKey, result);
    return result;
  }

  /**
   * Parse chapters info from multiple sources sequentially.
   * Tries each source in order until chapters are found.
   *
   * @param sources Array of URLs to try in order
   * @param chapterNumbers Optional filter for specific chapter numbers
   * @returns SequentialParsingResult with chapters from the first successful source
   */
  async parseChaptersInfoSequential(
    sources: string[],
    chapterNumbers?: string[],
  ): Promise<SequentialParsingResult> {
    const errors: string[] = [];
    let totalSourcesTried = 0;

    // Try sources in order
    for (let i = 0; i < sources.length; i++) {
      const url = sources[i];
      totalSourcesTried++;

      try {
        const parser = this.getParserForUrl(url);
        if (!parser) {
          const error = `Unsupported site for URL: ${url}`;
          this.logger.warn(error);
          errors.push(error);
          continue;
        }

        this.logger.log(`Trying source ${i + 1}/${sources.length}: ${url}`);

        const parsedData = await parser.parse(url);

        let chapters = parsedData.chapters;
        if (chapterNumbers && chapterNumbers.length > 0) {
          const requestedNumbers = this.parseChapterNumbers(chapterNumbers);
          chapters = chapters.filter(
            (ch) => ch.number && requestedNumbers.has(ch.number),
          );
        }

        // Found chapters on this source
        if (chapters.length > 0) {
          this.logger.log(
            `Found ${chapters.length} chapters from source: ${url}`,
          );

          return {
            success: true,
            usedSourceUrl: url,
            title: parsedData.title,
            chapters,
            totalSourcesTried,
            errors,
          };
        }

        // No chapters found, continue to next source
        this.logger.log(
          `No chapters found from source ${url}, trying next source...`,
        );
        errors.push(`No chapters found at: ${url}`);
      } catch (error) {
        const errorMessage = `Failed to parse ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.logger.warn(errorMessage);
        errors.push(errorMessage);
      }
    }

    // All sources failed
    this.logger.error(
      `All ${sources.length} sources failed. Errors: ${errors.join('; ')}`,
    );

    return {
      success: false,
      chapters: [],
      totalSourcesTried,
      errors,
    };
  }

  /**
   * Parse chapters info from a single source with detailed result.
   *
   * @param url URL to parse
   * @param chapterNumbers Optional filter for specific chapter numbers
   * @returns ParsingSourceResult with detailed information about the parsing
   */
  async parseChaptersInfoDetailed(
    url: string,
    chapterNumbers?: string[],
  ): Promise<ParsingSourceResult> {
    try {
      const parser = this.getParserForUrl(url);
      if (!parser) {
        return {
          url,
          success: false,
          chapters: [],
          chapterCount: 0,
          error: `Unsupported site for URL: ${url}`,
        };
      }

      const parsedData = await parser.parse(url);

      let chapters = parsedData.chapters;
      if (chapterNumbers && chapterNumbers.length > 0) {
        const requestedNumbers = this.parseChapterNumbers(chapterNumbers);
        chapters = chapters.filter(
          (ch) => ch.number && requestedNumbers.has(ch.number),
        );
      }

      return {
        url,
        success: true,
        title: parsedData.title,
        chapters,
        chapterCount: chapters.length,
      };
    } catch (error) {
      return {
        url,
        success: false,
        chapters: [],
        chapterCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
