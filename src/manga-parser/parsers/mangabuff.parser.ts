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

    // Try multiple selectors for chapters
    const chapterSelectors = [
      '.chapters-list a',
      '.chapter-list a',
      '.manga-chapters a',
      '.chapters a',
      '.chapter-item a',
      '.chapter-row a',
      '.ch-item a',
      'a[href*="/chapter/"]',
      'a[href*="/glava/"]',
      '.chapter-link',
      '.chapter-title a',
    ];

    // Try each selector
    for (const selector of chapterSelectors) {
      $(selector).each((_, element) => {
        const linkElement = $(element);
        const href = linkElement.attr('href');
        const name = linkElement.text().trim();

        // Skip if we already have this chapter
        if (chapters.some((chapter) => chapter.name === name)) {
          return;
        }

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

      // If we found chapters, break the loop
      if (chapters.length > 0) {
        break;
      }
    }

    // If still no chapters found, try a more general approach
    if (chapters.length === 0) {
      // Look for any links that might be chapters
      $('a').each((_, element) => {
        const linkElement = $(element);
        const href = linkElement.attr('href');
        const name = linkElement.text().trim();

        // Check if this looks like a chapter link
        if (
          href &&
          name &&
          (href.includes('/chapter/') ||
            href.includes('/glava/') ||
            name.match(/(?:Глава|Chapter)\s*\d+/i))
        ) {
          // Skip if we already have this chapter
          if (chapters.some((chapter) => chapter.name === name)) {
            return;
          }

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

    // Sort chapters by number if available, otherwise by name
    chapters.sort((a, b) => {
      if (a.number !== undefined && b.number !== undefined) {
        return a.number - b.number;
      }
      return a.name.localeCompare(b.name);
    });

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
