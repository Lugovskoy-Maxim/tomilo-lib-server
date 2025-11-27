import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

@Injectable()
export class MangaShiParser implements MangaParser {
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
        $main('.post-title h1').text().trim() ||
        $main('.post-title').text().trim() ||
        url;

      // Extract cover URL
      const coverUrl =
        $main('.summary_image img').attr('data-src') ||
        $main('.summary_image img').attr('src') ||
        $main('.summary_image a img').attr('data-src') ||
        $main('.summary_image a img').attr('src') ||
        $main('.thumb img').attr('data-src') ||
        $main('.thumb img').attr('src');

      // Extract description
      const description =
        $main('.summary__content .post-content').text().trim() ||
        $main('.summary .post-content').text().trim() ||
        $main('.description').text().trim() ||
        $main('.manga-summary').text().trim();

      // Extract genres
      const genres: string[] = [];
      $main('.genres-content a, .genre a, .mg_genres a').each((_, element) => {
        const genre = $main(element).text().trim();
        if (genre) {
          genres.push(genre);
        }
      });

      // Try to get chapters via AJAX first (as per user's example)
      let chapters: ChapterInfo[] = await this.fetchChaptersViaAjax(url);

      // If AJAX failed, try to extract from main page
      if (chapters.length === 0) {
        chapters = this.extractChaptersFromHtml($main);
      }

      // Reverse to have chapters in ascending order
      chapters.reverse();

      return {
        title,
        description: description || undefined,
        coverUrl: coverUrl || undefined,
        genres: genres.length > 0 ? genres : undefined,
        chapters,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to parse manga-shi.org: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async fetchChaptersViaAjax(url: string): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];

    try {
      // Extract manga slug from URL
      const urlMatch = url.match(/\/manga\/([^/]+)\/?/);
      if (!urlMatch) {
        return chapters;
      }

      const slug = urlMatch[1];
      const ajaxUrl = `https://manga-shi.org/manga/${slug}/ajax/chapters/`;

      console.log('Trying AJAX URL:', ajaxUrl);

      // Make POST request to get chapters with proper headers
      const chaptersResponse = await this.session.post(ajaxUrl, null, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Referer: url,
          Origin: 'https://manga-shi.org',
          Accept: '*/*',
          'Content-Length': '0',
        },
      });

      console.log('AJAX response status:', chaptersResponse.status);

      if (chaptersResponse.status !== 200) {
        return chapters;
      }

      const $chapters = cheerio.load(chaptersResponse.data);

      // Extract chapters from AJAX response
      $chapters('li.wp-manga-chapter').each((_, element) => {
        const chapterElement = $chapters(element);
        const linkElement = chapterElement.find('a');

        const name = linkElement.text().trim();
        const link = linkElement.attr('href');

        if (name && link) {
          // Extract chapter number from name or URL
          let number: number | undefined;

          // Try to extract from name (e.g., "Глава 274")
          const nameMatch = name.match(/(?:Глава|Chapter)\s*(\d+)/i);
          if (nameMatch) {
            number = parseInt(nameMatch[1], 10);
          } else {
            // Try to extract from URL (e.g., "/glava-274/")
            const urlMatch = link.match(/\/(?:glava|chapter)-(\d+)\//i);
            if (urlMatch) {
              number = parseInt(urlMatch[1], 10);
            }
          }

          // Extract slug from URL for image downloading
          const slugMatch = link.match(/\/manga\/[^/]+\/(.+)\/$/);
          const slug = slugMatch ? slugMatch[1] : undefined;

          chapters.push({
            name,
            url: link,
            number,
            slug, // Add slug for image downloading
          });
        }
      });

      console.log(`Found ${chapters.length} chapters via AJAX`);
    } catch (ajaxError) {
      console.warn(
        'AJAX chapters fetch failed:',
        ajaxError instanceof Error ? ajaxError.message : 'Unknown error',
      );
    }

    return chapters;
  }

  private extractChaptersFromHtml($: cheerio.Root): ChapterInfo[] {
    const chapters: ChapterInfo[] = [];

    // Try different selectors for chapters on main page
    const chapterSelectors = [
      'li.wp-manga-chapter a',
      '.wp-manga-chapter a',
      '.chapter-item a',
      '.chapter-list li a',
      '.listing-chapters_wrap ul li a',
    ];

    for (const selector of chapterSelectors) {
      const elements = $(selector);
      console.log(`Selector "${selector}" found ${elements.length} elements`);

      elements.each((_, element) => {
        const name = $(element).text().trim();
        const link = $(element).attr('href');

        if (
          name &&
          link &&
          (link.includes('/glava/') || link.includes('/chapter/'))
        ) {
          // Extract chapter number
          let number: number | undefined;

          const nameMatch = name.match(/(?:Глава|Chapter)\s*(\d+)/i);
          if (nameMatch) {
            number = parseInt(nameMatch[1], 10);
          } else {
            const urlMatch = link.match(/\/(?:glava|chapter)-(\d+)\//i);
            if (urlMatch) {
              number = parseInt(urlMatch[1], 10);
            }
          }

          // Extract slug from URL for image downloading
          const slugMatch = link.match(/\/manga\/[^/]+\/(.+)\/$/);
          const slug = slugMatch ? slugMatch[1] : undefined;

          chapters.push({ name, url: link, number, slug });
        }
      });

      if (chapters.length > 0) break;
    }

    console.log(`Found ${chapters.length} chapters from main page`);
    return chapters;
  }
}
