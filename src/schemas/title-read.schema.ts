import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TitleReadDocument = TitleRead & Document;

/**
 * Неудаляемый "ledger" факта первого прочтения тайтла (любой главы).
 * Нужен, чтобы счётчик titlesReadCount и достижения не фармились очисткой readingHistory.
 */
@Schema({ timestamps: true, collection: 'title_reads' })
export class TitleRead {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Title', required: true, index: true })
  titleId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now, index: true })
  firstReadAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const TitleReadSchema = SchemaFactory.createForClass(TitleRead);

// Один пользователь — один тайтл
TitleReadSchema.index({ userId: 1, titleId: 1 }, { unique: true });
TitleReadSchema.index({ userId: 1, firstReadAt: -1 });
