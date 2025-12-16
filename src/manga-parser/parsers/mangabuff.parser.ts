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

      // Extract title
      const title =
        $main('h1.title').text().trim() ||
        $main('.manga-title').text().trim() ||
        url;

      // Extract alternative titles
      const alternativeTitles = this.extractAlternativeTitles($main);

      // Extract cover URL
      const coverUrl =
        $main('.manga-cover img').attr('src') ||
        $main('.cover img').attr('src');

      // Extract description
      const description =
        $main('.description').text().trim() ||
        $main('.manga-description').text().trim();

      // Extract genres
      const genres: string[] = [];
      $main('.genres a, .tags a').each((_, element) => {
        const genre = $main(element).text().trim();
        if (genre) {
          genres.push(genre);
        }
      });

      // Extract chapters
      const chapters = this.extractChapters($main, url);

      return {
        title,
        alternativeTitles:
          alternativeTitles.length > 0 ? alternativeTitles : undefined,
        description: description || undefined,
        coverUrl: coverUrl || undefined,
        genres: genres.length > 0 ? genres : undefined,
        chapters,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to parse mangabuff.ru: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private extractChapters($: cheerio.Root, baseUrl: string): ChapterInfo[] {
    const chapters: ChapterInfo[] = [];

    // Target the chapters-list div
    $('.chapters-list a').each((_, element) => {
      const linkElement = $(element);
      const href = linkElement.attr('href');
      const name = linkElement.text().trim();

      if (href && name) {
        // Convert relative URL to absolute
        const absoluteUrl = href.startsWith('http')
          ? href
          : new URL(href, baseUrl).href;

        // Extract chapter number from name (e.g., "Глава 1080")
        let number: number | undefined;
        const nameMatch = name.match(/(?:Глава|Chapter)\s*(\d+(?:\.\d+)?)/i);
        if (nameMatch) {
          const parsedNumber = parseFloat(nameMatch[1]);
          if (!isNaN(parsedNumber)) {
            number = parsedNumber;
          }
        } else {
          // Try to extract from URL (e.g., "/manga/title/1080")
          const urlMatch = absoluteUrl.match(/\/(\d+(?:\.\d+)?)\/?$/);
          if (urlMatch) {
            const parsedNumber = parseFloat(urlMatch[1]);
            if (!isNaN(parsedNumber)) {
              number = parsedNumber;
            }
          }
        }

        chapters.push({
          name,
          url: absoluteUrl,
          number,
        });
      }
    });

    // Reverse to have chapters in ascending order
    chapters.reverse();

    // Если не найдено глав, попробуем альтернативный способ
    if (chapters.length === 0) {
      // Попробуем найти главы в другом формате
      $('.chapter-item, .chapter-row, .ch-item').each((_, element) => {
        const chapterElement = $(element);
        const linkElement = chapterElement.find('a');
        const href = linkElement.attr('href');
        const name = linkElement.text().trim() || chapterElement.text().trim();

        if (href && name) {
          // Convert relative URL to absolute
          const absoluteUrl = href.startsWith('http')
            ? href
            : new URL(href, baseUrl).href;

          // Extract chapter number from name
          let number: number | undefined;
          const nameMatch = name.match(/(?:Глава|Chapter)\s*(\d+(?:\.\d+)?)/i);
          if (nameMatch) {
            const parsedNumber = parseFloat(nameMatch[1]);
            if (!isNaN(parsedNumber)) {
              number = parsedNumber;
            }
          } else {
            // Try to extract from URL
            const urlMatch = absoluteUrl.match(/\/(\d+(?:\.\d+)?)\/?$/);
            if (urlMatch) {
              const parsedNumber = parseFloat(urlMatch[1]);
              if (!isNaN(parsedNumber)) {
                number = parsedNumber;
              }
            }
          }

          chapters.push({
            name,
            url: absoluteUrl,
            number,
          });
        }
      });
    }

    return chapters;
  }

  private extractAlternativeTitles($: cheerio.Root): string[] {
    const alternativeTitles: string[] = [];

    // Try common selectors for alternative titles
    $('.alternative-title, .manga-alternative, .alt-title').each(
      (_, element) => {
        const title = $(element).text().trim();
        if (title) {
          alternativeTitles.push(title);
        }
      },
    );

    // Also try to extract from meta tags or other common places
    $(
      'meta[name="alternative-title"], meta[property="og:alternative-title"]',
    ).each((_, element) => {
      const title = $(element).attr('content');
      if (title) {
        alternativeTitles.push(title);
      }
    });

    return alternativeTitles;
  }
}
