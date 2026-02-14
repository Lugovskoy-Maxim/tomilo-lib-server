export interface ParsedMangaData {
  title: string;
  alternativeTitles?: string[];
  description?: string;
  coverUrl?: string;
  genres?: string[];
  /** Author(s) - может быть несколько через запятую */
  author?: string;
  /** Artist(s) - может быть несколько через запятую */
  artist?: string;
  /** Теги (отдельно от жанров, если источник различает) */
  tags?: string[];
  /** Год выхода */
  releaseYear?: number;
  /** Тип издания: манга, манхва, комикс и т.д. */
  type?: string;
  chapters: ChapterInfo[];
}

export interface ChapterInfo {
  name: string;
  url?: string;
  slug?: string;
  number?: number;
}

export interface MangaParser {
  parse(url: string): Promise<ParsedMangaData>;
}
