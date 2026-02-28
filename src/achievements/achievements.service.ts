import { Injectable } from '@nestjs/common';

export type AchievementType =
  | 'reading'
  | 'collection'
  | 'social'
  | 'veteran'
  | 'special'
  | 'level';

export type AchievementRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export interface AchievementLevel {
  level: number;
  threshold: number;
  name: string;
  rarity: AchievementRarity;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: AchievementType;
  levels: AchievementLevel[];
}

export interface UserAchievementData {
  achievementId: string;
  level: number;
  unlockedAt: Date;
  progress: number;
}

export interface UnlockedAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: AchievementType;
  rarity: AchievementRarity;
  level: number;
  levelName: string;
  unlockedAt: string;
  progress: number;
  maxProgress: number;
}

@Injectable()
export class AchievementsService {
  private readonly achievements: AchievementDefinition[] = [
    {
      id: 'reader',
      name: 'Читатель',
      description: 'Прочитайте главы манги',
      icon: 'book-open',
      type: 'reading',
      levels: [
        { level: 1, threshold: 1, name: 'Новичок', rarity: 'common' },
        { level: 2, threshold: 10, name: 'Любитель', rarity: 'common' },
        { level: 3, threshold: 50, name: 'Книжный червь', rarity: 'uncommon' },
        { level: 4, threshold: 100, name: 'Заядлый', rarity: 'rare' },
        { level: 5, threshold: 500, name: 'Мастер', rarity: 'epic' },
        { level: 6, threshold: 1000, name: 'Легенда', rarity: 'epic' },
        { level: 7, threshold: 5000, name: 'Всезнающий', rarity: 'legendary' },
      ],
    },
    {
      id: 'collector',
      name: 'Коллекционер',
      description: 'Добавляйте мангу в закладки',
      icon: 'bookmark',
      type: 'collection',
      levels: [
        { level: 1, threshold: 1, name: 'Начинающий', rarity: 'common' },
        { level: 2, threshold: 10, name: 'Собиратель', rarity: 'common' },
        { level: 3, threshold: 25, name: 'Знаток', rarity: 'uncommon' },
        { level: 4, threshold: 50, name: 'Ценитель', rarity: 'rare' },
        { level: 5, threshold: 100, name: 'Хранитель', rarity: 'epic' },
      ],
    },
    {
      id: 'cultivator',
      name: 'Культиватор',
      description: 'Повышайте уровень аккаунта',
      icon: 'crown',
      type: 'level',
      levels: [
        { level: 1, threshold: 5, name: 'Ученик', rarity: 'common' },
        { level: 2, threshold: 10, name: 'Адепт', rarity: 'uncommon' },
        { level: 3, threshold: 25, name: 'Мастер', rarity: 'rare' },
        { level: 4, threshold: 50, name: 'Грандмастер', rarity: 'epic' },
        { level: 5, threshold: 80, name: 'Бессмертный', rarity: 'legendary' },
      ],
    },
    {
      id: 'veteran',
      name: 'Ветеран',
      description: 'Время на сайте',
      icon: 'clock',
      type: 'veteran',
      levels: [
        { level: 1, threshold: 7, name: 'Неделя', rarity: 'common' },
        { level: 2, threshold: 30, name: 'Месяц', rarity: 'uncommon' },
        { level: 3, threshold: 90, name: 'Сезон', rarity: 'rare' },
        { level: 4, threshold: 180, name: 'Полгода', rarity: 'epic' },
        { level: 5, threshold: 365, name: 'Год', rarity: 'legendary' },
      ],
    },
    {
      id: 'social',
      name: 'Социальный',
      description: 'Привяжите аккаунты соцсетей',
      icon: 'users',
      type: 'social',
      levels: [
        { level: 1, threshold: 1, name: 'Подтверждён', rarity: 'common' },
        { level: 2, threshold: 2, name: 'Связан', rarity: 'uncommon' },
        { level: 3, threshold: 3, name: 'Интегрирован', rarity: 'rare' },
      ],
    },
  ];

  getAchievementDefinitions(): AchievementDefinition[] {
    return this.achievements;
  }

  getAchievementById(id: string): AchievementDefinition | undefined {
    return this.achievements.find((a) => a.id === id);
  }

  /**
   * Проверяет достижения и возвращает список новых разблокированных.
   */
  checkAchievements(
    userAchievements: UserAchievementData[],
    stats: {
      chaptersRead: number;
      bookmarksCount: number;
      userLevel: number;
      daysSinceJoined: number;
      socialConnections: number;
    },
  ): {
    updatedAchievements: UserAchievementData[];
    newUnlocked: UnlockedAchievement[];
  } {
    const updatedAchievements: UserAchievementData[] = [...userAchievements];
    const newUnlocked: UnlockedAchievement[] = [];

    const statsMap: Record<string, number> = {
      reader: stats.chaptersRead,
      collector: stats.bookmarksCount,
      cultivator: stats.userLevel,
      veteran: stats.daysSinceJoined,
      social: stats.socialConnections,
    };

    for (const achDef of this.achievements) {
      const currentProgress = statsMap[achDef.id] ?? 0;
      const existingAch = updatedAchievements.find(
        (a) => a.achievementId === achDef.id,
      );
      const currentLevel = existingAch?.level ?? 0;

      let newLevel = 0;
      let newLevelData: AchievementLevel | null = null;

      for (const lvl of achDef.levels) {
        if (currentProgress >= lvl.threshold) {
          newLevel = lvl.level;
          newLevelData = lvl;
        }
      }

      if (newLevel > currentLevel) {
        const nextLevelThreshold =
          achDef.levels.find((l) => l.level === newLevel + 1)?.threshold ??
          newLevelData?.threshold ??
          currentProgress;

        if (existingAch) {
          existingAch.level = newLevel;
          existingAch.progress = currentProgress;
          existingAch.unlockedAt = new Date();
        } else {
          updatedAchievements.push({
            achievementId: achDef.id,
            level: newLevel,
            unlockedAt: new Date(),
            progress: currentProgress,
          });
        }

        if (newLevelData) {
          newUnlocked.push({
            id: achDef.id,
            name: achDef.name,
            description: achDef.description,
            icon: achDef.icon,
            type: achDef.type,
            rarity: newLevelData.rarity,
            level: newLevel,
            levelName: newLevelData.name,
            unlockedAt: new Date().toISOString(),
            progress: currentProgress,
            maxProgress: nextLevelThreshold,
          });
        }
      } else if (existingAch && currentProgress !== existingAch.progress) {
        existingAch.progress = currentProgress;
      }
    }

    return { updatedAchievements, newUnlocked };
  }

  /**
   * Получает все достижения пользователя с полной информацией.
   */
  getUserAchievements(
    userAchievements: UserAchievementData[],
    stats: {
      chaptersRead: number;
      bookmarksCount: number;
      userLevel: number;
      daysSinceJoined: number;
      socialConnections: number;
    },
  ): UnlockedAchievement[] {
    const result: UnlockedAchievement[] = [];

    const statsMap: Record<string, number> = {
      reader: stats.chaptersRead,
      collector: stats.bookmarksCount,
      cultivator: stats.userLevel,
      veteran: stats.daysSinceJoined,
      social: stats.socialConnections,
    };

    for (const achDef of this.achievements) {
      const existingAch = userAchievements.find(
        (a) => a.achievementId === achDef.id,
      );
      if (!existingAch || existingAch.level === 0) continue;

      const levelData = achDef.levels.find(
        (l) => l.level === existingAch.level,
      );
      if (!levelData) continue;

      const nextLevelThreshold =
        achDef.levels.find((l) => l.level === existingAch.level + 1)
          ?.threshold ?? levelData.threshold;

      result.push({
        id: achDef.id,
        name: achDef.name,
        description: achDef.description,
        icon: achDef.icon,
        type: achDef.type,
        rarity: levelData.rarity,
        level: existingAch.level,
        levelName: levelData.name,
        unlockedAt: existingAch.unlockedAt.toISOString(),
        progress: statsMap[achDef.id] ?? existingAch.progress,
        maxProgress: nextLevelThreshold,
      });
    }

    return result;
  }
}
