import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { TitlesService } from '../titles/titles.service';
import { ChaptersService } from '../chapters/chapters.service';
import { FilesService } from '../files/files.service';
import { CreateTitleDto } from '../titles/dto/create-title.dto';
import { CreateChapterDto } from '../chapters/dto/create-chapter.dto';
import { ParseTitleDto } from './dto/parse-title.dto';
import { ParseChapterDto } from './dto/parse-chapter.dto';
import { MangaParser, ChapterInfo } from './parsers/base.parser';
import { SenkuroParser } from './parsers/senkuro.parser';
import { MangaShiParser } from './parsers/manga-shi.parser';

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

  async parseAndImportTitle(
    parseTitleDto: ParseTitleDto,
  ): Promise<{ title: any; importedChapters: any[]; totalChapters: number }> {
    const {
      url,
      chapterNumbers,
      customTitle,
      customDescription,
      customGenres,
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
      throw new BadRequestException('No chapters found to import');
    }

    // Create title
    const createTitleDto: CreateTitleDto = {
      name: customTitle || this.sanitizeFilename(parsedData.title),
      altNames: parsedData.alternativeTitles || [],
      description:
        customDescription || parsedData.description || `Imported from ${url}`,
      genres: customGenres || parsedData.genres || ['Unknown'],
      coverImage: parsedData.coverUrl,
      isPublished: true,
    };

    const createdTitle = await this.titlesService.create(createTitleDto);
    this.logger.log(`Created title: ${createdTitle.name}`);

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

        // Download images if it's senkuro.me or sencuro.me
        if (chapter.slug) {
          const domain = this.extractDomain(url);
          const pagePaths = await this.downloadChapterImages(
            chapter,
            createdChapter._id.toString(),
            domain,
          );
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

  private getParserForUrl(url: string): MangaParser | null {
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
        'Unsupported site. Only senkuro.me is supported for chapter import.',
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
      throw new BadRequestException('No chapters found to import');
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

        // Download images
        const domain = this.extractDomain(url);
        const pagePaths = await this.downloadChapterImages(
          chapter,
          createdChapter._id.toString(),
          domain,
        );
        await this.chaptersService.update(createdChapter._id.toString(), {
          pages: pagePaths,
        });

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

  getSupportedSites(): { sites: string[] } {
    return {
      sites: ['manga-shi.org', 'senkuro.me', 'sencuro.me'],
    };
  }
}
