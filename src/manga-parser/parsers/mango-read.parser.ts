import { Injectable, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { MangaParser, ParsedMangaData } from './base.parser';

const API_BASE = 'https://mango-read.org/api/v2';

interface MangoReadProject {
  id: number;
  title: string;
  transliterated_name: string;
  description?: string;
  type?: string;
  project_status?: string;
  translation_status?: string;
  release_year?: number;
  age_rating?: number;
  cover_image?: {
    id: number;
    core_url: string | null;
    selectel_url: string | null;
  };
  cover_url?: string;
  alternative_titles?: string[];
  genres?: string[];
  authors?: string[];
  artists?: string[];
  chapter_count?: number;
}

interface MangoReadChapterListItem {
  id: number;
  chapter_number: number;
  volume_number: number;
  title: string | null;
  page_count: number;
  project_title: string;
  transliterated_name: string;
}

interface MangoReadChapterPage {
  id: number;
  page_number: number;
  image_url: string;
  image?: { id: number; core_url: string | null; selectel_url: string | null };
}

interface MangoReadChapterDetail {
  id: number;
  project_id: number;
  chapter_number: number;
  volume_number: number;
  title: string | null;
  pages: MangoReadChapterPage[];
}

@Injectable()
export class MangoReadParser implements MangaParser {
  private session: AxiosInstance;

  constructor() {
    this.session = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36',
        Accept: 'application/json',
      },
    });
  }

  async parse(url: string): Promise<ParsedMangaData> {
    const slug = this.extractSlugFromUrl(url);
    if (!slug) {
      throw new BadRequestException(
        'Invalid mango-read.org URL. Expected: https://mango-read.org/manga/{transliterated_name}',
      );
    }

    const project = await this.fetchProject(slug);
    const chapters = await this.fetchChaptersList(project.id);

    const coverUrl =
      project.cover_url || project.cover_image?.core_url || undefined;

    return {
      title: project.title,
      alternativeTitles:
        project.alternative_titles && project.alternative_titles.length > 0
          ? project.alternative_titles
          : undefined,
      description: project.description ?? undefined,
      coverUrl: coverUrl ?? undefined,
      genres:
        project.genres && project.genres.length > 0
          ? project.genres
          : undefined,
      author:
        project.authors && project.authors.length > 0
          ? project.authors.join(', ')
          : undefined,
      artist:
        project.artists && project.artists.length > 0
          ? project.artists.join(', ')
          : undefined,
      releaseYear: project.release_year ?? undefined,
      type: project.type ?? undefined,
      chapters: chapters.map((ch) => ({
        name:
          ch.title && ch.title.trim() ? ch.title : `Глава ${ch.chapter_number}`,
        number: ch.chapter_number,
        pageCount: ch.page_count,
        /** "volume_number/chapter_number" for API: GET /chapters/{slug}/{volume}/{chapter} */
        slug: `${ch.volume_number}/${ch.chapter_number}`,
      })),
    };
  }

  private extractSlugFromUrl(url: string): string | null {
    const match = url.match(/mango-read\.org\/manga\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private async fetchProject(
    transliteratedName: string,
  ): Promise<MangoReadProject> {
    const res = await this.session.get<MangoReadProject>(
      `${API_BASE}/projects/${encodeURIComponent(transliteratedName)}`,
    );
    if (res.status !== 200 || !res.data) {
      throw new BadRequestException(
        `Failed to fetch project: ${res.status} ${res.statusText}`,
      );
    }
    return res.data;
  }

  private async fetchChaptersList(
    projectId: number,
  ): Promise<MangoReadChapterListItem[]> {
    const res = await this.session.get<MangoReadChapterListItem[]>(
      `${API_BASE}/chapters/project/${projectId}`,
    );
    if (res.status !== 200) {
      throw new BadRequestException(
        `Failed to fetch chapters: ${res.status} ${res.statusText}`,
      );
    }
    const list = Array.isArray(res.data) ? res.data : [];
    // API returns chapters in descending order by chapter_number; we need ascending for consistent order
    list.sort((a, b) => a.chapter_number - b.chapter_number);
    return list;
  }

  /**
   * Fetches chapter detail with page image URLs (for use by service when downloading).
   * Call with slug = transliterated_name, chapterSlug = "volume_number/chapter_number".
   */
  static async fetchChapterPages(
    session: AxiosInstance,
    transliteratedName: string,
    chapterSlug: string,
  ): Promise<{ imageUrls: string[] }> {
    const [volStr, chStr] = chapterSlug.split('/');
    const volumeNumber = parseInt(volStr ?? '0', 10);
    const chapterNumber = parseFloat(chStr ?? '0');
    if (isNaN(chapterNumber)) {
      throw new BadRequestException(`Invalid chapter slug: ${chapterSlug}`);
    }
    const url = `${API_BASE}/chapters/${encodeURIComponent(transliteratedName)}/${volumeNumber}/${chapterNumber}`;
    const res = await session.get<MangoReadChapterDetail>(url);
    if (res.status !== 200 || !res.data) {
      throw new BadRequestException(
        `Failed to fetch chapter pages: ${res.status}`,
      );
    }
    const pages = res.data.pages ?? [];
    const imageUrls = pages
      .sort((a, b) => a.page_number - b.page_number)
      .map((p) => p.image_url || p.image?.core_url)
      .filter((u): u is string => Boolean(u));
    return { imageUrls };
  }
}
