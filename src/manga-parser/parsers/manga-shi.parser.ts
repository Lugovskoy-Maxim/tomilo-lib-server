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
      const response = await this.session.get(url);
      const $ = cheerio.load(response.data);

      const title = $('.post-title').text().trim() || url;

      const chapters: ChapterInfo[] = [];
      $('ul.main.version-chap.no-volumn li.wp-manga-chapter a').each(
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
