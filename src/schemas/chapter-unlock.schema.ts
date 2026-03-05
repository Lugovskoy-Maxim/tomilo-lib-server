import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChapterUnlockDocument = ChapterUnlock & Document;

@Schema({ timestamps: true })
export class ChapterUnlock {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Chapter', required: true })
  chapterId: Types.ObjectId;

  @Prop({ default: Date.now })
  unlockedAt: Date;
}

export const ChapterUnlockSchema = SchemaFactory.createForClass(ChapterUnlock);

ChapterUnlockSchema.index({ userId: 1, chapterId: 1 }, { unique: true });
ChapterUnlockSchema.index({ chapterId: 1 });
