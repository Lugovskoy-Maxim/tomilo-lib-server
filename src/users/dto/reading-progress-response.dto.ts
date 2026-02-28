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
}
