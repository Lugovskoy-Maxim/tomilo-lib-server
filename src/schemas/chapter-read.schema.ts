import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChapterReadDocument = ChapterRead & Document;

/**
 * Неудаляемый "ledger" факта первого прочтения главы.
 * Используется для анти-фарминга наград/XP: даже если пользователь очистит readingHistory,
 * факт первого прочтения остаётся.
 */
@Schema({ timestamps: true, collection: 'chapter_reads' })
export class ChapterRead {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Title', required: true, index: true })
  titleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Chapter', required: true, index: true })
  chapterId: Types.ObjectId;

  /** Дата первого прочтения (фиксируется один раз). */
  @Prop({ type: Date, default: Date.now, index: true })
  firstReadAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ChapterReadSchema = SchemaFactory.createForClass(ChapterRead);

// Один пользователь — одна глава (гарантирует начисление наград один раз)
ChapterReadSchema.index({ userId: 1, chapterId: 1 }, { unique: true });
ChapterReadSchema.index({ userId: 1, titleId: 1, firstReadAt: -1 });
