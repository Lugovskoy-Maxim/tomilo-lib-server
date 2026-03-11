export interface ParsingProgressDto {
  type: 'chapters_info' | 'chapter_import' | 'title_import' | 'batch_import';
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
  /** Для batch_import: прогресс по тайтлам (например "Тайтл 2 из 5") */
  batch?: {
    currentTitleIndex: number;
    totalTitles: number;
    currentTitleName?: string;
    titleProgress?: { current: number; total: number; percentage: number };
  };
}

/** Репортер прогресса парсинга: сервис вызывает report(), gateway реализует отправку в WebSocket. */
export interface IParsingProgressReporter {
  report(progress: ParsingProgressDto): void;
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
  chapterProgress?: { current: number; total: number; percentage: number };
}
