import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  _id: Types.ObjectId;

  @Prop({ unique: true, required: true })
  username: string;

  @Prop({ unique: true, required: true })
  email: string;

  @Prop({ required: false })
  password?: string;

  @Prop()
  avatar: string;

  @Prop({ default: 'user' })
  role: string;

  // Leveling system
  @Prop({ default: 1 })
  level: number;

  @Prop({ default: 0 })
  experience: number;

  @Prop({ default: 0 })
  balance: number;

  /** Подписка: дата окончания. Если дата в будущем — пользователь имеет доступ к платным главам тайтлов с подпиской */
  @Prop({ type: Date, default: null })
  subscriptionExpiresAt: Date | null;

  /** Общее количество прочитанных глав (независимо от истории) */
  @Prop({ default: 0 })
  chaptersReadCount: number;

  /** Количество уникальных прочитанных тайтлов */
  @Prop({ default: 0 })
  titlesReadCount: number;

  /** Общее количество оставленных комментариев */
  @Prop({ default: 0 })
  commentsCount: number;

  /** Количество полученных лайков на комментариях */
  @Prop({ default: 0 })
  likesReceivedCount: number;

  /** Количество оценок, оставленных пользователем */
  @Prop({ default: 0 })
  ratingsCount: number;

  /** Время чтения в минутах (примерное) */
  @Prop({ default: 0 })
  readingTimeMinutes: number;

  /** Количество дней подряд с активностью (streak) */
  @Prop({ default: 0 })
  currentStreak: number;

  /** Максимальный streak */
  @Prop({ default: 0 })
  longestStreak: number;

  /** Дата последней активности для streak */
  @Prop()
  lastStreakDate: Date;

  /** Дата последнего начисления опыта за вход (раз в день) */
  @Prop()
  lastLoginExpDate: Date;

  /** Количество завершённых тайтлов (из закладок "completed") */
  @Prop({ default: 0 })
  completedTitlesCount: number;

  /** Количество отправленных жалоб (отчётов) */
  @Prop({ default: 0 })
  reportsCount: number;

  // Кастомизация профиля

  /** Краткое описание / статус */
  @Prop({ maxlength: 200 })
  bio: string;

  /** Любимый жанр */
  @Prop()
  favoriteGenre: string;

  /** Ссылки на соцсети */
  @Prop({
    type: {
      telegram: { type: String, default: '' },
      discord: { type: String, default: '' },
      vk: { type: String, default: '' },
    },
    default: { telegram: '', discord: '', vk: '' },
  })
  socialLinks: {
    telegram: string;
    discord: string;
    vk: string;
  };

  /** Показывать ли статистику в профиле */
  @Prop({ default: true })
  showStats: boolean;

  /** Показывать ли достижения в профиле */
  @Prop({ default: true })
  showAchievements: boolean;

  /** Показывать ли любимых персонажей */
  @Prop({ default: true })
  showFavoriteCharacters: boolean;

  /** Показывать ли историю чтения в профиле (для других пользователей; владелец всегда видит свою) */
  @Prop({ default: true })
  showReadingHistory: boolean;

  /** Показывать ли закладки в профиле (для других пользователей; владелец всегда видит свои) */
  @Prop({ default: true })
  showBookmarks: boolean;

  // Bot detection fields
  @Prop({ default: false })
  isBot: boolean;

  @Prop({ default: false })
  suspicious: boolean;

  @Prop({ default: 0 })
  botScore: number;

  @Prop()
  lastActivityAt: Date;

  @Prop({
    type: [
      {
        botScore: { type: Number, required: true },
        reasons: [{ type: String, required: true }],
        chapterId: { type: Types.ObjectId, ref: 'Chapter' },
        titleId: { type: Types.ObjectId, ref: 'Title' },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  suspiciousActivityLog: {
    botScore: number;
    reasons: string[];
    chapterId?: Types.ObjectId;
    titleId?: Types.ObjectId;
    timestamp: Date;
  }[];

  // Profile decorations
  @Prop({
    type: {
      avatar: {
        type: Types.ObjectId,
        ref: 'AvatarDecoration',
        default: null,
      },
      frame: {
        type: Types.ObjectId,
        ref: 'AvatarFrameDecoration',
        default: null,
      },
      background: {
        type: Types.ObjectId,
        ref: 'BackgroundDecoration',
        default: null,
      },
      card: {
        type: Types.ObjectId,
        ref: 'CardDecoration',
        default: null,
      },
    },
    default: { avatar: null, frame: null, background: null, card: null },
  })
  equippedDecorations: {
    avatar: Types.ObjectId | null;
    frame: Types.ObjectId | null;
    background: Types.ObjectId | null;
    card: Types.ObjectId | null;
  };

  @Prop({
    type: [
      {
        decorationType: {
          type: String,
          enum: ['avatar', 'frame', 'background', 'card'],
          required: true,
        },
        decorationId: { type: Types.ObjectId, required: true },
        purchasedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  ownedDecorations: {
    decorationType: string;
    decorationId: Types.ObjectId;
    purchasedAt: Date;
  }[];

  /** Избранные персонажи (отображаются в профиле) */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Character' }],
    default: [],
  })
  favoriteCharacters: Types.ObjectId[];

  /** Закладки по категориям: читаю, в планах, прочитано, избранное, брошено */
  @Prop({
    type: [
      {
        titleId: { type: Types.ObjectId, ref: 'Title', required: true },
        category: {
          type: String,
          enum: ['reading', 'planned', 'completed', 'favorites', 'dropped'],
          default: 'reading',
        },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  bookmarks: {
    titleId: Types.ObjectId;
    category: 'reading' | 'planned' | 'completed' | 'favorites' | 'dropped';
    addedAt: Date;
  }[];

  @Prop({
    type: [
      {
        titleId: { type: Types.ObjectId, ref: 'Title', required: true },
        chapters: [
          {
            chapterId: { type: Types.ObjectId, ref: 'Chapter', required: true },
            chapterNumber: { type: Number, required: true },
            chapterTitle: String,
            readAt: { type: Date, default: Date.now },
          },
        ],
        readAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  readingHistory: {
    titleId: Types.ObjectId;
    chapters: {
      chapterId: Types.ObjectId;
      chapterNumber: number;
      chapterTitle?: string;
      readAt: Date;
    }[];
    readAt: Date;
  }[];

  /** История событий прогресса (XP, уровень, достижения). Схема задаётся вручную после createForClass, чтобы achievement был Mixed (иначе Mongoose даёт "Cast to string failed"). */
  progressEvents?: {
    type: 'exp_gain' | 'level_up' | 'achievement';
    timestamp: Date;
    amount?: number;
    reason?: string;
    oldLevel?: number;
    newLevel?: number;
    oldRank?: { rank: number; stars: number; name: string; minLevel: number };
    newRank?: { rank: number; stars: number; name: string; minLevel: number };
    achievement?: {
      id: string;
      name: string;
      description: string;
      icon: string;
      type: string;
      rarity: string;
      level: number;
      levelName: string;
      unlockedAt: string;
      progress: number;
      maxProgress: number;
    };
  }[];

  // OAuth providers (legacy: один провайдер, дублируется из oauthProviders[0] для совместимости)
  @Prop({
    type: {
      provider: String,
      providerId: String,
    },
    default: null,
  })
  oauth?: {
    provider: string;
    providerId: string;
  };

  /** Несколько OAuth-провайдеров на один аккаунт (VK, Yandex и т.д.) */
  @Prop({
    type: [
      {
        provider: { type: String, required: true },
        providerId: { type: String, required: true },
      },
    ],
    default: [],
  })
  oauthProviders: {
    provider: string;
    providerId: string;
  }[];

  @Prop({ required: false })
  birthDate?: Date;

  @Prop({ required: false })
  firstName?: string;

  @Prop({ required: false })
  lastName?: string;

  @Prop({ required: false })
  gender?: string;

  @Prop({ required: false })
  emailVerificationToken?: string;

  @Prop({ required: false })
  emailVerificationExpires?: Date;

  @Prop({ required: false })
  emailVerified?: boolean;

  @Prop({ required: false })
  passwordResetToken?: string;

  @Prop({ required: false })
  passwordResetExpires?: Date;

  // Privacy settings
  @Prop({
    type: {
      profileVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'public',
      },
      readingHistoryVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'private',
      },
    },
    default: {
      profileVisibility: 'public',
      readingHistoryVisibility: 'private',
    },
  })
  privacy: {
    profileVisibility: 'public' | 'friends' | 'private';
    readingHistoryVisibility: 'public' | 'friends' | 'private';
  };

  // Notification settings
  @Prop({
    type: {
      newChapters: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      news: { type: Boolean, default: true },
    },
    default: {
      newChapters: true,
      comments: true,
      news: true,
    },
  })
  notifications: {
    newChapters: boolean;
    comments: boolean;
    news: boolean;
  };

  // Display settings
  @Prop({
    type: {
      isAdult: { type: Boolean, default: true },
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
    },
    default: {
      isAdult: true,
      theme: 'system',
    },
  })
  displaySettings: {
    isAdult: boolean;
    theme: 'light' | 'dark' | 'system';
  };

  /** Дата/время запланированного удаления профиля (now + 7 дней при запросе удаления) */
  @Prop()
  scheduledDeletionAt?: Date;

  /** Дата фактического «удаления» (проставляется кроном; профиль помечен удалённым) */
  @Prop()
  deletedAt?: Date;

  /** Достижения пользователя */
  @Prop({
    type: [
      {
        achievementId: { type: String, required: true },
        level: { type: Number, default: 1 },
        unlockedAt: { type: Date, default: Date.now },
        progress: { type: Number, default: 0 },
      },
    ],
    default: [],
  })
  achievements: {
    achievementId: string;
    level: number;
    unlockedAt: Date;
    progress: number;
  }[];

  // ——— Мини-игры: инвентарь и состояние ———

  /** Инвентарь: предметы по itemId и количеству */
  @Prop({
    type: [
      {
        itemId: { type: String, required: true },
        count: { type: Number, required: true },
      },
    ],
    default: [],
  })
  inventory: { itemId: string; count: number }[];

  /** Стихия в профиле (для бонусов алхимии/колеса) */
  @Prop({
    type: String,
    enum: ['fire', 'water', 'earth', 'wood', 'metal'],
    default: null,
  })
  element?: 'fire' | 'water' | 'earth' | 'wood' | 'metal' | null;

  @Prop()
  guildId?: Types.ObjectId;

  @Prop()
  lastPillCraftedAt?: Date;

  /** Алхимия: мастерство (уровень) и дневные попытки */
  @Prop({ default: 1 })
  alchemyLevel?: number;

  @Prop({ default: 0 })
  alchemyExp?: number;

  @Prop()
  alchemyAttemptsDate?: Date;

  @Prop({ default: 0 })
  alchemyAttemptsToday?: number;

  /** Алхимия: уровень котла/печи (уменьшает риск и улучшает качество) */
  @Prop({ default: 1 })
  alchemyCauldronTier?: number;

  @Prop()
  lastWheelSpinAt?: Date;

  /** Ученики (игра «Учитель — ученики») */
  @Prop({
    type: [
      {
        characterId: { type: Types.ObjectId, ref: 'Character', required: true },
        titleId: { type: Types.ObjectId, ref: 'Title', required: true },
        recruitedAt: { type: Date, default: Date.now },
        attack: { type: Number, required: true },
        defense: { type: Number, required: true },
        speed: { type: Number, required: true },
        hp: { type: Number, required: true },
        level: { type: Number, default: 1 },
        exp: { type: Number, default: 0 },
        rank: { type: String, default: 'F' },
        techniquesLearned: { type: [String], default: [] },
        techniquesEquipped: { type: [String], default: [] },
      },
    ],
    default: [],
  })
  disciples: {
    characterId: Types.ObjectId;
    titleId: Types.ObjectId;
    recruitedAt: Date;
    attack: number;
    defense: number;
    speed: number;
    hp: number;
    level?: number;
    exp?: number;
    rank?: string;
    techniquesLearned?: string[];
    techniquesEquipped?: string[];
  }[];

  @Prop({ default: 5 })
  maxDisciples?: number;

  @Prop()
  lastTrainingAt?: Date;

  @Prop({ default: 0 })
  combatRating?: number;

  @Prop()
  lastBattleAt?: Date;

  /** Недельная схватка: дата последнего боя (1 раз в неделю) */
  @Prop()
  lastWeeklyBattleAt?: Date;

  @Prop({ default: 1000 })
  weeklyRating?: number;

  @Prop({ default: 0 })
  weeklyWins?: number;

  @Prop({ default: 0 })
  weeklyLosses?: number;

  /** Экспедиции: дата последней вылазки (кулдаун) */
  @Prop()
  lastExpeditionAt?: Date;

  /** Экспедиция в процессе: время завершения (результат станет доступен после этой даты) */
  @Prop()
  lastExpeditionCompletesAt?: Date;

  /** Сложность текущей экспедиции в процессе (easy | normal | hard) */
  @Prop()
  lastExpeditionDifficulty?: string;

  /** Последний результат экспедиции (для UI) */
  @Prop({
    type: {
      at: { type: Date, default: Date.now },
      difficulty: { type: String, default: 'easy' },
      success: { type: Boolean, default: true },
      coinsGained: { type: Number, default: 0 },
      expGained: { type: Number, default: 0 },
      itemsGained: {
        type: [
          {
            itemId: { type: String, required: true },
            count: { type: Number, required: true },
          },
        ],
        default: [],
      },
      log: { type: [String], default: [] },
    },
    default: null,
  })
  lastExpeditionResult?: {
    at: Date;
    difficulty: string;
    success: boolean;
    coinsGained: number;
    expGained: number;
    itemsGained: { itemId: string; count: number }[];
    log: string[];
  } | null;

  /** Последний кандидат с реролла (для recruit) */
  @Prop({
    type: {
      characterId: { type: Types.ObjectId, ref: 'Character', required: true },
      titleId: { type: Types.ObjectId, ref: 'Title', required: true },
      attack: { type: Number, required: true },
      defense: { type: Number, required: true },
      speed: { type: Number, required: true },
      hp: { type: Number, required: true },
      at: { type: Date, default: Date.now },
    },
    default: null,
  })
  lastRerollCandidate?: {
    characterId: Types.ObjectId;
    titleId: Types.ObjectId;
    attack: number;
    defense: number;
    speed: number;
    hp: number;
    at: Date;
  } | null;

  /** Счётчики для дропа за чтение (сбрасывать по началу дня UTC) */
  @Prop()
  readingDropsDate?: Date;

  @Prop({ default: 0 })
  readingChaptersToday?: number;

  @Prop({
    type: [
      {
        itemId: { type: String, required: true },
        count: { type: Number, required: true },
      },
    ],
    default: [],
  })
  readingDropsToday: { itemId: string; count: number }[];

  /** Ежедневные задания: дата (начало дня) и список квестов на этот день */
  @Prop({
    type: {
      date: { type: Date, required: true },
      quests: [
        {
          id: { type: String, required: true },
          type: { type: String, required: true },
          name: { type: String, required: true },
          description: { type: String, default: '' },
          target: { type: Number, required: true },
          progress: { type: Number, default: 0 },
          rewardExp: { type: Number, default: 5 },
          rewardCoins: { type: Number, default: 0 },
          completed: { type: Boolean, default: false },
          claimedAt: { type: Date, default: null },
        },
      ],
    },
    default: null,
  })
  dailyQuests?: {
    date: Date;
    quests: {
      id: string;
      type: string;
      name: string;
      description: string;
      target: number;
      progress: number;
      rewardExp: number;
      rewardCoins: number;
      completed: boolean;
      claimedAt: Date | null;
    }[];
  } | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// progressEvents задаём вручную: achievement должен быть Mixed, иначе при save() — "Cast to string failed"
const progressEventElementSchema = new MongooseSchema(
  {
    type: {
      type: String,
      enum: ['exp_gain', 'level_up', 'achievement'],
      required: true,
    },
    timestamp: { type: Date, required: true },
    amount: Number,
    reason: String,
    oldLevel: Number,
    newLevel: Number,
    oldRank: { rank: Number, stars: Number, name: String, minLevel: Number },
    newRank: { rank: Number, stars: Number, name: String, minLevel: Number },
    achievement: MongooseSchema.Types.Mixed,
  },
  { _id: false },
);
UserSchema.add({
  progressEvents: {
    type: [progressEventElementSchema],
    default: [],
    select: false,
  },
});

// Перед сохранением убираем закладки без titleId и приводим к формату { titleId: ObjectId, category, addedAt }
UserSchema.pre('save', function (next) {
  if (
    this.bookmarks &&
    Array.isArray(this.bookmarks) &&
    this.bookmarks.length > 0
  ) {
    const out: Array<{
      titleId: Types.ObjectId;
      category: string;
      addedAt: Date;
    }> = [];
    const categories = [
      'reading',
      'planned',
      'completed',
      'favorites',
      'dropped',
    ];
    for (const b of this.bookmarks as any[]) {
      if (b == null) continue;
      const tid = b.titleId;
      const idStr =
        tid == null
          ? ''
          : typeof tid === 'string'
            ? tid
            : tid instanceof Types.ObjectId
              ? tid.toString()
              : (tid?.toString?.() ?? tid?._id?.toString?.() ?? '');
      if (idStr.length !== 24 || !Types.ObjectId.isValid(idStr)) continue;
      out.push({
        titleId:
          tid instanceof Types.ObjectId ? tid : new Types.ObjectId(idStr),
        category: categories.includes(b?.category) ? b.category : 'reading',
        addedAt: b?.addedAt ? new Date(b.addedAt) : new Date(),
      });
    }
    this.bookmarks = out as any;
  }
  next();
});

UserSchema.index({ 'readingHistory.titleId': 1 });
UserSchema.index({ 'readingHistory.chapters.chapterId': 1 });
UserSchema.index({ 'readingHistory.readAt': -1 });
UserSchema.index({ 'bookmarks.titleId': 1 });
UserSchema.index({ birthDate: 1 });
UserSchema.index({
  'oauthProviders.provider': 1,
  'oauthProviders.providerId': 1,
});

// Индексы для лидерборда
UserSchema.index({ level: -1, experience: -1 });
UserSchema.index({ readingTimeMinutes: -1 });
UserSchema.index({ ratingsCount: -1 });
UserSchema.index({ commentsCount: -1 });
UserSchema.index({ currentStreak: -1, longestStreak: -1 });
UserSchema.index({ isBot: 1 });
UserSchema.index({ scheduledDeletionAt: 1, deletedAt: 1 });
