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
  totalChapters: number;

  @Prop({ default: 0 })
  rating: number;

  @Prop({ min: 1900, max: new Date().getFullYear() })
  releaseYear: number;

  @Prop({ default: 0, min: 0, max: 18 })
  ageLimit: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Chapter' }] })
  chapters: Types.ObjectId[];

  @Prop()
  isPublished: boolean;

  @Prop()
  type: string;
}

export const TitleSchema = SchemaFactory.createForClass(Title);

TitleSchema.index({ name: 'text', altNames: 'text', description: 'text' });
TitleSchema.index({ genres: 1 });
TitleSchema.index({ status: 1 });
TitleSchema.index({ rating: -1 });
TitleSchema.index({ totalViews: -1 });
