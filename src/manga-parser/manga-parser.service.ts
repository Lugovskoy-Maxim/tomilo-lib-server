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

interface ChapterInfo {
  name: string;
  url?: string;
  slug?: string;
  number?: number;
}

@Injectable()
export class MangaParserService {
  private readonly logger = new Logger(MangaParserService.name);
  private session: AxiosInstance;

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
  }

  private sanitizeFilename(name: string): string {
    if (!name) return 'unknown';
    return name.replace(/[\\/*?:"<>|]/g, '_').trim();
  }

  private async parseMangaShi(
    url: string,
  ): Promise<{ title: string; chapters: ChapterInfo[] }> {
    try {
      const response = await this.session.get(url);
      const $ = cheerio.load(response.data);

      const title = $('.post-title').text().trim() || url;
      const ajaxUrl = url.replace(/\/$/, '') + '/ajax/chapters/?t=1';

      const ajaxResponse = await this.session.post(ajaxUrl);
      const $$ = cheerio.load(ajaxResponse.data);

      const chapters: ChapterInfo[] = [];
      $$('li.wp-manga-chapter a').each((_, element) => {
        const name = $$(element).text().trim();
        const link = $$(element).attr('href');
        if (name && link) {
          chapters.push({ name, url: link });
        }
      });

      chapters.reverse();
      return { title, chapters };
    } catch (error) {
      this.logger.error(
        `Failed to parse manga-shi.org: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to parse manga-shi.org');
    }
  }

  private async parseSenkuro(
    url: string,
  ): Promise<{ title: string; chapters: ChapterInfo[] }> {
    try {
      const urlObj = new URL(url);
      const slug = url.split('/manga/')[1]?.replace(/\/$/, '') || '';
      const domain = urlObj.hostname;

      const graphqlUrl = `https://api.${domain}/graphql`;
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: `https://${domain}`,
        Referer: `https://${domain}/`,
      };

      // Get branches
      const branchesQuery = `
        query MangaBranches($slug: String!) {
          manga(slug: $slug) {
            id
            branches {
              id
              primaryBranch
            }
          }
        }
      `;

      const branchesResponse = await this.session.post(
        graphqlUrl,
        {
          query: branchesQuery,
          variables: { slug },
        },
        { headers },
      );

      const branchesData = branchesResponse.data.data?.manga;
      if (!branchesData) {
        throw new Error('No manga data found');
      }

      const branches = branchesData.branches || [];
      let branchId = (branches as any[]).find((b) => b.primaryBranch)?.id;
      if (!branchId && branches.length > 0) {
        branchId = branches[0].id;
      }

      if (!branchId) {
        throw new Error('No branch ID found');
      }

      // Get chapters
      const chaptersQuery = `
        query ChaptersByBranch($branchId: ID!, $first: Int!, $after: String) {
          mangaChapters(branchId: $branchId, first: $first, after: $after) {
            edges {
              node {
                id
                slug
                name
                number
                createdAt
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const chapters: ChapterInfo[] = [];
      let hasNextPage = true;
      let after: string | undefined;

      while (hasNextPage) {
        const chaptersResponse = await this.session.post(
          graphqlUrl,
          {
            query: chaptersQuery,
            variables: { branchId, first: 100, after },
          },
          { headers },
        );

        const chaptersData = chaptersResponse.data.data?.mangaChapters;
        if (!chaptersData) break;

        for (const edge of chaptersData.edges) {
          const node = edge.node;
          const name = node.name || `Глава ${node.number}`;
          chapters.push({
            name,
            slug: node.slug,
            number: node.number,
          });
        }

        hasNextPage = chaptersData.pageInfo.hasNextPage;
        after = chaptersData.pageInfo.endCursor;

        if (hasNextPage) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      chapters.reverse();
      return { title: slug, chapters };
    } catch (error) {
      this.logger.error(
        `Failed to parse senkuro.me: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to parse senkuro.me');
    }
  }

  private async downloadChapterImages(
    chapter: ChapterInfo,
    chapterId: string,
  ): Promise<string[]> {
    if (!chapter.slug) {
      throw new BadRequestException('Chapter slug is required for downloading');
    }

    try {
      const graphqlUrl = 'https://api.senkuro.me/graphql';
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://senkuro.me',
        Referer: 'https://senkuro.me/',
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

    let title: string;
    let chapters: ChapterInfo[];

    if (url.includes('manga-shi.org')) {
      const result = await this.parseMangaShi(url);
      title = result.title;
      chapters = result.chapters;
    } else if (url.includes('senkuro.me')) {
      const result = await this.parseSenkuro(url);
      title = result.title;
      chapters = result.chapters;
    } else {
      throw new BadRequestException(
        'Unsupported site. Only manga-shi.org and senkuro.me are supported.',
      );
    }

    // Filter chapters if specific numbers requested
    if (chapterNumbers && chapterNumbers.length > 0) {
      chapters = chapters.filter(
        (ch) => ch.number && chapterNumbers.includes(ch.number),
      );
    }

    if (chapters.length === 0) {
      throw new BadRequestException('No chapters found to import');
    }

    // Create title
    const createTitleDto: CreateTitleDto = {
      name: customTitle || this.sanitizeFilename(title),
      description: customDescription || `Imported from ${url}`,
      genres: customGenres || ['Unknown'],
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

        // Download images if it's senkuro.me
        if (chapter.slug) {
          const pagePaths = await this.downloadChapterImages(
            chapter,
            createdChapter._id.toString(),
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

  async parseAndImportChapter(parseChapterDto: ParseChapterDto): Promise<any> {
    const { url, titleId, chapterNumber, customName } = parseChapterDto;

    // Verify title exists
    await this.titlesService.findById(titleId);

    let chapterInfo: ChapterInfo;

    if (url.includes('senkuro.me')) {
      // For senkuro, the URL should be a chapter URL like https://senkuro.me/chapter/slug
      if (!url.includes('/chapter/')) {
        throw new BadRequestException(
          'Invalid chapter URL. Please provide a chapter URL, not a manga URL.',
        );
      }
      const slug = url.split('/chapter/')[1]?.split('?')[0];
      if (!slug) {
        throw new BadRequestException('Invalid chapter URL');
      }

      chapterInfo = {
        name: customName || `Chapter ${chapterNumber}`,
        slug,
        number: chapterNumber,
      };
    } else {
      throw new BadRequestException(
        'Chapter import only supported for senkuro.me and sencuro.me',
      );
    }

    // Create chapter
    const createChapterDto: CreateChapterDto = {
      titleId,
      chapterNumber,
      name: chapterInfo.name,
      isPublished: true,
    };

    const createdChapter = await this.chaptersService.create(createChapterDto);

    // Download images
    const pagePaths = await this.downloadChapterImages(
      chapterInfo,
      createdChapter._id.toString(),
    );
    await this.chaptersService.update(createdChapter._id.toString(), {
      pages: pagePaths,
    });

    return createdChapter;
  }

  getSupportedSites(): { sites: string[] } {
    return {
      sites: ['manga-shi.org', 'senkuro.me', 'sencuro.me'],
    };
  }
}
