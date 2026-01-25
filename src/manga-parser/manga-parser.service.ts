import { Injectable, BadRequestException, Logger } from '@nestjs/common';
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

@Injectable()
export class MangaParserService {
  private readonly logger = new Logger(MangaParserService.name);
  private session: AxiosInstance;
  private parsers: Map<string, MangaParser>;

  constructor(
    private titlesService: TitlesService,
    private chaptersService: ChaptersService,
    private filesService: FilesService,
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
  }

  private sanitizeFilename(name: string): string {
    if (!name) return 'unknown';
    return name.replace(/[\\/*?:"<>|]/g, '_').trim();
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
      ъ: 'y',
      ы: 'y',
      ь: "'",
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
    }

    // Убираем повторяющиеся дефисы и обрезаем по краям
    return (
      result
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50) || 'unknown-title'
    ); // Ограничиваем длину
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

            // Очищаем URL от лишних параметров, но оставляем timestamp
            imgUrl = imgUrl.trim();
            imageUrls.push(imgUrl);

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

              imgUrl = imgUrl.trim();
              if (!imageUrls.includes(imgUrl)) {
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
            {
              // Добавляем заголовки для обхода возможных ограничений
              headers: {
                Referer: 'https://mangabuff.ru/',
                Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site',
              },
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

      const imageUrls: string[] = [];
      $chapter('.page-break img').each((_, element) => {
        const src =
          $chapter(element).attr('data-src') || $chapter(element).attr('src');
        if (src) {
          const absoluteUrl = new URL(src, chapter.url).href;
          imageUrls.push(absoluteUrl);
        }
      });

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
            {}, // Добавляем пустой объект для опций, чтобы соответствовать сигнатуре метода
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
    domain: string = 'senkuro.me',
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
        const imgUrl = page.image?.original?.url;
        if (!imgUrl) continue;

        const pagePath = await this.filesService.downloadImageFromUrl(
          imgUrl,
          chapterId,
          page.number,
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
      throw new BadRequestException(
        'Unsupported site. Only manga-shi.org, senkuro.me, and mangabuff.ru are supported.',
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
      type: customType,
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

    for (const chapter of chapters) {
      try {
        const chapterNumber = chapter.number || 1;

        const createChapterDto: CreateChapterDto = {
          titleId: createdTitle._id.toString(),
          chapterNumber,
          name: chapter.name,
          isPublished: true,
        };

        const createdChapter =
          await this.chaptersService.create(createChapterDto);

        if (chapter.slug || chapter.url) {
          let pagePaths: string[] = [];

          if (domain.includes('senkuro.me') || domain.includes('sencuro.me')) {
            pagePaths = await this.downloadChapterImages(
              chapter,
              createdChapter._id.toString(),
              domain,
            );
          } else if (domain.includes('manga-shi.org')) {
            pagePaths = await this.downloadMangaShiChapterImages(
              chapter,
              createdChapter._id.toString(),
            );
          } else if (domain.includes('mangabuff.ru')) {
            pagePaths = await this.downloadMangabuffChapterImages(
              chapter,
              createdChapter._id.toString(),
            );
          } else if (domain.includes('mangahub.one')) {
            // MangaHub использует JavaScript для загрузки изображений
            // Требуется дополнительная реализация с использованием браузера
            throw new BadRequestException(
              'MangaHub image downloading requires additional implementation with browser automation',
            );
          } else {
            throw new BadRequestException(`Unsupported domain: ${domain}`);
          }

          if (pagePaths.length > 0) {
            await this.chaptersService.update(createdChapter._id.toString(), {
              pages: pagePaths,
            });
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
      throw new BadRequestException(
        'Unsupported site. Only manga-shi.org, senkuro.me, mangabuff.ru, and mangahub.cc are supported for chapter import.',
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
        throw new BadRequestException(
          'No chapters found to import (all chapters may already exist)',
        );
      }
    }

    const importedChapters: any[] = [];
    const domain = this.extractDomain(url);

    for (const chapter of selectedChapters) {
      try {
        const chapterNumber = chapter.number || 1;

        const createChapterDto: CreateChapterDto = {
          titleId,
          chapterNumber,
          name: chapter.name,
          isPublished: true,
        };

        const createdChapter =
          await this.chaptersService.create(createChapterDto);

        if (chapter.slug || chapter.url) {
          let pagePaths: string[] = [];

          if (domain.includes('senkuro.me') || domain.includes('sencuro.me')) {
            pagePaths = await this.downloadChapterImages(
              chapter,
              createdChapter._id.toString(),
              domain,
            );
          } else if (domain.includes('manga-shi.org')) {
            pagePaths = await this.downloadMangaShiChapterImages(
              chapter,
              createdChapter._id.toString(),
            );
          } else if (domain.includes('mangabuff.ru')) {
            pagePaths = await this.downloadMangabuffChapterImages(
              chapter,
              createdChapter._id.toString(),
            );
          } else if (domain.includes('mangahub.one')) {
            // MangaHub использует JavaScript для загрузки изображений
            // Требуется дополнительная реализация с использованием браузера
            throw new BadRequestException(
              'MangaHub image downloading requires additional implementation with browser automation',
            );
          } else {
            throw new BadRequestException(`Unsupported domain: ${domain}`);
          }

          if (pagePaths.length > 0) {
            await this.chaptersService.update(createdChapter._id.toString(), {
              pages: pagePaths,
            });
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

  async parseChaptersInfo(
    parseChaptersInfoDto: ParseChaptersInfoDto,
  ): Promise<{ title: string; chapters: ChapterInfo[] }> {
    const { url, chapterNumbers } = parseChaptersInfoDto;

    const parser = this.getParserForUrl(url);
    if (!parser) {
      throw new BadRequestException(
        'Unsupported site. Only manga-shi.org, senkuro.me, and mangabuff.ru are supported.',
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
      throw new BadRequestException(
        'No chapters found to import (all chapters may already exist)',
      );
    }

    if (chapters.length === 0 && parsedData.chapters.length === 0) {
      throw new BadRequestException('No chapters found on the source website');
    }

    return {
      title: parsedData.title,
      chapters,
    };
  }

  getSupportedSites(): { sites: string[] } {
    return {
      sites: [
        'manga-shi.org',
        'senkuro.me',
        'mangabuff.ru',
        'v2.mangahub.one',
        'mangahub.one',
        'mangahub.cc',
      ],
    };
  }
}
