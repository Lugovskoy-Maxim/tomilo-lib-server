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
      const title = $main('.post-title').text().trim() || url;

      // Extract cover URL
      const coverUrl =
        $main('.summary_image img').attr('src') ||
        $main('.summary_image a img').attr('src') ||
        $main('.thumb img').attr('src');

      // Extract description
      const description =
        $main('.summary .post-content').text().trim() ||
        $main('.description').text().trim() ||
        $main('.manga-summary').text().trim();

      // Extract genres
      const genres: string[] = [];
      $main('.genres-content a, .genre a').each((_, element) => {
        const genre = $main(element).text().trim();
        if (genre) {
          genres.push(genre);
        }
      });

      // Extract chapters from main page
      const chapters: ChapterInfo[] = [];
      $main('ul.main.version-chap.no-volumn li.wp-manga-chapter a').each(
        (_, element) => {
          const name = $main(element).text().trim();
          const link = $main(element).attr('href');
          if (name && link) {
            // Extract chapter number from name like "Глава 67"
            const match = name.match(/Глава (\d+)/);
            const number = match ? parseInt(match[1], 10) : undefined;
            chapters.push({ name, url: link, number });
          }
        },
      );

      // If no chapters found on main page, try AJAX fallback
      if (chapters.length === 0) {
        // Extract manga slug from URL
        const urlMatch = url.match(/\/manga\/([^/]+)\//);
        if (urlMatch) {
          const slug = urlMatch[1];
          // Construct AJAX URL for chapters
          const ajaxUrl = `https://manga-shi.org/manga/${slug}/ajax/chapters/?t=1`;

          try {
            // Make GET request to get chapters (changed from POST)
            const chaptersResponse = await this.session.get(ajaxUrl, {
              headers: {
                Referer: url,
                'X-Requested-With': 'XMLHttpRequest',
                Origin: 'https://manga-shi.org',
              },
            });

            const $chapters = cheerio.load(chaptersResponse.data);
            $chapters(
              'ul.main.version-chap.no-volumn li.wp-manga-chapter a',
            ).each((_, element) => {
              const name = $chapters(element).text().trim();
              const link = $chapters(element).attr('href');
              if (name && link) {
                // Extract chapter number from name like "Глава 67"
                const match = name.match(/Глава (\d+)/);
                const number = match ? parseInt(match[1], 10) : undefined;
                chapters.push({ name, url: link, number });
              }
            });
          } catch (ajaxError) {
            // AJAX failed, continue with empty chapters
            console.warn(
              'AJAX chapters fetch failed:',
              ajaxError instanceof Error ? ajaxError.message : 'Unknown error',
            );
          }
        }
      }

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
}
