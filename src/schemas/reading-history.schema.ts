import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReadingHistoryTitleDocument = ReadingHistoryTitle & Document;
export type ReadingHistoryOrderDocument = ReadingHistoryOrder & Document;

/**
 * Одна запись = один тайтл в истории чтения пользователя (вынесено из User.readingHistory).
 * Порядок тайтлов хранится отдельно в ReadingHistoryOrder.
 */
@Schema({ timestamps: true, collection: 'reading_histories' })
export class ReadingHistoryTitle {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Title', required: true, index: true })
  titleId: Types.ObjectId;

  @Prop({
    type: [
      {
        chapterId: { type: Types.ObjectId, ref: 'Chapter', required: true },
        chapterNumber: { type: Number, required: true },
        chapterTitle: { type: String },
        readAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  chapters: {
    chapterId: Types.ObjectId;
    chapterNumber: number;
    chapterTitle?: string;
    readAt: Date;
  }[];

  @Prop({ type: Date, default: Date.now, index: true })
  readAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ReadingHistoryTitleSchema =
  SchemaFactory.createForClass(ReadingHistoryTitle);

ReadingHistoryTitleSchema.index({ userId: 1, titleId: 1 }, { unique: true });
ReadingHistoryTitleSchema.index({ userId: 1, readAt: -1 });
ReadingHistoryTitleSchema.index({ userId: 1, 'chapters.chapterId': 1 });

/**
 * Порядок titleId в истории чтения (совпадает с порядком в User.readingHistory до выноса).
 */
@Schema({ timestamps: true, collection: 'reading_history_orders' })
export class ReadingHistoryOrder {
  _id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Title' }],
    default: [],
  })
  titleIds: Types.ObjectId[];

  createdAt: Date;
  updatedAt: Date;
}

export const ReadingHistoryOrderSchema =
  SchemaFactory.createForClass(ReadingHistoryOrder);
