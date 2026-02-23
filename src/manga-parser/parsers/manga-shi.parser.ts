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
      const baseUrl = new URL(url).origin;

      // Extract title (new layout and legacy)
      const title =
        $main('h1').first().text().trim() ||
        $main('.post-title h1').text().trim() ||
        $main('.post-title').text().trim() ||
        url;

      // Extract cover URL (new layout: og:image, .media-image; legacy: .summary_image, .thumb)
      let coverUrl =
        $main('meta[property="og:image"]').attr('content') ||
        $main('.summary_image img').attr('data-src') ||
        $main('.summary_image img').attr('src') ||
        $main('.summary_image a img').attr('data-src') ||
        $main('.summary_image a img').attr('src') ||
        $main('.thumb img').attr('data-src') ||
        $main('.thumb img').attr('src');
      if (!coverUrl) {
        const mainCover = $main('img.media-image[alt*="Обложка"], img.media-image[title]').first();
        if (mainCover.length) {
          coverUrl = mainCover.attr('src') || mainCover.attr('data-src');
        }
      }
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = coverUrl.startsWith('/') ? `${baseUrl}${coverUrl}` : `${baseUrl}/${coverUrl}`;
      }

      // Description: full text from content block (new layout) or legacy selectors
      let description =
        $main('div.text-zinc-400.leading-relaxed.max-w-3xl').first().text().trim() ||
        $main('h1').nextAll('div').filter((_, el) => $main(el).text().length > 100).first().text().trim() ||
        $main('meta[property="og:description"]').attr('content')?.trim() ||
        $main('.summary__content .post-content').text().trim() ||
        $main('.summary .post-content').text().trim() ||
        $main('.description').text().trim() ||
        $main('.manga-summary').text().trim();
      if (description?.endsWith('…') || description?.endsWith('...')) {
        const fromMeta = $main('meta[property="og:description"]').attr('content');
        if (fromMeta && description === fromMeta) description = description; // keep as is or try JSON-LD full
      }

      // Genres: from JSON-LD (CreativeWorkSeries.genre) or from #-tags on page or legacy
      let genres: string[] = this.extractGenresFromJsonLd($main);
      if (genres.length === 0) {
        $main('span').each((_, element) => {
          const t = $main(element).text().trim();
          if (/^#[\wА-Яа-яёЁ]+$/.test(t)) genres.push(t.replace(/^#/, '').trim());
        });
      }
      if (genres.length === 0) {
        $main('.genres-content a, .genre a, .mg_genres a').each((_, element) => {
          const genre = $main(element).text().trim();
          if (genre) genres.push(genre);
        });
      }

      // Author: links to /catalog/?author=
      const author = this.extractListFromLinks($main, 'a[href*="/catalog/?author="]');

      // Artist: links to /catalog/?artist=
      const artist = this.extractListFromLinks($main, 'a[href*="/catalog/?artist="]');

      // Year: row with label "Год:" and value in next span
      const releaseYear = this.extractYearFromLabel($main, 'Год:');

      // Alternative titles: row "Другие названия:" then comma-separated list
      const alternativeTitles = this.extractAlternativeTitlesFromLabel($main);

      // Type: Manga / Manhwa / Manhua from page (e.g. "Manga • Ongoing")
      const type = this.extractType($main);

      // New site: chapters on main page (a[href*="/glava-"] with .chapter-title) + pagination
      let chapters: ChapterInfo[] = this.extractChaptersFromHtml($main, baseUrl);

      // Fetch additional chapter pages (load more: /manga/{slug}/chapters/?page=N)
      const slugMatch = url.match(/\/manga\/([^/]+)\/?/);
      if (slugMatch) {
        const slug = slugMatch[1];
        const seenUrls = new Set(chapters.map((c) => c.url).filter(Boolean));
        let page = 2;
        for (;;) {
          const more = await this.fetchChaptersPage(baseUrl, slug, page);
          if (more.length === 0) break;
          let added = 0;
          for (const ch of more) {
            if (ch.url && !seenUrls.has(ch.url)) {
              seenUrls.add(ch.url);
              chapters.push(ch);
              added++;
            }
          }
          if (added === 0) break; // no new chapters — stop pagination (site may return same page)
          page++;
        }
      }

      // Legacy: try AJAX if new selectors found nothing
      if (chapters.length === 0) {
        chapters = await this.fetchChaptersViaAjax(url);
      }
      if (chapters.length === 0) {
        chapters = this.extractChaptersFromHtmlLegacy($main);
      }

      // Reverse to have chapters in ascending order
      chapters.reverse();

      return {
        title,
        alternativeTitles:
          alternativeTitles.length > 0 ? alternativeTitles : undefined,
        description: description || undefined,
        coverUrl: coverUrl || undefined,
        genres: genres.length > 0 ? genres : undefined,
        author: author || undefined,
        artist: artist || undefined,
        releaseYear: releaseYear ?? undefined,
        type: type || undefined,
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
          const nameMatch = name.match(/(?:Глава|Chapter)\s*(\d+(?:\.\d+)?)/i);
          if (nameMatch) {
            const parsedNumber = parseFloat(nameMatch[1]);
            if (!isNaN(parsedNumber)) {
              number = parsedNumber;
            }
          } else {
            // Try to extract from URL (e.g., "/glava-274/")
            const urlMatch = link.match(
              /\/(?:glava|chapter)-(\d+(?:\.\d+)?)\//i,
            );
            if (urlMatch) {
              const parsedNumber = parseFloat(urlMatch[1]);
              if (!isNaN(parsedNumber)) {
                number = parsedNumber;
              }
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

  /** New site layout: a[href*="/glava-"] with .chapter-title, relative hrefs */
  private extractChaptersFromHtml($: cheerio.Root, baseUrl: string): ChapterInfo[] {
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();

    $(`a[href*="/glava-"]`).each((_, element) => {
      const $el = $(element);
      const href = $el.attr('href');
      if (!href || !href.includes('/glava-')) return;

      const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      const name =
        $el.find('.chapter-title').text().trim() ||
        $el.find('span').first().text().trim() ||
        $el.text().trim();
      const cleanName = name.replace(/\s*\d{2}\.\d{2}\.\d{4}\s*$/, '').trim() || name;

      let number: number | undefined;
      const urlMatch = href.match(/\/glava-(\d+(?:\.\d+)?)\//i);
      if (urlMatch) {
        const n = parseFloat(urlMatch[1]);
        if (!isNaN(n)) number = n;
      }
      if (number === undefined && cleanName) {
        const nameMatch = cleanName.match(/(?:Глава|Chapter)\s*(\d+(?:\.\d+)?)/i);
        if (nameMatch) {
          const n = parseFloat(nameMatch[1]);
          if (!isNaN(n)) number = n;
        }
      }

      const slugMatch = href.match(/\/manga\/[^/]+\/(.+)\/$/);
      const slug = slugMatch ? slugMatch[1] : undefined;

      chapters.push({
        name: cleanName || `Глава ${number ?? '?'}`,
        url: fullUrl,
        number,
        slug,
      });
    });

    if (chapters.length > 0) {
      console.log(`Found ${chapters.length} chapters (new layout)`);
    }
    return chapters;
  }

  /** Fetch one page of chapters (pagination: /manga/{slug}/chapters/?chapter_sort=latest&page=N) */
  private async fetchChaptersPage(
    baseUrl: string,
    slug: string,
    page: number,
  ): Promise<ChapterInfo[]> {
    try {
      const pageUrl = `${baseUrl}/manga/${slug}/chapters/?chapter_sort=latest&page=${page}`;
      const res = await this.session.get(pageUrl);
      const $ = cheerio.load(res.data);
      return this.extractChaptersFromHtml($, baseUrl);
    } catch {
      return [];
    }
  }

  /** Legacy selectors (old site layout) */
  private extractChaptersFromHtmlLegacy($: cheerio.Root): ChapterInfo[] {
    const chapters: ChapterInfo[] = [];

    const chapterSelectors = [
      'li.wp-manga-chapter a',
      '.wp-manga-chapter a',
      '.chapter-item a',
      '.chapter-list li a',
      '.listing-chapters_wrap ul li a',
    ];

    for (const selector of chapterSelectors) {
      const elements = $(selector);

      elements.each((_, element) => {
        const name = $(element).text().trim();
        const link = $(element).attr('href');

        if (
          name &&
          link &&
          (link.includes('/glava/') || link.includes('/glava-') || link.includes('/chapter/'))
        ) {
          let number: number | undefined;

          const nameMatch = name.match(/(?:Глава|Chapter)\s*(\d+(?:\.\d+)?)/i);
          if (nameMatch) {
            const parsedNumber = parseFloat(nameMatch[1]);
            if (!isNaN(parsedNumber)) number = parsedNumber;
          } else {
            const urlMatch = link.match(/\/(?:glava|chapter)-(\d+(?:\.\d+)?)\//i);
            if (urlMatch) {
              const parsedNumber = parseFloat(urlMatch[1]);
              if (!isNaN(parsedNumber)) number = parsedNumber;
            }
          }

          const slugMatch = link.match(/\/manga\/[^/]+\/(.+)\/$/);
          const slug = slugMatch ? slugMatch[1] : undefined;

          chapters.push({ name, url: link, number, slug });
        }
      });

      if (chapters.length > 0) break;
    }

    console.log(`Found ${chapters.length} chapters from main page (legacy)`);
    return chapters;
  }

  /** Parse JSON-LD script and return genre array from CreativeWorkSeries */
  private extractGenresFromJsonLd($: cheerio.Root): string[] {
    try {
      const script = $('script#json-ld').html();
      if (!script) return [];
      const data = JSON.parse(script) as Array<{ '@type'?: string; genre?: string[] }>;
      const creative = Array.isArray(data) ? data.find((o) => o['@type'] === 'CreativeWorkSeries') : null;
      const genre = creative?.genre;
      return Array.isArray(genre) ? genre.filter((g): g is string => typeof g === 'string') : [];
    } catch {
      return [];
    }
  }

  /** Collect unique text from links matching selector, join with ", " */
  private extractListFromLinks($: cheerio.Root, selector: string): string | undefined {
    const parts: string[] = [];
    $(selector).each((_, el) => {
      const t = $(el).text().trim();
      if (t && !parts.includes(t)) parts.push(t);
    });
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  /** Find row with label (e.g. "Год:") and return numeric value from same row */
  private extractYearFromLabel($: cheerio.Root, label: string): number | undefined {
    let year: number | undefined;
    $('div.flex').each((_, rowEl) => {
      const row = $(rowEl);
      const spans = row.find('span');
      if (spans.length < 2) return;
      if (spans.first().text().trim() !== label) return;
      const text = spans.last().text().trim();
      const num = parseInt(text, 10);
      if (!Number.isNaN(num) && num > 1900 && num < 2100) year = num;
    });
    return year;
  }

  /** Find row "Другие названия:" and return comma-split list (trimmed) */
  private extractAlternativeTitlesFromLabel($: cheerio.Root): string[] {
    const result: string[] = [];
    $('div.flex').each((_, rowEl) => {
      const row = $(rowEl);
      const spans = row.find('span');
      if (spans.length < 2) return;
      if (spans.first().text().trim() !== 'Другие названия:') return;
      const text = spans.last().text().trim();
      if (!text) return;
      text.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => result.push(s));
    });
    return [...new Set(result)];
  }

  /** Extract type: Manga / Manhwa / Manhua from page (e.g. "Manga • Ongoing") */
  private extractType($: cheerio.Root): string | undefined {
    const candidates = ['Manga', 'Manhwa', 'Manhua', 'Comic', 'Комикс', 'Манхва', 'Маньхуа'];
    let found: string | undefined;
    $('span').each((_, el) => {
      if (found) return;
      const t = $(el).text().trim();
      for (const c of candidates) {
        if (t.toLowerCase().startsWith(c.toLowerCase()) && (t.length <= c.length + 2 || /^\s*[•·]/.test(t.slice(c.length)))) {
          found = c;
          return;
        }
      }
    });
    return found;
  }
}
