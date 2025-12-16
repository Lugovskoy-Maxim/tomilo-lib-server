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

      // Extract manga ID
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      const mangaSlug = pathSegments[1];
      const mangaId = mangaSlug.split('-')[0];

      // Extract chapters
      const chapters = await this.extractChapters(this.session, mangaId);

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
    session: AxiosInstance,
    mangaId: string,
  ): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      try {
        const response = await session.post(
          'https://mangabuff.ru/chapters/load',
          {
            manga_id: mangaId,
            offset,
            limit,
          },
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
            },
          },
        );

        const data = response.data;
        if (!data.content) break;

        const $ = cheerio.load(data.content);

        // Parse chapters from the loaded HTML
        $('.chapters__item').each((_, element) => {
          const $element = $(element);
          const href = $element.attr('href');

          if (href) {
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
            const chapterValue = $element
              .find('.chapters__value')
              .text()
              .trim();
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

            chapters.push({
              name,
              url: absoluteUrl,
              number,
            });
          }
        });

        // If no chapters were added in this batch, stop
        if ($('.chapters__item').length === 0) break;

        offset += limit;
      } catch {
        // If there's an error (e.g., no more pages), stop
        break;
      }
    }

    // Sort chapters by number if available
    chapters.sort((a, b) => {
      if (a.number !== undefined && b.number !== undefined) {
        return a.number - b.number;
      }
      return 0;
    });

    return chapters;
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
