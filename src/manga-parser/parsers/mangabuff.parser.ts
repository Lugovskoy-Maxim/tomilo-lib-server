import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

@Injectable()
export class MangabuffParser implements MangaParser {
  private session: AxiosInstance;

  constructor() {
    this.session = axios.create({
      timeout: 20000,
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

      // Extract chapters
      const chapters = await this.extractChapters(
        $main,
        this.session,
        mangaId || '',
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

  private async extractChapters(
    $: cheerio.Root,
    session: AxiosInstance,
    mangaId: string,
  ): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];

    // First, try to extract chapters from the initial HTML
    $('.chapters__item').each((_, element) => {
      const chapter = this.parseChapterElement($, element);
      if (chapter) {
        chapters.push(chapter);
      }
    });

    // Try to load ALL chapters in ONE request without pagination
    try {
      const response = await session.post(
        'https://mangabuff.ru/chapters/load',
        {
          manga_id: mangaId, // Only manga_id
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: 'https://mangabuff.ru',
          },
        },
      );

      const data = response.data;
      let chaptersData: any[] = [];
      if (Array.isArray(data)) {
        chaptersData = data;
      } else if (data.chapters && Array.isArray(data.chapters)) {
        chaptersData = data.chapters;
      }

      for (const chap of chaptersData) {
        const absoluteUrl = chap.url.startsWith('http')
          ? chap.url
          : new URL(chap.url, 'https://mangabuff.ru').href;

        const chapter: ChapterInfo = {
          name:
            chap.name ||
            (chap.number ? `Глава ${chap.number}` : 'Без названия'),
          url: absoluteUrl,
          number: chap.number ? parseFloat(chap.number) : undefined,
        };

        // Check if chapter already exists by URL
        const exists = chapters.some((c) => c.url === chapter.url);
        if (!exists) {
          chapters.push(chapter);
        }
      }
    } catch (error) {
      console.error('Error loading chapters:', error);
      // If there's an error, fall back to the chapters we already have
    }

    // Если не нашли главы в основном списке, попробуем горячие главы
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

    // Sort chapters by number if available (ascending order - oldest to newest)
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
