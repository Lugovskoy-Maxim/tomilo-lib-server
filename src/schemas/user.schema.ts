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

  @Prop({ default: [] })
  bookmarks: string[];

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

  // OAuth providers
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
      isAdult: { type: Boolean, default: false },
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
    },
    default: {
      isAdult: false,
      theme: 'system',
    },
  })
  displaySettings: {
    isAdult: boolean;
    theme: 'light' | 'dark' | 'system';
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ 'readingHistory.titleId': 1 });
UserSchema.index({ 'readingHistory.chapters.chapterId': 1 });
UserSchema.index({ 'readingHistory.readAt': -1 });
UserSchema.index({ birthDate: 1 });
