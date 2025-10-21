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
}

export const ChapterSchema = SchemaFactory.createForClass(Chapter);

ChapterSchema.index({ titleId: 1, chapterNumber: 1 }, { unique: true });
ChapterSchema.index({ titleId: 1, releaseDate: -1 });
