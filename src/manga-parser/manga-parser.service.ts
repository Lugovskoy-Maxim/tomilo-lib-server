import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { TitlesService } from '../titles/titles.service';
import { ChaptersService } from '../chapters/chapters.service';
import { FilesService } from '../files/files.service';
import { CreateTitleDto } from '../titles/dto/create-title.dto';
import { CreateChapterDto } from '../chapters/dto/create-chapter.dto';
import { ParseTitleDto } from './dto/parse-title.dto';
import { ParseChapterDto } from './dto/parse-chapter.dto';
import { ParseChaptersInfoDto } from './dto/parse-chapters-info.dto';
import { MangaParser, ChapterInfo } from './parsers/base.parser';
import { SenkuroParser } from './parsers/senkuro.parser';
import { MangaShiParser } from './parsers/manga-shi.parser';
import { MangabuffParser } from './parsers/mangabuff.parser';

@Injectable()
export class MangaParserService {
  private readonly logger = new Logger(MangaParserService.name);
  private session: AxiosInstance;
  private parsers: Map<string, MangaParser>;

  constructor(
    private titlesService: TitlesService,
    private chaptersService: ChaptersService,
    private filesService: FilesService,
  ) {
    this.session = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
      },
    });

    this.parsers = new Map();
    this.parsers.set('manga-shi.org', new MangaShiParser());
    this.parsers.set('senkuro.me', new SenkuroParser());
    this.parsers.set('sencuro.me', new SenkuroParser());
    this.parsers.set('mangabuff.ru', new MangabuffParser());
  }

  private sanitizeFilename(name: string): string {
    if (!name) return 'unknown';
    return name.replace(/[\\/*?:"<>|]/g, '_').trim();
  }

  private parseChapterNumbers(chapterNumbers: string[]): Set<number> {
    const numbers = new Set<number>();
    for (const item of chapterNumbers) {
      if (item.includes('-')) {
        const [start, end] = item.split('-').map((s) => parseInt(s.trim(), 10));
        if (isNaN(start) || isNaN(end) || start > end) {
          throw new BadRequestException(`Invalid range: ${item}`);
        }
        for (let i = start; i <= end; i++) {
          numbers.add(i);
        }
      } else {
        const num = parseInt(item.trim(), 10);
        if (isNaN(num)) {
          throw new BadRequestException(`Invalid number: ${item}`);
        }
        numbers.add(num);
      }
    }
    return numbers;
  }

  private async downloadChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
    domain: string = 'senkuro.me',
  ): Promise<string[]> {
    if (!chapter.slug) {
      throw new BadRequestException('Chapter slug is required for downloading');
    }

    try {
      const graphqlUrl = `https://api.${domain}/graphql`;
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: `https://${domain}`,
        Referer: `https://${domain}/`,
      };

      const query = `
        query Chapter($slug: String!) {
          mangaChapter(slug: $slug) {
            id
            name
            number
            pages {
              number
              image {
                original {
                  url
                }
              }
            }
          }
        }
      `;

      const response = await this.session.post(
        graphqlUrl,
        {
          query,
          variables: { slug: chapter.slug },
        },
        { headers },
      );

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.data}`);
      }

      const data = response.data;
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      const chapterData = data.data?.mangaChapter;
      if (!chapterData) {
        throw new Error('No chapter data in response');
      }

      const pages = chapterData.pages || [];
      if (pages.length === 0) {
        throw new Error('No pages found in chapter');
      }

      const pagePaths: string[] = [];
      for (const page of pages) {
        const imgUrl = page.image?.original?.url;
        if (!imgUrl) continue;

        const pagePath = await this.filesService.downloadImageFromUrl(
          imgUrl,
          chapterId,
          page.number,
        );
        pagePaths.push(pagePath);

        // Small delay between downloads
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return pagePaths;
    } catch (error) {
      this.logger.error(
        `Failed to download chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to download chapter images');
    }
  }

  /**
   * Download chapter images for manga-shi.org
   * @param chapter Chapter info with slug
   * @param chapterId Chapter ID for saving images
   * @returns Array of page paths
   */
  private async downloadMangaShiChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
  ): Promise<string[]> {
    if (!chapter.url) {
      throw new BadRequestException('Chapter URL is required for downloading');
    }

    try {
      // Create a new session with manga-shi specific headers
      const mangaShiSession = axios.create({
        timeout: 20000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
          Referer: 'https://manga-shi.org/',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      // Get chapter page
      const chapterResponse = await mangaShiSession.get(chapter.url);
      const $chapter = cheerio.load(chapterResponse.data);

      // Extract image URLs
      const imageUrls: string[] = [];
      $chapter('.page-break img').each((_, element) => {
        const src =
          $chapter(element).attr('data-src') || $chapter(element).attr('src');
        if (src) {
          // Convert relative URLs to absolute
          const absoluteUrl = new URL(src, chapter.url).href;
          imageUrls.push(absoluteUrl);
        }
      });

      if (imageUrls.length === 0) {
        throw new Error('No images found in chapter');
      }

      const pagePaths: string[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const imgUrl = imageUrls[i];
        try {
          const pagePath = await this.filesService.downloadImageFromUrl(
            imgUrl,
            chapterId,
            i + 1, // Page number starts from 1
          );
          pagePaths.push(pagePath);
        } catch (imageError) {
          this.logger.error(
            `Failed to download image ${imgUrl}: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`,
          );
          // Continue with other images even if one fails
        }

        // Small delay between downloads
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (pagePaths.length === 0) {
        throw new Error('No images could be downloaded');
      }

      return pagePaths;
    } catch (error) {
      this.logger.error(
        `Failed to download manga-shi chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to download chapter images');
    }
  }

  /**
   * Download chapter images for mangabuff.ru
   * @param chapter Chapter info with url
   * @param chapterId Chapter ID for saving images
   * @returns Array of page paths
   */
  private async downloadMangabuffChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
  ): Promise<string[]> {
    if (!chapter.url) {
      throw new BadRequestException('Chapter URL is required for downloading');
    }

    try {
      // Create a new session with mangabuff specific headers
      const mangabuffSession = axios.create({
        timeout: 20000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
          Referer: 'https://mangabuff.ru/',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      // Get chapter page
      const chapterResponse = await mangabuffSession.get(chapter.url);
      const $chapter = cheerio.load(chapterResponse.data);

      // Extract image URLs - try multiple selectors for mangabuff
      const imageUrls: string[] = [];
      const selectors = [
        '.reader__pages .reader__item img',
        '.reader__item img',
        '.page-break img',
        '.chapter-images img',
        '.manga-images img',
        '.reader img',
        '.comic img',
        'img[data-src]',
        'img[src]',
      ];

      for (const selector of selectors) {
        $chapter(selector).each((_, element) => {
          const src =
            $chapter(element).attr('data-src') || $chapter(element).attr('src');
          if (src && !imageUrls.includes(src)) {
            // Convert relative URLs to absolute
            const absoluteUrl = new URL(src, chapter.url).href;
            imageUrls.push(absoluteUrl);
          }
        });
        if (imageUrls.length > 0) break; // Stop if we found images
      }

      if (imageUrls.length === 0) {
        throw new Error('No images found in chapter');
      }

      const pagePaths: string[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const imgUrl = imageUrls[i];
        try {
          const pagePath = await this.filesService.downloadImageFromUrl(
            imgUrl,
            chapterId,
            i + 1, // Page number starts from 1
          );
          pagePaths.push(pagePath);
        } catch (imageError) {
          this.logger.error(
            `Failed to download image ${imgUrl}: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`,
          );
          // Continue with other images even if one fails
        }

        // Small delay between downloads
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (pagePaths.length === 0) {
        throw new Error('No images could be downloaded');
      }

      return pagePaths;
    } catch (error) {
      this.logger.error(
        `Failed to download mangabuff chapter images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to download chapter images');
    }
  }

  async parseAndImportTitle(
    parseTitleDto: ParseTitleDto,
  ): Promise<{ title: any; importedChapters: any[]; totalChapters: number }> {
    const {
      url,
      chapterNumbers,
      customTitle,
      customDescription,
      customGenres,
      customType,
    } = parseTitleDto;

    // Find the appropriate parser
    const parser = this.getParserForUrl(url);
    if (!parser) {
      throw new BadRequestException(
        'Unsupported site. Only manga-shi.org and senkuro.me are supported.',
      );
    }

    // Parse the manga data
    const parsedData = await parser.parse(url);

    // Filter chapters if specific numbers requested
    let chapters = parsedData.chapters;
    if (chapterNumbers && chapterNumbers.length > 0) {
      const requestedNumbers = this.parseChapterNumbers(chapterNumbers);
      chapters = chapters.filter(
        (ch) => ch.number && requestedNumbers.has(ch.number),
      );
    }

    if (chapters.length === 0) {
      throw new BadRequestException('No chapters found on the source website');
    }

    // Create title
    const createTitleDto: CreateTitleDto = {
      name: customTitle || this.sanitizeFilename(parsedData.title),
      altNames: parsedData.alternativeTitles || [],
      description:
        customDescription || parsedData.description || `Imported from ${url}`,
      genres: customGenres || parsedData.genres || ['Unknown'],
      coverImage: parsedData.coverUrl,
      type: customType,
      isPublished: true,
    };

    const createdTitle = await this.titlesService.create(createTitleDto);
    this.logger.log(`Created title: ${createdTitle.name}`);

    // Download and save title cover image locally for both sites
    if (parsedData.coverUrl) {
      try {
        const localCoverPath = await this.filesService.downloadTitleCover(
          parsedData.coverUrl,
          createdTitle._id.toString(),
        );
        await this.titlesService.update(createdTitle._id.toString(), {
          coverImage: localCoverPath,
        });
        this.logger.log(`Downloaded and saved title cover: ${localCoverPath}`);
      } catch (error) {
        this.logger.error(
          `Failed to download title cover: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
        // Continue without cover - don't fail the entire import
      }
    }

    // Import chapters
    const importedChapters: any[] = [];
    for (const chapter of chapters) {
      try {
        const chapterNumber = chapter.number || 1; // Fallback for manga-shi.org

        const createChapterDto: CreateChapterDto = {
          titleId: createdTitle._id.toString(),
          chapterNumber,
          name: chapter.name,
          isPublished: true,
        };

        const createdChapter =
          await this.chaptersService.create(createChapterDto);

        // Download images for both senkuro.me and manga-shi.org
        if (chapter.slug || chapter.url) {
          const domain = this.extractDomain(url);
          let pagePaths: string[] = [];

          try {
            pagePaths = await this.downloadChapterImages(
              chapter,
              createdChapter._id.toString(),
              domain,
            );
          } catch (error) {
            // For manga-shi.org, we need to implement a different download method
            if (url.includes('manga-shi.org')) {
              pagePaths = await this.downloadMangaShiChapterImages(
                chapter,
                createdChapter._id.toString(),
              );
            } else {
              throw error; // Re-throw for other domains
            }
          }

          await this.chaptersService.update(createdChapter._id.toString(), {
            pages: pagePaths,
          });
        }

        importedChapters.push(createdChapter);
        this.logger.log(`Imported chapter ${chapterNumber}: ${chapter.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to import chapter ${chapter.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return {
      title: createdTitle,
      importedChapters,
      totalChapters: importedChapters.length,
    };
  }

  getParserForUrl(url: string): MangaParser | null {
    for (const [site, parser] of this.parsers) {
      if (url.includes(site)) {
        return parser;
      }
    }
    return null;
  }

  async parseAndImportChapters(
    parseChapterDto: ParseChapterDto,
  ): Promise<any[]> {
    const { url, titleId, chapterNumbers } = parseChapterDto;

    // Verify title exists
    await this.titlesService.findById(titleId);

    // Find the appropriate parser
    const parser = this.getParserForUrl(url);
    if (!parser) {
      throw new BadRequestException(
        'Unsupported site. Only manga-shi.org, senkuro.me, and mangabuff.ru are supported for chapter import.',
      );
    }

    // Parse manga to get all chapters
    const parsedData = await parser.parse(url);
    let selectedChapters = parsedData.chapters;

    // Filter chapters if specific numbers requested
    if (chapterNumbers && chapterNumbers.length > 0) {
      const requestedNumbers = this.parseChapterNumbers(chapterNumbers);
      selectedChapters = parsedData.chapters.filter(
        (ch) => ch.number && requestedNumbers.has(ch.number),
      );
    }

    if (selectedChapters.length === 0) {
      // Проверяем, есть ли вообще главы в распаршенных данных
      if (parsedData.chapters.length === 0) {
        throw new BadRequestException(
          'No chapters found on the source website',
        );
      } else {
        throw new BadRequestException(
          'No chapters found to import (all chapters may already exist)',
        );
      }
    }

    // Import chapters
    const importedChapters: any[] = [];
    for (const chapter of selectedChapters) {
      try {
        const chapterNumber = chapter.number || 1;

        const createChapterDto: CreateChapterDto = {
          titleId,
          chapterNumber,
          name: chapter.name,
          isPublished: true,
        };

        const createdChapter =
          await this.chaptersService.create(createChapterDto);

        // Download images for senkuro.me, manga-shi.org, and mangabuff.ru
        if (chapter.slug || chapter.url) {
          const domain = this.extractDomain(url);
          let pagePaths: string[] = [];

          try {
            pagePaths = await this.downloadChapterImages(
              chapter,
              createdChapter._id.toString(),
              domain,
            );
          } catch (error) {
            // For manga-shi.org and mangabuff.ru, we need to implement different download methods
            if (url.includes('manga-shi.org')) {
              pagePaths = await this.downloadMangaShiChapterImages(
                chapter,
                createdChapter._id.toString(),
              );
            } else if (url.includes('mangabuff.ru')) {
              pagePaths = await this.downloadMangabuffChapterImages(
                chapter,
                createdChapter._id.toString(),
              );
            } else {
              throw error; // Re-throw for other domains
            }
          }

          await this.chaptersService.update(createdChapter._id.toString(), {
            pages: pagePaths,
          });
        }
        importedChapters.push(createdChapter);
        this.logger.log(`Imported chapter ${chapterNumber}: ${chapter.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to import chapter ${chapter.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return importedChapters;
  }

  private extractDomain(url: string): string {
    const urlObj = new URL(url);
    return urlObj.hostname;
  }

  async parseChaptersInfo(
    parseChaptersInfoDto: ParseChaptersInfoDto,
  ): Promise<{ title: string; chapters: ChapterInfo[] }> {
    const { url, chapterNumbers } = parseChaptersInfoDto;

    // Find the appropriate parser
    const parser = this.getParserForUrl(url);
    if (!parser) {
      throw new BadRequestException(
        'Unsupported site. Only manga-shi.org and senkuro.me are supported.',
      );
    }

    // Parse the manga data
    const parsedData = await parser.parse(url);

    // Filter chapters if specific numbers requested
    let chapters = parsedData.chapters;
    if (chapterNumbers && chapterNumbers.length > 0) {
      const requestedNumbers = this.parseChapterNumbers(chapterNumbers);
      chapters = chapters.filter(
        (ch) => ch.number && requestedNumbers.has(ch.number),
      );
    }

    if (chapters.length === 0 && parsedData.chapters.length > 0) {
      throw new BadRequestException(
        'No chapters found to import (all chapters may already exist)',
      );
    }

    if (chapters.length === 0 && parsedData.chapters.length === 0) {
      throw new BadRequestException('No chapters found on the source website');
    }

    return {
      title: parsedData.title,
      chapters,
    };
  }

  getSupportedSites(): { sites: string[] } {
    return {
      sites: ['manga-shi.org', 'senkuro.me', 'mangabuff.ru'],
    };
  }
}
