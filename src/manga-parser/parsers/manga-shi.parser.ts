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
      // First, get the main page to extract title
      const mainResponse = await this.session.get(url);
      const $main = cheerio.load(mainResponse.data);
      const title = $main('.post-title').text().trim() || url;

      // Extract manga slug from URL
      const urlMatch = url.match(/\/manga\/([^/]+)\//);
      if (!urlMatch) {
        throw new BadRequestException('Invalid manga URL format');
      }
      const slug = urlMatch[1];

      // Construct AJAX URL for chapters
      const ajaxUrl = `https://manga-shi.org/manga/${slug}/ajax/chapters/?t=1`;

      // Make POST request to get chapters
      const chaptersResponse = await this.session.post(ajaxUrl, null, {
        headers: {
          Referer: url,
          'X-Requested-With': 'XMLHttpRequest',
          Origin: 'https://manga-shi.org',
        },
      });

      const $chapters = cheerio.load(chaptersResponse.data);

      const chapters: ChapterInfo[] = [];
      $chapters('ul.main.version-chap.no-volumn li.wp-manga-chapter a').each(
        (_, element) => {
          const name = $(element).text().trim();
          const link = $(element).attr('href');
          if (name && link) {
            // Extract chapter number from name like "Глава 67"
            const match = name.match(/Глава (\d+)/);
            const number = match ? parseInt(match[1], 10) : undefined;
            chapters.push({ name, url: link, number });
          }
        },
      );

      chapters.reverse();

      return {
        title,
        chapters,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to parse manga-shi.org: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
