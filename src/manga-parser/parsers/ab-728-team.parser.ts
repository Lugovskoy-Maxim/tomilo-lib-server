import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { MangaParser, ParsedMangaData, ChapterInfo } from './base.parser';

/** Label/value pair from API */
interface LabelValue {
  value: string;
  label: string;
}

/** Comic response from backend/comic.get */
interface Ab728ComicResponse {
  ts: number;
  end: string;
  msg: string | null;
  server: {
    comic: {
      slug: string;
      display: string;
      english?: string;
      original?: string;
      names?: string;
      genre?: LabelValue;
      type?: LabelValue;
      year?: number;
      restriction?: LabelValue;
      status?: LabelValue;
      scanlate?: LabelValue;
      format?: string;
      category?: LabelValue[];
      tags?: LabelValue[];
      description?: string;
      censorship?: LabelValue;
      rape?: LabelValue;
      links?: { value: string; url: string }[];
      cover?: string;
      views?: Record<string, unknown>;
      created_at?: number;
      updated_at?: number;
    };
    branches: {
      branch: string;
      squads: unknown[];
      chapters: {
        ordinal: string;
        display: string;
        publish: number;
        translators: string;
        show_upd: boolean;
      }[];
    }[];
  };
}

@Injectable()
export class Ab728TeamParser implements MangaParser {
  private session: AxiosInstance;
  private readonly baseUrl = 'https://ab.728.team';

  constructor() {
    this.session = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'ru,en;q=0.9',
        Origin: this.baseUrl,
        Referer: `${this.baseUrl}/`,
        'X-Requested-With': 'XMLHttpRequest',
        'its-728': 'true',
      },
    });
  }

  async parse(url: string): Promise<ParsedMangaData> {
    try {
      const slug = this.extractSlug(url);
      if (!slug) {
        throw new BadRequestException(
          'Invalid ab.728.team URL. Expected format: https://ab.728.team/comic/{slug}',
        );
      }

      const response = await this.session.get<Ab728ComicResponse>(
        `${this.baseUrl}/backend/comic.get`,
        { params: { target: slug } },
      );

      if (response.status !== 200) {
        throw new BadRequestException(
          `Failed to fetch comic data. Status: ${response.status}`,
        );
      }

      const data = response.data;
      if (data?.end !== 'success' || !data?.server?.comic) {
        throw new BadRequestException(
          'Invalid API response: missing or unsuccessful comic data',
        );
      }

      const comic = data.server.comic;

      const genres: string[] = [];
      if (comic.genre?.label) genres.push(comic.genre.label);
      if (Array.isArray(comic.category)) {
        for (const c of comic.category) {
          if (c?.label) genres.push(c.label);
        }
      }

      const tags: string[] = [];
      if (Array.isArray(comic.tags)) {
        for (const t of comic.tags) {
          if (t?.label) tags.push(t.label);
        }
      }

      const alternativeTitles: string[] = [];
      if (comic.english) alternativeTitles.push(comic.english);
      if (comic.original) alternativeTitles.push(comic.original);
      if (comic.names) alternativeTitles.push(comic.names);

      const coverUrl = comic.cover
        ? `${this.baseUrl}/storage/${comic.cover}`
        : undefined;

      const chapters = this.collectChapters(comic.slug, data.server.branches);

      return {
        title: comic.display || comic.english || comic.slug,
        alternativeTitles:
          alternativeTitles.length > 0 ? alternativeTitles : undefined,
        description: comic.description || undefined,
        coverUrl,
        genres: genres.length > 0 ? genres : undefined,
        tags: tags.length > 0 ? tags : undefined,
        releaseYear:
          typeof comic.year === 'number' && comic.year > 0
            ? comic.year
            : undefined,
        type: comic.type?.label || undefined,
        chapters,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new BadRequestException(
          `Failed to parse ab.728.team: ${error.message}`,
        );
      }
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Failed to parse ab.728.team: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private extractSlug(url: string): string | null {
    const match = url.match(/ab\.728\.team\/comic\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private collectChapters(
    comicSlug: string,
    branches: Ab728ComicResponse['server']['branches'],
  ): ChapterInfo[] {
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();

    for (const branch of branches || []) {
      for (const ch of branch.chapters || []) {
        const ordinal = ch.ordinal?.trim();
        if (!ordinal || seen.has(ordinal)) continue;
        seen.add(ordinal);
        const num = parseInt(ordinal, 10);
        chapters.push({
          name: ch.display || `${ordinal} глава`,
          number: Number.isNaN(num) ? undefined : num,
          slug: ordinal,
          url: `${this.baseUrl}/comic/${comicSlug}/${ordinal}`,
        });
      }
    }

    chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    return chapters;
  }
}
