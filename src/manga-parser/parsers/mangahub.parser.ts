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
      console.log(`Parsing MangaHub URL: ${url}`);

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
      const chapters = await this.getChapters(url, $);
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
      console.error('Error parsing MangaHub:', error);
      throw new BadRequestException(
        `Failed to parse MangaHub: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private extractTitle($: cheerio.Root): string {
    // Изменяем тип на cheerio.Root
    // Пытаемся получить название из нескольких мест
    let title = $('h1').text().trim();
    console.log(`Title from h1: ${title}`);

    if (!title) {
      title = $('.text-line-clamp.fs-5.fw-bold').text().trim();
      console.log(`Title from .text-line-clamp: ${title}`);
    }

    if (!title) {
      const content = $('meta[property="og:title"]').attr('content');
      title = content ? content : '';
      console.log(`Title from og:title: ${title}`);
    }

    // Убираем лишний текст из meta-тега
    title = title
      .replace('Читать', '')
      .replace('Манга онлайн', '')
      .replace('..', '')
      .replace(' - читать онлайн', '')
      .trim();

    console.log(`Final title: ${title}`);
    return title || 'Неизвестное название';
  }

  private extractAlternativeTitles($: cheerio.Root): string[] {
    // Изменяем тип на cheerio.Root
    const alternatives: string[] = [];

    // Ищем в offcanvas с alternative names
    $('#another-names .offcanvas-body div.mt-1').each((i, elem) => {
      if (i > 1) {
        // Пропускаем первые два (русское и английское)
        const alt = $(elem).text().trim();
        if (alt) {
          alternatives.push(alt);
          console.log(`Alternative title: ${alt}`);
        }
      }
    });

    // Также проверяем meta-теги
    const altFromMeta = $('meta[name="description"]').attr('content');
    if (altFromMeta && altFromMeta.includes('(')) {
      const match = altFromMeta.match(/\(([^)]+)\)/);
      if (match) {
        alternatives.push(match[1]);
        console.log(`Alternative from meta: ${match[1]}`);
      }
    }

    // Проверяем schema.org данные
    const scriptContent = $('script[type="application/ld+json"]').html();
    if (scriptContent) {
      try {
        const schema = JSON.parse(scriptContent);
        if (schema.alternativeName) {
          alternatives.push(schema.alternativeName);
          console.log(`Alternative from schema: ${schema.alternativeName}`);
        }
      } catch (error) {
        console.log(`Could not parse schema.org data ${error}`);
      }
    }

    return [...new Set(alternatives.filter(Boolean))]; // Убираем дубликаты
  }

  private extractDescription($: cheerio.Root): string | undefined {
    // Изменяем тип на cheerio.Root
    let description = $('.markdown-style.text-expandable-content')
      .text()
      .trim();

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
    // Изменяем тип на cheerio.Root
    let coverUrl = $('img.cover-detail').attr('src');
    console.log(`Cover from .cover-detail: ${coverUrl}`);

    if (!coverUrl) {
      coverUrl = $('img.cover').attr('src');
      console.log(`Cover from .cover: ${coverUrl}`);
    }

    if (!coverUrl) {
      coverUrl = $('meta[property="og:image"]').attr('content');
      console.log(`Cover from og:image: ${coverUrl}`);
    }

    if (!coverUrl) {
      // Пробуем найти в schema.org
      const scriptContent = $('script[type="application/ld+json"]').html();
      if (scriptContent) {
        try {
          const schema = JSON.parse(scriptContent);
          if (schema.image) {
            coverUrl = schema.image;
            console.log(`Cover from schema: ${coverUrl}`);
          }
        } catch (error) {
          console.log(`Could not parse schema.org for cover ${error}`);
        }
      }
    }

    // Преобразуем относительный URL в абсолютный
    if (coverUrl && !coverUrl.startsWith('http')) {
      if (coverUrl.startsWith('//')) {
        coverUrl = 'https:' + coverUrl;
      } else if (coverUrl.startsWith('/')) {
        coverUrl = 'https://v2.mangahub.one' + coverUrl;
      }
    }

    return coverUrl || undefined;
  }

  private extractGenres($: cheerio.Root): string[] {
    // Изменяем тип на cheerio.Root
    const genres: string[] = [];

    // Жанры из tags (collapse-multiple)
    $('collapse-multiple.tags a.tag, collapse-multiple a.tag').each(
      (i, elem) => {
        const genre = $(elem).text().trim();
        if (genre) {
          genres.push(genre);
          console.log(`Genre from tag: ${genre}`);
        }
      },
    );

    // Жанры из атрибутов
    $('.detail-attrs .attr').each((i, elem) => {
      const attrName = $(elem).find('.attr-name').text().trim();
      if (attrName.includes('Жанр') || attrName.includes('Жанры')) {
        $(elem)
          .find('.attr-value a')
          .each((j, genreElem) => {
            const genre = $(genreElem).text().trim();
            if (genre) {
              genres.push(genre);
              console.log(`Genre from attrs: ${genre}`);
            }
          });
      }
    });

    // Убираем дубликаты
    return [...new Set(genres.filter(Boolean))];
  }

  private async getChapters(
    url: string,
    $: cheerio.Root, // Изменяем тип на cheerio.Root
  ): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];
    const baseUrl = new URL(url).origin;

    console.log(`Base URL for chapters: ${baseUrl}`);

    try {
      // Пытаемся получить ссылку на страницу с главами
      let chaptersUrl = $('a[href*="/chapters"]').attr('href');

      if (chaptersUrl && !chaptersUrl.startsWith('http')) {
        chaptersUrl = baseUrl + chaptersUrl;
      } else if (!chaptersUrl) {
        // Пробуем построить URL из текущего пути
        const pathMatch = url.match(/\/title\/[^/]+/);
        if (pathMatch) {
          chaptersUrl = baseUrl + pathMatch[0] + '/chapters';
        }
      }

      console.log(`Chapters URL: ${chaptersUrl}`);

      if (chaptersUrl) {
        try {
          const { data: chaptersHtml } = await this.session.get(chaptersUrl);
          const chapters$ = cheerio.load(chaptersHtml);

          console.log(
            `Loaded chapters page, looking for .detail-chapter elements`,
          );

          // Ищем главы на отдельной странице
          chapters$('.detail-chapter').each((i, chapterElement) => {
            this.parseChapterElement(
              chapters$(chapterElement),
              baseUrl,
              chapters,
              i,
            );
          });

          // Если не нашли на отдельной странице, проверяем текущую
          if (chapters.length === 0) {
            $('.detail-chapter').each((i, chapterElement) => {
              this.parseChapterElement($(chapterElement), baseUrl, chapters, i);
            });
          }
        } catch (chaptersError) {
          console.warn(
            'Could not load separate chapters page, trying current page:',
            chaptersError,
          );
          // Пробуем найти на текущей странице
          $('.detail-chapter').each((i, chapterElement) => {
            this.parseChapterElement($(chapterElement), baseUrl, chapters, i);
          });
        }
      } else {
        // Ищем главы прямо на текущей странице
        $('.detail-chapter').each((i, chapterElement) => {
          this.parseChapterElement($(chapterElement), baseUrl, chapters, i);
        });
      }
    } catch (error) {
      console.error('Error in getChapters:', error);

      // Последняя попытка: ищем любые ссылки на главы
      $('a[href*="/read/"]').each((i, elem) => {
        const chapter$ = $(elem);
        const chapterHref = chapter$.attr('href');
        const chapterText = chapter$.text().trim();

        if (chapterHref) {
          let chapterNumber: number | undefined = i + 1;

          // Пытаемся извлечь номер из текста
          const match =
            chapterText.match(/Глава\s*(\d+(?:\.\d+)?)/i) ||
            chapterText.match(/(\d+(?:\.\d+)?)/);
          if (match) {
            const parsed = parseFloat(match[1]);
            if (!isNaN(parsed)) {
              chapterNumber = parsed;
            }
          }

          const slug = chapterHref.split('/read/')[1];
          if (slug) {
            chapters.push({
              name: chapterText || `Глава ${chapterNumber}`,
              slug: slug,
              number: chapterNumber,
              url: chapterHref.startsWith('http')
                ? chapterHref
                : baseUrl + chapterHref,
            });
          }
        }
      });
    }

    console.log(`Found total chapters: ${chapters.length}`);

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
      // Извлекаем ссылку на чтение главы
      const chapterLink = chapter$.find('a[href*="/read/"]');
      const chapterHref = chapterLink.attr('href');

      if (chapterHref) {
        // Извлекаем текст главы
        const fullText = chapterLink.text().trim();
        const cleanText = fullText.replace(/\s+/g, ' ').trim();

        // Извлекаем номер главы из атрибута item-number (приоритетный способ)
        let chapterNumber: number | undefined;

        const bookmarkProgress = chapter$.find('bookmark-progress');
        if (bookmarkProgress.length > 0) {
          const itemNumber = bookmarkProgress.attr('item-number');
          if (itemNumber) {
            const parsed = parseFloat(itemNumber);
            if (!isNaN(parsed)) {
              chapterNumber = parsed;
            }
          }
        }

        // Если не удалось извлечь из item-number, ищем в тексте
        if (!chapterNumber) {
          const chapterMatch =
            cleanText.match(/Глава\s*(\d+(?:\.\d+)?)/i) ||
            cleanText.match(/(\d+(?:\.\d+)?)/);
          if (chapterMatch) {
            chapterNumber = parseFloat(chapterMatch[1]);
          }
        }

        // Если все еще нет, используем индекс
        if (!chapterNumber || isNaN(chapterNumber)) {
          chapterNumber = index + 1;
        }

        // Извлекаем slug из ссылки /read/ID
        const slugMatch = chapterHref.match(/\/read\/(\d+)/);
        const slug = slugMatch ? slugMatch[1] : null;

        if (slug) {
          chapters.push({
            name: cleanText || `Глава ${chapterNumber}`,
            slug: slug,
            number: chapterNumber,
            url: chapterHref.startsWith('http')
              ? chapterHref
              : baseUrl + chapterHref,
          });

          console.log(`Parsed chapter: ${chapterNumber} - ${cleanText}`);
        }
      }
    } catch (error) {
      console.warn(`Error parsing chapter element at index ${index}:`, error);
    }
  }
}
