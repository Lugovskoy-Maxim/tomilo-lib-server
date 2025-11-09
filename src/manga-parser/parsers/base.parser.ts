export interface ParsedMangaData {
  title: string;
  alternativeTitles?: string[];
  description?: string;
  coverUrl?: string;
  genres?: string[];
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
