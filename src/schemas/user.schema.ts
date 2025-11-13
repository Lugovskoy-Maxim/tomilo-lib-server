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
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ 'readingHistory.titleId': 1 });
UserSchema.index({ 'readingHistory.chapters.chapterId': 1 });
UserSchema.index({ 'readingHistory.readAt': -1 });
