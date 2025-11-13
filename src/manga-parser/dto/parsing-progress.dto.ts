export interface ParsingProgressDto {
  type: 'chapters_info' | 'chapter_import' | 'title_import';
  sessionId: string;
  userId?: string;
  status: 'started' | 'progress' | 'completed' | 'error';
  message: string;
  data?: any;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
}

export interface ChaptersInfoData {
  title: string;
  totalChapters: number;
  chapters: Array<{
    name: string;
    number: number;
  }>;
}

export interface ChapterImportData {
  chapterNumber: number;
  chapterName: string;
  status: 'downloading' | 'completed' | 'error';
  error?: string;
}

export interface TitleImportData {
  titleName: string;
  status:
    | 'parsing'
    | 'downloading_cover'
    | 'creating_title'
    | 'importing_chapters'
    | 'completed';
  currentStep?: number;
  totalSteps?: number;
}
