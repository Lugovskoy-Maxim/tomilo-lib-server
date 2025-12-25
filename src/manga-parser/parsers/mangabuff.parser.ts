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

    // Сначала парсим главы с основной страницы
    $('.chapters__item').each((_, element) => {
      const chapter = this.parseChapterElement($, element);
      if (chapter) {
        chapters.push(chapter);
      }
    });

    // Если есть mangaId, загружаем дополнительные главы
    if (mangaId) {
      let page = 1;
      let hasMoreChapters = true;

      while (hasMoreChapters) {
        try {
          // Получаем CSRF-токен из meta-тега
          const csrfToken = $('meta[name="csrf-token"]').attr('content');

          const response = await session.post(
            'https://mangabuff.ru/chapters/load',
            new URLSearchParams({
              manga_id: mangaId,
              page: page.toString(), // Добавляем параметр страницы
            }),
            {
              headers: {
                'Content-Type':
                  'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': csrfToken || '',
                Referer: 'https://mangabuff.ru',
                Origin: 'https://mangabuff.ru',
              },
            },
          );

          // Парсим HTML из ответа
          if (response.data && typeof response.data === 'object') {
            // Ответ может быть объектом с полем content
            const htmlContent = response.data.content || response.data;

            if (typeof htmlContent === 'string') {
              const $chapters = cheerio.load(htmlContent);

              // Всегда продолжаем загрузку, так как нет кнопки "Загрузить еще"
              // Просто проверяем, были ли добавлены новые главы
              let newChaptersCount = 0;
              $chapters('.chapters__item').each((_, element) => {
                const chapter = this.parseChapterElement($chapters, element);
                if (chapter) {
                  // Проверяем, нет ли уже такой главы
                  const exists = chapters.some((c) => c.url === chapter.url);
                  if (!exists) {
                    chapters.push(chapter);
                    newChaptersCount++;
                  }
                }
              });

              // Если не добавили новых глав, прекращаем загрузку
              if (newChaptersCount === 0) {
                hasMoreChapters = false;
              } else {
                // Переходим к следующей странице
                page++;
              }

              // Переходим к следующей странице
            } else {
              // Если ответ не строка, прекращаем загрузку
              hasMoreChapters = false;
            }
          } else {
            // Если ответ пустой, прекращаем загрузку
            hasMoreChapters = false;
          }
        } catch (error) {
          console.error(
            `Error loading additional chapters (page ${page}):`,
            error,
          );
          // Продолжаем работу с главами, которые уже есть
          hasMoreChapters = false;
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
