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

  @Prop({ required: true })
  password: string;

  @Prop()
  avatar: string;

  @Prop({ default: 'user' })
  role: string;

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
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ 'readingHistory.titleId': 1 });
UserSchema.index({ 'readingHistory.chapters.chapterId': 1 });
UserSchema.index({ 'readingHistory.readAt': -1 });
