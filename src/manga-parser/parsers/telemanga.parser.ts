import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

interface TelemangaMangaResponse {
  manga: {
    id: string;
    titleRu: string;
    titleEn: string;
    type: string;
    cover: string;
    rating: number;
    year: number;
    totalChapters: number;
    url: string;
    description: string;
    follows: number;
    status: string;
    limitation: boolean;
    chapters: any[];
    lastUpdated: string;
    publishedAt: string;
    authors: any[];
    artists: any[];
    genres: { name: string }[];
    themes: { name: string }[];
    formats: { name: string }[];
    updatedAt: string;
    createdAt: string;
  };
}

interface TelemangaChapter {
  id: string;
  mangaId: string;
  numeration: number;
  totalPages: number;
  createdAt: string;
}

interface TelemangaChaptersResponse {
  chapters: TelemangaChapter[];
}

interface TelemangaChapterPagesResponse {
  result: {
    pages: string[];
    prevChapter?: {
      id: string;
      numeration: number;
    };
    nextChapter?: {
      id: string;
      numeration: number;
    };
  };
}

@Injectable()
export class TelemangaParser implements MangaParser {
  private session: AxiosInstance;
  private readonly baseUrl = 'https://telemanga.me';

  constructor() {
    this.session = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
        Accept: 'application/json',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        Origin: this.baseUrl,
        Referer: `${this.baseUrl}/`,
      },
    });
  }

  async parse(url: string): Promise<ParsedMangaData> {
    try {
      // Extract manga slug from URL
      // URL format: https://telemanga.me/manga/slug
      const slug = this.extractSlug(url);
      if (!slug) {
        throw new BadRequestException(
          'Invalid telemanga.me URL. Expected format: https://telemanga.me/manga/{slug}',
        );
      }

      // Fetch manga details
      const mangaResponse = await this.session.get<TelemangaMangaResponse>(
        `${this.baseUrl}/api/manga/${slug}`,
      );

      if (mangaResponse.status !== 200) {
        throw new BadRequestException(
          `Failed to fetch manga data. Status: ${mangaResponse.status}`,
        );
      }

      const mangaData = mangaResponse.data?.manga;
      if (!mangaData) {
        throw new BadRequestException(
          'Invalid API response: missing manga object',
        );
      }

      // Extract genres, themes, formats (защита от null/undefined)
      const safeNames = (arr: unknown[] | undefined): string[] =>
        Array.isArray(arr)
          ? (arr as { name?: string }[])
              .map((x) => x?.name)
              .filter((n): n is string => typeof n === 'string')
          : [];
      const genres: string[] = [
        ...safeNames(mangaData.genres),
        ...safeNames(mangaData.themes),
        ...safeNames(mangaData.formats),
      ];

      // Build alternative titles
      const alternativeTitles: string[] = [];
      if (mangaData.titleEn) {
        alternativeTitles.push(mangaData.titleEn);
      }

      // Author(s) и artist(s) из API
      const author = this.joinNames(mangaData.authors);
      const artist = this.joinNames(mangaData.artists);

      // Extract chapters
      const chapters = await this.fetchChapters(slug);

      return {
        title: mangaData.titleRu || mangaData.titleEn || slug,
        alternativeTitles:
          alternativeTitles.length > 0 ? alternativeTitles : undefined,
        description: mangaData.description || undefined,
        coverUrl: mangaData.cover || undefined,
        genres: genres.length > 0 ? genres : undefined,
        author: author || undefined,
        artist: artist || undefined,
        releaseYear:
          typeof mangaData.year === 'number' && mangaData.year > 0
            ? mangaData.year
            : undefined,
        type: mangaData.type || undefined,
        chapters,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new BadRequestException(
          `Failed to parse telemanga.me: ${error.message}`,
        );
      }
      throw new BadRequestException(
        `Failed to parse telemanga.me: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Собирает строку имён из массива авторов/художников API (name или content).
   */
  private joinNames(items: unknown[] | undefined): string {
    if (!Array.isArray(items) || items.length === 0) return '';
    const names = items
      .map((item: unknown) => {
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          if (typeof o.name === 'string') return o.name;
          if (typeof o.content === 'string') return o.content;
          if (typeof o.title === 'string') return o.title;
        }
        return '';
      })
      .filter(Boolean);
    return names.join(', ');
  }

  private extractSlug(url: string): string | null {
    // Try to extract slug from URL
    // Format: https://telemanga.me/manga/{slug}
    const match = url.match(/telemanga\.me\/manga\/([^/]+)/);
    if (match) {
      // Decode URI component to handle special characters
      return decodeURIComponent(match[1]);
    }
    return null;
  }

  private async fetchChapters(slug: string): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];

    try {
      // Fetch chapters in batches (pagination)
      let page = 0;
      const limit = 100; // Maximum items per request
      let hasMore = true;

      while (hasMore) {
        const chaptersResponse =
          await this.session.get<TelemangaChaptersResponse>(
            `${this.baseUrl}/api/manga/${slug}/chapters`,
            {
              params: {
                limit,
                page,
                sortOrder: 'DESC', // Most recent first
              },
            },
          );

        if (chaptersResponse.status !== 200) {
          break;
        }

        const data = chaptersResponse.data;
        const chapterList = data.chapters || [];

        if (chapterList.length === 0) {
          hasMore = false;
          break;
        }

        // Add chapters to the list
        for (const chapter of chapterList) {
          chapters.push({
            name: `Глава ${chapter.numeration}`,
            number: chapter.numeration,
            slug: chapter.id, // Store chapter ID
          });
        }

        // Check if we got fewer results than limit (last page)
        if (chapterList.length < limit) {
          hasMore = false;
        } else {
          page++;
        }

        // Add a small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(
        `Failed to fetch chapters for ${slug}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }

    return chapters;
  }

  /**
   * Get chapter page URLs for downloading images
   * Uses chapter number (numeration) in the URL
   * @param mangaSlug - The manga slug
   * @param chapterNumber - The chapter number (numeration)
   * @returns Array of page image URLs
   */
  async getChapterPages(
    mangaSlug: string,
    chapterNumber: number,
  ): Promise<string[]> {
    try {
      const response = await this.session.get<TelemangaChapterPagesResponse>(
        `${this.baseUrl}/api/manga/${mangaSlug}/chapter/${chapterNumber}`,
      );

      if (response.status !== 200) {
        throw new Error(
          `Failed to fetch chapter pages. Status: ${response.status}`,
        );
      }

      // Get pages array from response
      const pagesData = response.data.result?.pages || [];

      return pagesData;
    } catch (error) {
      console.error(
        `Failed to fetch chapter pages:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return [];
    }
  }
}
