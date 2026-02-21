import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type TitleDocument = Title & Document;

export enum TitleStatus {
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
  PAUSE = 'pause',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class Title {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  altNames: string[];

  @Prop({ required: true })
  description: string;

  @Prop([String])
  genres: string[];

  @Prop([String])
  tags: string[];

  @Prop()
  artist: string;

  @Prop()
  coverImage: string;

  @Prop({ type: String, enum: TitleStatus, default: TitleStatus.ONGOING })
  status: TitleStatus;

  @Prop()
  author: string;

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  dayViews: number;

  @Prop({ default: 0 })
  weekViews: number;

  @Prop({ default: 0 })
  monthViews: number;

  @Prop()
  lastDayReset: Date;

  @Prop()
  lastWeekReset: Date;

  @Prop()
  lastMonthReset: Date;

  @Prop({ default: 0 })
  totalChapters: number;

  /** Оценки пользователей: один пользователь — одна оценка на тайтл (при повторной — обновляется) */
  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User', required: true },
        rating: { type: Number, required: true, min: 0, max: 10 },
      },
    ],
    default: [],
  })
  ratings: { userId: Types.ObjectId; rating: number }[];

  @Prop({ default: 0 })
  totalRatings: number;

  @Prop({ default: 0 })
  averageRating: number;

  /** Сохранённые сводки старых оценок (массив чисел до миграции), чтобы не обнулять рейтинг */
  @Prop({ default: 0 })
  legacyRatingCount: number;

  @Prop({ default: 0 })
  legacyRatingSum: number;

  @Prop({ min: 1900, max: new Date().getFullYear() })
  releaseYear: number;

  @Prop({ default: 0, min: 0, max: 18 })
  ageLimit: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Chapter' }] })
  chapters: Types.ObjectId[];

  /** Главы удалены по просьбе правообладателя — при true не возвращать главы в API */
  @Prop({ default: false })
  chaptersRemovedByCopyrightHolder: boolean;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Character' }], default: [] })
  characters: Types.ObjectId[];

  @Prop()
  isPublished: boolean;

  @Prop()
  type: string;
}

export const TitleSchema = SchemaFactory.createForClass(Title);

TitleSchema.index({ name: 'text', altNames: 'text', description: 'text' });
TitleSchema.index({ slug: 1 });
TitleSchema.index({ genres: 1 });
TitleSchema.index({ status: 1 });
TitleSchema.index({ averageRating: -1 });
TitleSchema.index({ views: -1 });
