/**
 * DTO для ответа о начислении опыта при чтении главы.
 * Используется для интеграции с системой уведомлений на фронтенде.
 */
export interface ProgressEventDto {
  expGained: number;
  reason: string;
  levelUp: boolean;
  newLevel?: number;
  oldLevel?: number;
  bonusCoins?: number;
  /** Бонус XP за серию дней чтения */
  streakBonus?: number;
}

export interface RankInfoDto {
  rank: number;
  stars: number;
  name: string;
  minLevel: number;
}

export type AchievementRarityDto =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type AchievementTypeDto =
  | 'reading'
  | 'collection'
  | 'social'
  | 'veteran'
  | 'special'
  | 'level';

export interface UnlockedAchievementDto {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: AchievementTypeDto;
  rarity: AchievementRarityDto;
  level: number;
  levelName: string;
  unlockedAt: string;
  progress: number;
  maxProgress: number;
}

export interface ReadingDropItemDto {
  itemId: string;
  count: number;
  name?: string;
  icon?: string;
}

export interface ReadingCardDropDto {
  id: string;
  name: string;
  characterId?: string | null;
  characterName?: string;
  titleId?: string | null;
  titleName?: string;
  currentStage: string;
  stageImageUrl?: string;
  isNew?: boolean;
  shardsGained?: number;
}

export interface LightTitleInfo {
  name: string;
  slug: string;
}

export interface LightReadingHistoryEntry {
  titleId: string;
  title: LightTitleInfo;
  readAt: string;
  lastChapter: {
    chapterId: string;
    chapterNumber: number;
    chapterTitle?: string;
    readAt: string;
  } | null;
  chaptersCount: number;
  totalChapters: number;
  progressPercent: number;
}

export interface ReadingProgressResponseDto {
  user: {
    _id: string;
    level: number;
    experience: number;
    balance: number;
  };
  progress?: ProgressEventDto;
  oldRank?: RankInfoDto;
  newRank?: RankInfoDto;
  newAchievements?: UnlockedAchievementDto[];
  /** Дропы за чтение (при добавлении новой главы в историю) */
  readingDrops?: ReadingDropItemDto[];
  /** Дропы карточек/осколков за чтение */
  readingCardDrops?: ReadingCardDropDto[];
}

/** Событие в истории прогресса (для GET profile/progress-history) */
export type ProgressHistoryEventDto =
  | {
      id: string;
      type: 'exp_gain';
      amount: number;
      reason: string;
      timestamp: string;
    }
  | {
      id: string;
      type: 'level_up';
      oldLevel: number;
      newLevel: number;
      oldRank?: RankInfoDto;
      newRank?: RankInfoDto;
      timestamp: string;
    }
  | {
      id: string;
      type: 'achievement';
      achievement: UnlockedAchievementDto;
      timestamp: string;
    };
