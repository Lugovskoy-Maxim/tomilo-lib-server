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

  // Activity tracking for stats
  @Prop({ type: Date, default: null })
  lastViewedAt: Date | null;

  // Рейтинг главы (1-5), один пользователь — один голос
  @Prop({ default: 0 })
  ratingSum: number;

  @Prop({ default: 0 })
  ratingCount: number;

  @Prop({
    type: [{ userId: { type: Types.ObjectId, ref: 'User' }, value: Number }],
    default: [],
  })
  ratingByUser: { userId: Types.ObjectId; value: number }[];

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
