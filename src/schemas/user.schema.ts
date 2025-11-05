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

  @Prop()
  readingHistory: {
    titleId: Types.ObjectId;
    chapterId?: Types.ObjectId[]; // Для совместимости со старыми данными
    chapters: {
      chapterId: Types.ObjectId;
      chapterNumber: number;
      chapterTitle?: string;
    }[];
    readAt: Date;
  }[];
}

export const UserSchema = SchemaFactory.createForClass(User);
