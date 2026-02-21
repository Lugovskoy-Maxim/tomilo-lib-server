import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
    default: { avatar: null, background: null, card: null },
  })
  equippedDecorations: {
    avatar: Types.ObjectId | null;
    background: Types.ObjectId | null;
    card: Types.ObjectId | null;
  };

  @Prop({
    type: [
      {
        decorationType: {
          type: String,
          enum: ['avatar', 'background', 'card'],
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
    },
    default: {
      newChapters: true,
      comments: true,
    },
  })
  notifications: {
    newChapters: boolean;
    comments: boolean;
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
}

export const UserSchema = SchemaFactory.createForClass(User);

// Перед сохранением убираем закладки без titleId и приводим к формату { titleId: ObjectId, category, addedAt }
UserSchema.pre('save', function (next) {
  if (this.bookmarks && Array.isArray(this.bookmarks) && this.bookmarks.length > 0) {
    const out: Array<{ titleId: Types.ObjectId; category: string; addedAt: Date }> = [];
    const categories = ['reading', 'planned', 'completed', 'favorites', 'dropped'];
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
        titleId: tid instanceof Types.ObjectId ? tid : new Types.ObjectId(idStr),
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
UserSchema.index({ 'oauthProviders.provider': 1, 'oauthProviders.providerId': 1 });
