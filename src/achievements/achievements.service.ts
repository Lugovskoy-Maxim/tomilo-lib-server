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
  expReward: number;
}

@Injectable()
export class AchievementsService {
  /** Опыт за получение достижения по редкости */
  private static readonly RARITY_EXP_REWARDS: Record<
    AchievementRarity,
    number
  > = {
    common: 10,
    uncommon: 25,
    rare: 50,
    epic: 100,
    legendary: 250,
  };

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
    {
      id: 'commentator',
      name: 'Комментатор',
      description: 'Оставляйте комментарии к главам и тайтлам',
      icon: 'message-circle',
      type: 'social',
      levels: [
        { level: 1, threshold: 5, name: 'Первый отзыв', rarity: 'common' },
        { level: 2, threshold: 50, name: 'Голос сообщества', rarity: 'common' },
        {
          level: 3,
          threshold: 250,
          name: 'Активный участник',
          rarity: 'uncommon',
        },
        { level: 4, threshold: 500, name: 'Эксперт мнений', rarity: 'rare' },
        {
          level: 5,
          threshold: 2500,
          name: 'Легенда обсуждений',
          rarity: 'epic',
        },
      ],
    },
    {
      id: 'critic',
      name: 'Критик',
      description: 'Ставьте оценки тайтлам и главам',
      icon: 'star',
      type: 'collection',
      levels: [
        { level: 1, threshold: 5, name: 'Оценка', rarity: 'common' },
        { level: 2, threshold: 50, name: 'Ценитель', rarity: 'common' },
        { level: 3, threshold: 250, name: 'Знаток', rarity: 'uncommon' },
        { level: 4, threshold: 500, name: 'Строгий судья', rarity: 'rare' },
        { level: 5, threshold: 1500, name: 'Вердикт мастера', rarity: 'epic' },
      ],
    },
    {
      id: 'marathon',
      name: 'Марафонец',
      description: 'Читайте подряд несколько дней подряд (streak)',
      icon: 'flame',
      type: 'veteran',
      levels: [
        { level: 1, threshold: 3, name: 'Три дня', rarity: 'common' },
        { level: 2, threshold: 7, name: 'Неделя', rarity: 'uncommon' },
        { level: 3, threshold: 14, name: 'Две недели', rarity: 'rare' },
        { level: 4, threshold: 30, name: 'Месяц', rarity: 'epic' },
        { level: 5, threshold: 100, name: 'Сто дней', rarity: 'legendary' },
      ],
    },
    {
      id: 'completer',
      name: 'Завершающий',
      description: 'Добавляйте тайтлы в «Прочитано»',
      icon: 'check-circle',
      type: 'collection',
      levels: [
        { level: 1, threshold: 1, name: 'Первый финиш', rarity: 'common' },
        { level: 2, threshold: 5, name: 'Любитель концовок', rarity: 'common' },
        {
          level: 3,
          threshold: 15,
          name: 'Собиратель завершений',
          rarity: 'uncommon',
        },
        { level: 4, threshold: 30, name: 'Мастер списка', rarity: 'rare' },
        {
          level: 5,
          threshold: 100,
          name: 'Легенда завершений',
          rarity: 'epic',
        },
      ],
    },
    {
      id: 'time_reader',
      name: 'Читатель времени',
      description: 'Проводите время за чтением (часы)',
      icon: 'clock',
      type: 'reading',
      levels: [
        { level: 1, threshold: 60, name: 'Час', rarity: 'common' },
        { level: 2, threshold: 300, name: 'Пять часов', rarity: 'common' },
        { level: 3, threshold: 600, name: 'Десять часов', rarity: 'uncommon' },
        { level: 4, threshold: 1800, name: '30 часов', rarity: 'rare' },
        { level: 5, threshold: 5000, name: 'Сто часов', rarity: 'epic' },
        {
          level: 6,
          threshold: 10000,
          name: 'Мастер времени',
          rarity: 'legendary',
        },
      ],
    },
    {
      id: 'saver',
      name: 'Накопитель',
      description: 'Копите монеты на балансе',
      icon: 'coins',
      type: 'special',
      levels: [
        { level: 1, threshold: 100, name: 'Первая сотня', rarity: 'common' },
        { level: 2, threshold: 500, name: 'Копилка', rarity: 'common' },
        { level: 3, threshold: 1000, name: 'Бережливый', rarity: 'uncommon' },
        { level: 4, threshold: 2500, name: 'Накопитель', rarity: 'rare' },
        { level: 5, threshold: 5000, name: 'Казначей', rarity: 'epic' },
        {
          level: 6,
          threshold: 10000,
          name: 'Владелец сундука',
          rarity: 'legendary',
        },
      ],
    },
    {
      id: 'shopper',
      name: 'Покупатель',
      description: 'Покупайте декорации в магазине',
      icon: 'shopping-bag',
      type: 'special',
      levels: [
        { level: 1, threshold: 1, name: 'Первый выбор', rarity: 'common' },
        { level: 2, threshold: 5, name: 'Клиент магазина', rarity: 'common' },
        { level: 3, threshold: 10, name: 'Покупатель', rarity: 'uncommon' },
        {
          level: 4,
          threshold: 25,
          name: 'Коллекционер декора',
          rarity: 'rare',
        },
        { level: 5, threshold: 50, name: 'Меценат', rarity: 'epic' },
      ],
    },
    {
      id: 'popular',
      name: 'Популярный',
      description: 'Получайте лайки на комментариях',
      icon: 'heart',
      type: 'social',
      levels: [
        { level: 1, threshold: 1, name: 'Первый лайк', rarity: 'common' },
        { level: 2, threshold: 10, name: 'Заметный', rarity: 'common' },
        { level: 3, threshold: 50, name: 'Популярный', rarity: 'uncommon' },
        {
          level: 4,
          threshold: 100,
          name: 'Любимец сообщества',
          rarity: 'rare',
        },
        { level: 5, threshold: 500, name: 'Звезда обсуждений', rarity: 'epic' },
      ],
    },
    {
      id: 'explorer',
      name: 'Исследователь',
      description: 'Читайте разные тайтлы (уникальные прочитанные)',
      icon: 'compass',
      type: 'reading',
      levels: [
        { level: 1, threshold: 1, name: 'Первый тайтл', rarity: 'common' },
        { level: 2, threshold: 10, name: 'Любознательный', rarity: 'common' },
        { level: 3, threshold: 50, name: 'Исследователь', rarity: 'uncommon' },
        { level: 4, threshold: 100, name: 'Широкий кругозор', rarity: 'rare' },
        { level: 5, threshold: 300, name: 'Мастер жанров', rarity: 'epic' },
      ],
    },
    {
      id: 'reporter',
      name: 'Страж порядка',
      description: 'Отправляйте жалобы на некорректный контент',
      icon: 'shield-alert',
      type: 'special',
      levels: [
        { level: 1, threshold: 1, name: 'Первый сигнал', rarity: 'common' },
        { level: 2, threshold: 5, name: 'Бдительный', rarity: 'common' },
        {
          level: 3,
          threshold: 10,
          name: 'Помощник модерации',
          rarity: 'uncommon',
        },
        { level: 4, threshold: 25, name: 'Страж порядка', rarity: 'rare' },
        {
          level: 5,
          threshold: 50,
          name: 'Защитник сообщества',
          rarity: 'epic',
        },
      ],
    },
    {
      id: 'contributor',
      name: 'Вкладчик',
      description: 'Предлагайте персонажей — за принятые предложения начисляются монеты и опыт',
      icon: 'user-plus',
      type: 'social',
      levels: [
        { level: 1, threshold: 1, name: 'Первый персонаж', rarity: 'common' },
        { level: 2, threshold: 3, name: 'Помощник каталога', rarity: 'common' },
        { level: 3, threshold: 5, name: 'Вкладчик', rarity: 'uncommon' },
        { level: 4, threshold: 10, name: 'Пополняющий галерею', rarity: 'rare' },
        { level: 5, threshold: 25, name: 'Мастер персонажей', rarity: 'epic' },
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
   * Также возвращает общий опыт за полученные достижения.
   */
  checkAchievements(
    userAchievements: UserAchievementData[],
    stats: {
      chaptersRead: number;
      bookmarksCount: number;
      userLevel: number;
      daysSinceJoined: number;
      socialConnections: number;
      commentsCount?: number;
      ratingsCount?: number;
      longestStreak?: number;
      completedTitlesCount?: number;
      readingTimeMinutes?: number;
      balance?: number;
      ownedDecorationsCount?: number;
      likesReceivedCount?: number;
      titlesReadCount?: number;
      reportsCount?: number;
      charactersAcceptedCount?: number;
    },
  ): {
    updatedAchievements: UserAchievementData[];
    newUnlocked: UnlockedAchievement[];
    totalExpReward: number;
  } {
    const updatedAchievements: UserAchievementData[] = [...userAchievements];
    const newUnlocked: UnlockedAchievement[] = [];
    let totalExpReward = 0;

    const statsMap: Record<string, number> = {
      reader: stats.chaptersRead,
      collector: stats.bookmarksCount,
      cultivator: stats.userLevel,
      veteran: stats.daysSinceJoined,
      social: stats.socialConnections,
      commentator: stats.commentsCount ?? 0,
      critic: stats.ratingsCount ?? 0,
      marathon: stats.longestStreak ?? 0,
      completer: stats.completedTitlesCount ?? 0,
      time_reader: stats.readingTimeMinutes ?? 0,
      saver: stats.balance ?? 0,
      shopper: stats.ownedDecorationsCount ?? 0,
      popular: stats.likesReceivedCount ?? 0,
      explorer: stats.titlesReadCount ?? 0,
      reporter: stats.reportsCount ?? 0,
      contributor: stats.charactersAcceptedCount ?? 0,
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
          const expReward =
            AchievementsService.RARITY_EXP_REWARDS[newLevelData.rarity] ?? 10;
          totalExpReward += expReward;

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
            expReward,
          });
        }
      } else if (existingAch && currentProgress !== existingAch.progress) {
        existingAch.progress = currentProgress;
      }
    }

    return { updatedAchievements, newUnlocked, totalExpReward };
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
      commentsCount?: number;
      ratingsCount?: number;
      longestStreak?: number;
      completedTitlesCount?: number;
      readingTimeMinutes?: number;
      balance?: number;
      ownedDecorationsCount?: number;
      likesReceivedCount?: number;
      titlesReadCount?: number;
      reportsCount?: number;
      charactersAcceptedCount?: number;
    },
  ): UnlockedAchievement[] {
    const result: UnlockedAchievement[] = [];

    const statsMap: Record<string, number> = {
      reader: stats.chaptersRead,
      collector: stats.bookmarksCount,
      cultivator: stats.userLevel,
      veteran: stats.daysSinceJoined,
      social: stats.socialConnections,
      commentator: stats.commentsCount ?? 0,
      critic: stats.ratingsCount ?? 0,
      marathon: stats.longestStreak ?? 0,
      completer: stats.completedTitlesCount ?? 0,
      time_reader: stats.readingTimeMinutes ?? 0,
      saver: stats.balance ?? 0,
      shopper: stats.ownedDecorationsCount ?? 0,
      popular: stats.likesReceivedCount ?? 0,
      explorer: stats.titlesReadCount ?? 0,
      reporter: stats.reportsCount ?? 0,
      contributor: stats.charactersAcceptedCount ?? 0,
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
        expReward:
          AchievementsService.RARITY_EXP_REWARDS[levelData.rarity] ?? 10,
      });
    }

    return result;
  }

  /**
   * Возвращает все достижения с текущим прогрессом пользователя для отображения в профиле.
   * Для каждого определения: currentLevel, currentValue, levels (пороги и названия).
   */
  getProfileAchievements(
    userAchievements: UserAchievementData[],
    stats: {
      chaptersRead: number;
      bookmarksCount: number;
      userLevel: number;
      daysSinceJoined: number;
      socialConnections: number;
      commentsCount?: number;
      ratingsCount?: number;
      longestStreak?: number;
      completedTitlesCount?: number;
      readingTimeMinutes?: number;
      balance?: number;
      ownedDecorationsCount?: number;
      likesReceivedCount?: number;
      titlesReadCount?: number;
      reportsCount?: number;
      charactersAcceptedCount?: number;
    },
  ): ProfileAchievementDto[] {
    const statsMap: Record<string, number> = {
      reader: stats.chaptersRead,
      collector: stats.bookmarksCount,
      cultivator: stats.userLevel,
      veteran: stats.daysSinceJoined,
      social: stats.socialConnections,
      commentator: stats.commentsCount ?? 0,
      critic: stats.ratingsCount ?? 0,
      marathon: stats.longestStreak ?? 0,
      completer: stats.completedTitlesCount ?? 0,
      time_reader: stats.readingTimeMinutes ?? 0,
      saver: stats.balance ?? 0,
      shopper: stats.ownedDecorationsCount ?? 0,
      popular: stats.likesReceivedCount ?? 0,
      explorer: stats.titlesReadCount ?? 0,
      reporter: stats.reportsCount ?? 0,
      contributor: stats.charactersAcceptedCount ?? 0,
    };

    return this.achievements.map((achDef) => {
      const currentValue = statsMap[achDef.id] ?? 0;
      const existingAch = userAchievements.find(
        (a) => a.achievementId === achDef.id,
      );
      let currentLevel = 0;
      for (const lvl of achDef.levels) {
        if (currentValue >= lvl.threshold) {
          currentLevel = lvl.level;
        }
      }
      return {
        id: achDef.id,
        name: achDef.name,
        description: achDef.description,
        icon: achDef.icon,
        type: achDef.type,
        currentLevel,
        maxLevel: achDef.levels.length,
        currentValue,
        levels: achDef.levels.map((l) => ({
          threshold: l.threshold,
          name: l.name,
          rarity: l.rarity,
        })),
      };
    });
  }
}

export interface ProfileAchievementDto {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: AchievementType;
  currentLevel: number;
  maxLevel: number;
  currentValue: number;
  levels: { threshold: number; name: string; rarity: AchievementRarity }[];
}
