import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

@Injectable()
export class MangabuffParser implements MangaParser {
  private session: AxiosInstance;

  constructor() {
    this.session = axios.create({
      timeout: 60000, // Увеличен таймаут до 60 секунд для долгих запросов
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
      },
    });
  }

  async parse(url: string): Promise<ParsedMangaData> {
    try {
      // Get the main page to extract all data
      const mainResponse = await this.session.get(url);
      const $main = cheerio.load(mainResponse.data);

      // Extract title - ПРАВИЛЬНЫЙ СЕЛЕКТОР из HTML
      const title = $main('h1.manga__name').text().trim();

      // Extract alternative titles - ПРАВИЛЬНЫЙ СЕЛЕКТОР
      const alternativeTitles = this.extractAlternativeTitles($main);

      // Extract cover URL - ПРАВИЛЬНЫЙ СЕЛЕКТОР
      const coverUrl = $main('.manga__img img').attr('src');
      const absoluteCoverUrl = coverUrl
        ? `https://mangabuff.ru${coverUrl}`
        : undefined;

      // Extract description - ПРАВИЛЬНЫЙ СЕЛЕКТОР
      const description = $main('.manga__description').text().trim();

      // Extract genres - ПРАВИЛЬНЫЕ СЕЛЕКТОРЫ из HTML
      const genres: string[] = [];
      $main('.tags__item').each((_, element) => {
        const $element = $main(element);
        const genre = $element.text().trim();
        const elementClass = $element.attr('class') || '';

        // Исключаем кнопку "еще теги"
        if (
          genre &&
          !genre.includes('+') &&
          !elementClass.includes('tags__item-more')
        ) {
          genres.push(genre);
        }
      });

      // Extract manga ID from HTML markup
      const mangaId = $main('.manga').attr('data-id');

      // Собираем cookies из ответа для последующих POST-запросов (chapters/load)
      const cookieHeader = this.getCookieHeaderFromResponse(mainResponse);

      // Extract chapters
      const chapters = await this.extractChapters(
        $main,
        this.session,
        mangaId || '',
        cookieHeader,
      );

      return {
        title: title || url,
        alternativeTitles:
          alternativeTitles.length > 0 ? alternativeTitles : undefined,
        description: description || undefined,
        coverUrl: absoluteCoverUrl || undefined,
        genres: genres.length > 0 ? genres : undefined,
        chapters,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to parse mangabuff.ru: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /** Извлекает HTML списка глав из ответа /chapters/load */
  private getChaptersHtmlFromResponse(response: { data?: unknown }): string | null {
    if (!response.data || typeof response.data !== 'object') return null;
    const content = (response.data as { content?: unknown }).content ?? response.data;
    return typeof content === 'string' ? content : null;
  }

  /** Формирует заголовок Cookie из ответа axios для последующих запросов */
  private getCookieHeaderFromResponse(response: { headers: Record<string, unknown> }): string {
    const setCookie = response.headers['set-cookie'];
    if (!setCookie) return '';
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    return list
      .map((h: unknown) => (typeof h === 'string' ? h : '').split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }

  private async extractChapters(
    $: cheerio.Root,
    session: AxiosInstance,
    mangaId: string,
    cookieHeader: string,
  ): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];

    // Сначала парсим главы с основной страницы (первые ~100)
    $('.chapters__item').each((_, element) => {
      const chapter = this.parseChapterElement($, element);
      if (chapter) {
        chapters.push(chapter);
      }
    });

    // Если есть mangaId, подгружаем остальные главы через POST /chapters/load
    if (mangaId) {
      const csrfToken = $('meta[name="csrf-token"]').attr('content') || '';
      const baseHeaders = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrfToken,
        Referer: 'https://mangabuff.ru',
        Origin: 'https://mangabuff.ru',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      };

      // Запрашиваем дополнительные порции: сначала пробуем offset (100, 200, ...)
      let offset = chapters.length;
      let hasMoreChapters = true;
      let offsetEverReturnedChapters = false;

      while (hasMoreChapters) {
        try {
          const response = await session.post(
            'https://mangabuff.ru/chapters/load',
            new URLSearchParams({ manga_id: mangaId, offset: String(offset) }),
            { headers: baseHeaders },
          );

          const htmlContent = this.getChaptersHtmlFromResponse(response);
          if (htmlContent === null) {
            hasMoreChapters = false;
            break;
          }

          const $chapters = cheerio.load(htmlContent);
          let newChaptersCount = 0;
          $chapters('.chapters__item').each((_, element) => {
            const chapter = this.parseChapterElement($chapters, element);
            if (chapter && !chapters.some((c) => c.url === chapter.url)) {
              chapters.push(chapter);
              newChaptersCount++;
            }
          });

          if (newChaptersCount > 0) offsetEverReturnedChapters = true;
          if (newChaptersCount === 0) hasMoreChapters = false;
          else offset += newChaptersCount;
        } catch (error) {
          console.error(
            `Error loading additional chapters (offset ${offset}):`,
            error,
          );
          hasMoreChapters = false;
        }
      }

      // Если по offset ничего не пришло (API может ждать page), пробуем page=2, 3, ...
      if (!offsetEverReturnedChapters) {
        let page = 2;
        let pageHasMore = true;
        while (pageHasMore) {
          try {
            const response = await session.post(
              'https://mangabuff.ru/chapters/load',
              new URLSearchParams({ manga_id: mangaId, page: String(page) }),
              { headers: baseHeaders },
            );
            const htmlContent = this.getChaptersHtmlFromResponse(response);
            if (htmlContent === null) {
              pageHasMore = false;
              break;
            }
            const $chapters = cheerio.load(htmlContent);
            let added = 0;
            $chapters('.chapters__item').each((_, element) => {
              const chapter = this.parseChapterElement($chapters, element);
              if (chapter && !chapters.some((c) => c.url === chapter.url)) {
                chapters.push(chapter);
                added++;
              }
            });
            if (added === 0) pageHasMore = false;
            else page++;
          } catch {
            pageHasMore = false;
          }
        }
      }
    }

    // Если не нашли главы в основном списке, пробуем горячие главы
    if (chapters.length === 0) {
      $('.hot-chapters__item').each((_, element) => {
        const $element = $(element);
        const href = $element.attr('href');
        const chapterNumber = $element
          .find('.hot-chapters__number')
          .text()
          .trim();

        if (href && chapterNumber) {
          const absoluteUrl = href.startsWith('http')
            ? href
            : new URL(href, 'https://mangabuff.ru').href;

          const parsedNumber = parseFloat(chapterNumber);
          if (!isNaN(parsedNumber)) {
            chapters.push({
              name: `Глава ${chapterNumber}`,
              url: absoluteUrl,
              number: parsedNumber,
            });
          }
        }
      });
    }

    // Сортируем главы по номеру (от старых к новым)
    chapters.sort((a, b) => {
      if (a.number !== undefined && b.number !== undefined) {
        return a.number - b.number;
      }
      return 0;
    });

    return chapters;
  }
  // Вспомогательный метод для парсинга элемента главы
  private parseChapterElement(
    $: cheerio.Root,
    element: cheerio.Element,
  ): ChapterInfo | null {
    const $element = $(element);
    const href = $element.attr('href');

    if (!href) {
      return null;
    }

    // Convert relative URL to absolute
    const absoluteUrl = href.startsWith('http')
      ? href
      : new URL(href, 'https://mangabuff.ru').href;

    // Extract chapter number from data attribute
    const chapterNumberStr = $element.attr('data-chapter');
    let number: number | undefined;

    if (chapterNumberStr) {
      const parsedNumber = parseFloat(chapterNumberStr);
      if (!isNaN(parsedNumber)) {
        number = parsedNumber;
      }
    }

    // Extract chapter name components
    const chapterValue = $element.find('.chapters__value').text().trim();
    const chapterName = $element.find('.chapters__name').text().trim();

    // Build chapter name
    let name = chapterName;
    if (!name && chapterValue) {
      name = chapterValue;
    }
    if (!name && number) {
      name = `Глава ${number}`;
    }
    if (!name) {
      name = 'Без названия';
    }

    return {
      name,
      url: absoluteUrl,
      number,
    };
  }

  private extractAlternativeTitles($: cheerio.Root): string[] {
    const alternativeTitles: string[] = [];

    // ПРАВИЛЬНЫЙ СЕЛЕКТОР для альтернативных названий из HTML
    $('h3.manga__name-alt span').each((_, element) => {
      const title = $(element).text().trim();
      if (title) {
        alternativeTitles.push(title);
      }
    });

    // Also check meta tags
    $('meta[property="og:title"]').each((_, element) => {
      const title = $(element).attr('content');
      if (title && title !== $('h1.manga__name').text().trim()) {
        alternativeTitles.push(title);
      }
    });

    return [...new Set(alternativeTitles)]; // Remove duplicates
  }
}
