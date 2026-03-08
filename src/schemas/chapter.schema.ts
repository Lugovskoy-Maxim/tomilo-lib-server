import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChapterDocument = Chapter & Document;

@Schema({ timestamps: true })
export class Chapter {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Title' })
  titleId: Types.ObjectId;

  @Prop({ required: true })
  chapterNumber: number;

  @Prop()
  name: string;

  @Prop([String])
  pages: string[];

  /** URL главы на источнике (для повторной синхронизации страниц) */
  @Prop({ type: String, default: null })
  sourceChapterUrl: string | null;

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: Date.now })
  releaseDate: Date;

  @Prop({ default: true })
  isPublished: boolean;

  @Prop()
  translator: string;

  // Paid chapter system
  @Prop({ default: false })
  isPaid: boolean;

  @Prop({ default: 0 })
  unlockPrice: number;

  /** Дата, после которой глава становится бесплатной для всех */
  @Prop({ type: Date, default: null })
  freeAt: Date | null;

  // Activity tracking for stats
  @Prop({ type: Date, default: null })
  lastViewedAt: Date | null;

  // Рейтинг главы (1-10), один пользователь — один голос
  @Prop({ default: 0 })
  ratingSum: number;

  @Prop({ default: 0 })
  ratingCount: number;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        value: Number,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  ratingByUser: { userId: Types.ObjectId; value: number; createdAt?: Date }[];

  // Реакции как в комментариях (эмодзи + пользователи)
  @Prop({
    type: [
      {
        emoji: { type: String, required: true },
        userIds: [{ type: Types.ObjectId, ref: 'User' }],
      },
    ],
    default: [],
  })
  reactions: { emoji: string; userIds: Types.ObjectId[] }[];
}

export const ChapterSchema = SchemaFactory.createForClass(Chapter);

ChapterSchema.index({ titleId: 1, chapterNumber: 1 }, { unique: true });
ChapterSchema.index({ titleId: 1, releaseDate: -1 });
ChapterSchema.index({ isPublished: 1, releaseDate: -1 });
ChapterSchema.index({ releaseDate: -1 });
