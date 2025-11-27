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

      // Debug: Log some HTML content to understand structure
      console.log('Title element:', $main('.post-title').text().trim());
      console.log(
        'Chapter list HTML sample:',
        $main('ul.main.version-chap').html()?.substring(0, 500),
      );
      console.log(
        'All chapter links found:',
        $main('a[href*="/chapter/"]').length,
      );

      // More debugging - check what elements actually exist
      console.log('All ul elements:', $main('ul').length);
      console.log('All li elements:', $main('li').length);
      console.log('All a elements:', $main('a').length);
      console.log(
        'Elements with wp-manga-chapter class:',
        $main('.wp-manga-chapter').length,
      );
      console.log(
        'Elements with chapter in href:',
        $main('a[href*="chapter"]').length,
      );

      // Check for common manga site structures
      console.log(
        'Body content sample:',
        $main('body').html()?.substring(0, 1000),
      );
      console.log(
        'Main content sample:',
        $main('#main, .main, .content').html()?.substring(0, 1000),
      );

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

      // Extract chapters from main page - try multiple selectors
      const chapters: ChapterInfo[] = [];

      // Try different selectors for chapters
      const chapterSelectors = [
        'ul.main.version-chap.no-volumn li.wp-manga-chapter a',
        'ul.version-chap li.wp-manga-chapter a',
        '.chapter-list li a',
        '.listing-chapters_wrap ul li a',
        '.wp-manga-chapter a',
        'li.wp-manga-chapter a',
        '.chapter-item a',
        '.chapters-list a',
      ];

      for (const selector of chapterSelectors) {
        const elements = $main(selector);
        console.log(`Selector "${selector}" found ${elements.length} elements`);
        elements.each((_, element) => {
          const name = $main(element).text().trim();
          const link = $main(element).attr('href');
          console.log(`  Found: "${name}" -> ${link}`);
          if (name && link && link.includes('/chapter/')) {
            // Extract chapter number from various patterns
            const match = name.match(/(?:Глава|Chapter|Ch\.?)\s*(\d+)/i);
            const number = match ? parseInt(match[1], 10) : undefined;
            chapters.push({ name, url: link, number });
          }
        });
        console.log(`  Chapters found so far: ${chapters.length}`);
        if (chapters.length > 0) break; // Stop if we found chapters
      }

      // If no chapters found on main page, try AJAX fallback
      if (chapters.length === 0) {
        // Extract manga slug from URL
        const urlMatch = url.match(/\/manga\/([^/]+)\//);
        if (urlMatch) {
          const slug = urlMatch[1];
          // Construct AJAX URL for chapters
          const ajaxUrl = `https://manga-shi.org/manga/${slug}/ajax/chapters/?t=1`;

          try {
            console.log('Trying AJAX URL:', ajaxUrl);
            // Make POST request to get chapters (as shown in user's example)
            const chaptersResponse = await this.session.post(ajaxUrl, null, {
              headers: {
                Referer: url,
                'X-Requested-With': 'XMLHttpRequest',
                Origin: 'https://manga-shi.org',
              },
            });

            console.log('AJAX response status:', chaptersResponse.status);
            console.log(
              'AJAX response data sample:',
              chaptersResponse.data?.substring(0, 500),
            );

            const $chapters = cheerio.load(chaptersResponse.data);
            console.log('AJAX HTML structure check:');
            console.log('AJAX ul elements:', $chapters('ul').length);
            console.log('AJAX li elements:', $chapters('li').length);
            console.log('AJAX a elements:', $chapters('a').length);
            console.log(
              'AJAX wp-manga-chapter elements:',
              $chapters('.wp-manga-chapter').length,
            );
            console.log(
              'AJAX chapter href elements:',
              $chapters('a[href*="chapter"]').length,
            );

            // Try the same selectors on AJAX response
            for (const selector of chapterSelectors) {
              const elements = $chapters(selector);
              console.log(
                `AJAX Selector "${selector}" found ${elements.length} elements`,
              );
              elements.each((_, element) => {
                const name = $chapters(element).text().trim();
                const link = $chapters(element).attr('href');
                console.log(`  AJAX Found: "${name}" -> ${link}`);
                if (
                  name &&
                  link &&
                  (link.includes('/chapter/') || link.includes('/glava/'))
                ) {
                  // Extract chapter number from various patterns
                  const match = name.match(/(?:Глава|Chapter|Ch\.?)\s*(\d+)/i);
                  const number = match ? parseInt(match[1], 10) : undefined;
                  chapters.push({ name, url: link, number });
                }
              });
              console.log(`  AJAX Chapters found so far: ${chapters.length}`);
              if (chapters.length > 0) break; // Stop if we found chapters
            }

            // If still no chapters found, try simpler selectors specific to AJAX response
            if (chapters.length === 0) {
              console.log('Trying simpler AJAX selectors...');
              const simpleSelectors = [
                'li.wp-manga-chapter a',
                '.wp-manga-chapter a',
                'a[href*="/glava/"]', // Russian chapter URLs
                'a[href*="/chapter/"]',
              ];

              for (const selector of simpleSelectors) {
                const elements = $chapters(selector);
                console.log(
                  `Simple AJAX Selector "${selector}" found ${elements.length} elements`,
                );
                elements.each((_, element) => {
                  const name = $chapters(element).text().trim();
                  const link = $chapters(element).attr('href');
                  console.log(`  Simple AJAX Found: "${name}" -> ${link}`);
                  if (
                    name &&
                    link &&
                    (link.includes('/chapter/') || link.includes('/glava/'))
                  ) {
                    // Extract chapter number from various patterns
                    const match = name.match(
                      /(?:Глава|Chapter|Ch\.?)\s*(\d+)/i,
                    );
                    const number = match ? parseInt(match[1], 10) : undefined;
                    chapters.push({ name, url: link, number });
                  }
                });
                console.log(
                  `  Simple AJAX Chapters found so far: ${chapters.length}`,
                );
                if (chapters.length > 0) break;
              }
            }
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
