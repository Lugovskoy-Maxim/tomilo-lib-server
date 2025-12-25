import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

@Injectable()
export class MangahubParser implements MangaParser {
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
      // Загружаем основную страницу
      const { data: html } = await this.session.get(url);
      const $ = cheerio.load(html);

      // Извлекаем данные из HTML
      const title = this.extractTitle($);
      const alternativeTitles = this.extractAlternativeTitles($);
      const description = this.extractDescription($);
      const coverUrl = this.extractCoverUrl($);
      const genres = this.extractGenres($);

      // Получаем главы
      const chapters = await this.getChapters(url, $);

      return {
        title,
        alternativeTitles,
        description,
        coverUrl,
        genres,
        chapters,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to parse MangaHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private extractTitle($: cheerio.Root): string {
    // Пытаемся получить название из нескольких мест
    let title = $('h1').text().trim();
    if (!title) {
      title = $('.text-line-clamp.fs-5.fw-bold').text().trim();
    }
    if (!title) {
      title = $('meta[property="og:title"]').attr('content') || '';
      // Убираем лишний текст из meta-тега
      title = title
        .replace('Читать', '')
        .replace('Манга онлайн', '')
        .replace('..', '')
        .trim();
    }
    return title || 'Неизвестное название';
  }

  private extractAlternativeTitles($: cheerio.Root): string[] {
    const alternatives: string[] = [];

    // Ищем в offcanvas с alternative names
    $('#another-names .offcanvas-body div.mt-1').each((i, elem) => {
      if (i > 1) {
        // Пропускаем первые два (русское и английское)
        alternatives.push($(elem).text().trim());
      }
    });

    // Также проверяем meta-теги
    const altFromMeta = $('meta[name="description"]').attr('content');
    if (altFromMeta && altFromMeta.includes('(')) {
      const match = altFromMeta.match(/\(([^)]+)\)/);
      if (match) alternatives.push(match[1]);
    }

    return alternatives.filter(Boolean);
  }

  private extractDescription($: cheerio.Root): string | undefined {
    const description = $('.markdown-style.text-expandable-content')
      .text()
      .trim();
    return description || undefined;
  }

  private extractCoverUrl($: cheerio.Root): string | undefined {
    let coverUrl = $('img.cover-detail').attr('src');
    if (!coverUrl) {
      coverUrl = $('img.cover').attr('src');
    }
    if (!coverUrl) {
      coverUrl = $('meta[property="og:image"]').attr('content');
    }
    return coverUrl || undefined;
  }

  private extractGenres($: cheerio.Root): string[] {
    const genres: string[] = [];

    // Жанры из tags
    $('collapse-multiple.tags a.tag').each((i, elem) => {
      genres.push($(elem).text().trim());
    });

    // Жанры из атрибутов
    $('.detail-attrs .attr').each((i, elem) => {
      const attrName = $(elem).find('.attr-name').text().trim();
      if (attrName.includes('Жанр') || attrName.includes('Жанры')) {
        $(elem)
          .find('.attr-value a')
          .each((j, genreElem) => {
            genres.push($(genreElem).text().trim());
          });
      }
    });

    return [...new Set(genres)]; // Убираем дубликаты
  }

  private async getChapters(
    url: string,
    $: cheerio.Root,
  ): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];

    try {
      // Пытаемся получить ссылку на страницу с главами
      const chaptersHref = $('a[href*="/chapters"]').attr('href');
      let chaptersUrl = chaptersHref;

      if (chaptersHref && !chaptersHref.startsWith('http')) {
        const baseUrl = new URL(url).origin;
        chaptersUrl = baseUrl + chaptersHref;
      }

      // Загружаем страницу с главами, если ссылка найдена
      let chapters$ = $;
      if (chaptersUrl) {
        const { data: chaptersHtml } = await this.session.get(chaptersUrl);
        chapters$ = cheerio.load(chaptersHtml);
      }

      // Парсим главы из элементов с классом detail-chapter и других возможных селекторов
      const chapterElements = chapters$(
        '.detail-chapter, .chapter-item, .chapter-row, [data-chapter]',
      );

      if (chapterElements.length > 0) {
        chapterElements.each((i, chapterElement) => {
          const chapter$ = chapters$(chapterElement);

          // Извлекаем ссылку на чтение главы из различных возможных селекторов
          const chapterLink = chapter$.find(
            'a[href*="/read/"], a[href*="/chapter/"], a.chapter-link',
          );
          const chapterHref = chapterLink.attr('href');

          if (chapterHref) {
            // Извлекаем текст главы
            const fullText =
              chapterLink.text().trim() || chapter$.text().trim();
            // Убираем лишние пробелы и переносы строк
            const cleanText = fullText.replace(/\s+/g, ' ').trim();

            // Пытаемся извлечь номер главы несколькими способами
            let chapterNumber: number | undefined;

            // 1. Из атрибута data-number или item-number
            const dataNumber =
              chapter$.attr('data-number') || chapter$.attr('item-number');
            if (dataNumber) {
              const parsed = parseFloat(dataNumber);
              if (!isNaN(parsed)) {
                chapterNumber = parsed;
              }
            }

            // 2. Из атрибута bookmark-progress
            if (!chapterNumber) {
              const itemNumber = chapter$
                .find('bookmark-progress')
                .attr('item-number');
              if (itemNumber) {
                const parsed = parseFloat(itemNumber);
                if (!isNaN(parsed)) {
                  chapterNumber = parsed;
                }
              }
            }

            // 3. Из текста главы (ищем паттерны типа "Глава 27" или "Chapter 27")
            if (!chapterNumber) {
              const chapterMatch =
                cleanText.match(
                  /(?:Том\s*\d+\.\s*)?Глава\s*(\d+(?:\.\d+)?)/i,
                ) ||
                cleanText.match(/Chapter\s*(\d+(?:\.\d+)?)/i) ||
                cleanText.match(/(\d+(?:\.\d+)?)/);
              if (chapterMatch) {
                chapterNumber = parseFloat(chapterMatch[1]);
              }
            }

            // 4. Из slug ссылки (последний сегмент числа)
            if (!chapterNumber) {
              const slugParts = chapterHref.split('/');
              for (let j = slugParts.length - 1; j >= 0; j--) {
                const part = slugParts[j];
                if (part && /^\d+(\.\d+)?$/.test(part)) {
                  const parsed = parseFloat(part);
                  if (!isNaN(parsed)) {
                    chapterNumber = parsed;
                    break;
                  }
                }
              }
            }

            // Если не удалось извлечь номер, используем порядковый
            if (!chapterNumber || isNaN(chapterNumber)) {
              chapterNumber = i + 1;
            }

            // Извлекаем slug из ссылки
            let slug =
              chapterHref.split('/read/')[1] ||
              chapterHref.split('/chapter/')[1];
            if (!slug) {
              // Если не удалось извлечь slug обычным способом, используем весь href
              slug = chapterHref.startsWith('/')
                ? chapterHref.substring(1)
                : chapterHref;
            }

            chapters.push({
              name: cleanText || `Глава ${chapterNumber}`,
              slug: slug,
              number: chapterNumber,
            });
          }
        });
      } else {
        // Альтернативный подход: ищем главы в других возможных структурах
        chapters$('a[href*="/read/"], a[href*="/chapter/"]').each((i, elem) => {
          const link$ = chapters$(elem);
          const chapterHref = link$.attr('href');
          const fullText = link$.text().trim();
          const cleanText = fullText.replace(/\s+/g, ' ').trim();

          if (chapterHref) {
            // Извлекаем номер главы из текста
            let chapterNumber: number | undefined;
            const chapterMatch =
              cleanText.match(/(?:Том\s*\d+\.\s*)?Глава\s*(\d+(?:\.\d+)?)/i) ||
              cleanText.match(/Chapter\s*(\d+(?:\.\d+)?)/i) ||
              cleanText.match(/(\d+(?:\.\d+)?)/);

            if (chapterMatch) {
              chapterNumber = parseFloat(chapterMatch[1]);
            }

            if (!chapterNumber || isNaN(chapterNumber)) {
              chapterNumber = i + 1;
            }

            // Извлекаем slug
            let slug =
              chapterHref.split('/read/')[1] ||
              chapterHref.split('/chapter/')[1];
            if (!slug) {
              slug = chapterHref.startsWith('/')
                ? chapterHref.substring(1)
                : chapterHref;
            }

            chapters.push({
              name: cleanText || `Глава ${chapterNumber}`,
              slug: slug,
              number: chapterNumber,
            });
          }
        });
      }
    } catch (error) {
      console.warn('Не удалось загрузить отдельную страницу глав:', error);

      // Альтернатива: ищем главы прямо на текущей странице (если они есть)
      $('.detail-chapter, .chapter-item, .chapter-row, [data-chapter]').each(
        (i, chapterElement) => {
          const chapter$ = $(chapterElement);
          const chapterLink = chapter$.find(
            'a[href*="/read/"], a[href*="/chapter/"], a.chapter-link',
          );
          const chapterHref = chapterLink.attr('href');

          if (chapterHref) {
            const fullText =
              chapterLink.text().trim() || chapter$.text().trim();
            const cleanText = fullText.replace(/\s+/g, ' ').trim();

            let chapterNumber: number | undefined;

            // Пытаемся извлечь номер главы
            const dataNumber =
              chapter$.attr('data-number') || chapter$.attr('item-number');
            if (dataNumber) {
              const parsed = parseFloat(dataNumber);
              if (!isNaN(parsed)) {
                chapterNumber = parsed;
              }
            }

            if (!chapterNumber) {
              const itemNumber = chapter$
                .find('bookmark-progress')
                .attr('item-number');
              if (itemNumber) {
                const parsed = parseFloat(itemNumber);
                if (!isNaN(parsed)) {
                  chapterNumber = parsed;
                }
              }
            }

            if (!chapterNumber) {
              const chapterMatch =
                cleanText.match(
                  /(?:Том\s*\d+\.\s*)?Глава\s*(\d+(?:\.\d+)?)/i,
                ) ||
                cleanText.match(/Chapter\s*(\d+(?:\.\d+)?)/i) ||
                cleanText.match(/(\d+(?:\.\d+)?)/);
              if (chapterMatch) {
                chapterNumber = parseFloat(chapterMatch[1]);
              }
            }

            if (!chapterNumber || isNaN(chapterNumber)) {
              chapterNumber = i + 1;
            }

            let slug =
              chapterHref.split('/read/')[1] ||
              chapterHref.split('/chapter/')[1];
            if (!slug) {
              slug = chapterHref.startsWith('/')
                ? chapterHref.substring(1)
                : chapterHref;
            }

            chapters.push({
              name: cleanText || `Глава ${chapterNumber}`,
              slug: slug,
              number: chapterNumber,
            });
          }
        },
      );
    }

    // Сортируем по номеру главы (в порядке возрастания)
    return chapters.sort((a, b) => (a.number || 0) - (b.number || 0));
  }
}
