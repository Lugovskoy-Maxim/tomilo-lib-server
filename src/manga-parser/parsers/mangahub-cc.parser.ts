import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

@Injectable()
export class MangahubCcParser implements MangaParser {
  private session: AxiosInstance;

  constructor() {
    this.session = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  async parse(url: string): Promise<ParsedMangaData> {
    try {
      console.log(`Parsing MangaHub.cc URL: ${url}`);

      // Загружаем основную страницу
      const { data: html } = await this.session.get(url);
      const $ = cheerio.load(html);

      // Извлекаем данные из HTML
      const title = this.extractTitle($);
      const alternativeTitles = this.extractAlternativeTitles($);
      const description = this.extractDescription($);
      const coverUrl = this.extractCoverUrl($);
      const genres = this.extractGenres($);

      console.log(`Title: ${title}`);
      console.log(`Found ${genres.length} genres`);
      console.log(`Found cover URL: ${coverUrl}`);

      // Получаем главы
      const chapters = this.getChapters(url, $);
      console.log(`Found ${chapters.length} chapters`);

      return {
        title,
        alternativeTitles,
        description,
        coverUrl,
        genres,
        chapters,
      };
    } catch (error) {
      console.error('Error parsing MangaHub.cc:', error);
      throw new BadRequestException(
        `Failed to parse MangaHub.cc: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private extractTitle($: cheerio.Root): string {
    // Извлекаем название из .title_head_name
    let title = $('.title_head_name').text().trim();
    console.log(`Title from .title_head_name: ${title}`);

    if (!title) {
      // Альтернативный способ - из meta title
      const content = $('meta[property="og:title"]').attr('content');
      title = content ? content : '';
      console.log(`Title from og:title: ${title}`);
    }

    // Убираем лишний текст из meta-тега
    title = title
      .replace('Читать мангу', '')
      .replace('онлайн', '')
      .replace('..', '')
      .replace(' - читать онлайн', '')
      .trim();

    console.log(`Final title: ${title}`);
    return title || 'Неизвестное название';
  }

  private extractAlternativeTitles($: cheerio.Root): string[] {
    const alternatives: string[] = [];

    // Извлекаем альтернативные названия из .title_head_additional_info
    // Обычно это текст после основного названия
    const additionalInfo = $('.title_head_additional_info')
      .first()
      .text()
      .trim();
    if (additionalInfo && additionalInfo.includes('/')) {
      // Разделяем по слэшу и берем вторую часть
      const parts = additionalInfo.split('/');
      if (parts.length > 1) {
        const altTitle = parts[1].trim();
        if (altTitle && altTitle !== additionalInfo) {
          alternatives.push(altTitle);
          console.log(`Alternative title from additional info: ${altTitle}`);
        }
      }
    }

    // Также проверяем meta-теги
    const altFromMeta = $('meta[name="description"]').attr('content');
    if (altFromMeta && altFromMeta.includes('(')) {
      const match = altFromMeta.match(/\(([^)]+)\)/);
      if (match) {
        alternatives.push(match[1]);
        console.log(`Alternative from meta: ${match[1]}`);
      }
    }

    return [...new Set(alternatives.filter(Boolean))]; // Убираем дубликаты
  }

  private extractDescription($: cheerio.Root): string | undefined {
    // Извлекаем описание из .title_head_description
    let description = $('.title_head_description').text().trim();

    if (!description) {
      // Пробуем найти в schema.org
      const scriptContent = $('script[type="application/ld+json"]').html();
      if (scriptContent) {
        try {
          const schema = JSON.parse(scriptContent);
          if (schema.description) {
            description = schema.description.trim();
          }
        } catch (error) {
          console.log(`Could not parse schema.org for description ${error}`);
        }
      }
    }

    if (!description) {
      description = $('meta[property="og:description"]').attr('content') || '';
      description = description.trim();
    }

    console.log(`Description length: ${description?.length || 0}`);
    return description && description.length > 0 ? description : undefined;
  }

  private extractCoverUrl($: cheerio.Root): string | undefined {
    // Извлекаем обложку из .lazy_load_poster.title_image
    let coverUrl = $('.lazy_load_poster.title_image').attr('data-src');
    console.log(`Cover from .lazy_load_poster.title_image: ${coverUrl}`);

    if (!coverUrl) {
      // Альтернативный способ
      coverUrl =
        $('.title_image').attr('data-src') || $('.title_image').attr('src');
      console.log(`Cover from .title_image: ${coverUrl}`);
    }

    if (!coverUrl) {
      coverUrl = $('meta[property="og:image"]').attr('content');
      console.log(`Cover from og:image: ${coverUrl}`);
    }

    // Преобразуем относительный URL в абсолютный
    if (coverUrl && !coverUrl.startsWith('http')) {
      if (coverUrl.startsWith('//')) {
        coverUrl = 'https:' + coverUrl;
      } else if (coverUrl.startsWith('/')) {
        coverUrl = 'https://mangahub.cc' + coverUrl;
      }
    }

    return coverUrl || undefined;
  }

  private extractGenres($: cheerio.Root): string[] {
    const genres: string[] = [];

    // Жанры из .title_head_genres_element
    $('.title_head_genres_element a').each((i, elem) => {
      const genre = $(elem).text().trim();
      if (genre) {
        genres.push(genre);
        console.log(`Genre from .title_head_genres_element: ${genre}`);
      }
    });

    // Убираем дубликаты
    return [...new Set(genres.filter(Boolean))];
  }

  private getChapters(url: string, $: cheerio.Root): ChapterInfo[] {
    const chapters: ChapterInfo[] = [];
    const baseUrl = new URL(url).origin;

    console.log(`Base URL for chapters: ${baseUrl}`);

    try {
      // Извлекаем главы из .chapter_block
      $('.chapter_block').each((i, chapterElement) => {
        this.parseChapterElement($(chapterElement), baseUrl, chapters, i);
      });

      console.log(`Found ${chapters.length} chapters from .chapter_block`);
    } catch (error) {
      console.error('Error in getChapters:', error);
    }

    console.log(`Total chapters found: ${chapters.length}`);

    // Сортируем по номеру главы (в порядке убывания - последняя глава первая)
    return chapters.sort((a, b) => (b.number || 0) - (a.number || 0));
  }

  private parseChapterElement(
    chapter$: cheerio.Cheerio,
    baseUrl: string,
    chapters: ChapterInfo[],
    index: number,
  ): void {
    try {
      // Извлекаем ссылку на главу
      const chapterLink = chapter$.find('a.tap_highlight_remove');
      const chapterHref = chapterLink.attr('href');

      if (chapterHref) {
        // Извлекаем номер главы из data-chapter-number
        const chapterNumber = parseInt(
          chapter$.attr('data-chapter-number') || '',
          10,
        );

        // Извлекаем текст главы
        const chapterText = chapter$.find('.chapter_number').text().trim();

        if (chapterNumber && !isNaN(chapterNumber)) {
          // Извлекаем slug из URL (например, /manga/SSS-level-Paladin-beyond-common-sense/v1/c94)
          const urlMatch = chapterHref.match(/\/manga\/([^/]+)\/v\d+\/c\d+/);
          const slug = urlMatch ? urlMatch[1] : null;

          if (slug) {
            chapters.push({
              name: chapterText || `Глава ${chapterNumber}`,
              slug: `${slug}-c${chapterNumber}`, // Создаем уникальный slug
              number: chapterNumber,
              url: chapterHref.startsWith('http')
                ? chapterHref
                : baseUrl + chapterHref,
            });

            console.log(`Parsed chapter: ${chapterNumber} - ${chapterText}`);
          }
        }
      }
    } catch (error) {
      console.warn(`Error parsing chapter element at index ${index}:`, error);
    }
  }
}
