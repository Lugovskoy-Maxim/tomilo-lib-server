import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserFrameDocument = UserFrame & Document;

@Schema({ timestamps: true })
export class UserFrame {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop()
  description?: string;

  /** Редкость / тип рамки */
  @Prop({ enum: ['common', 'rare', 'epic', 'legendary'], default: 'common' })
  rarity: string;

  @Prop({ default: true })
  isAvailable: boolean;

  /** Владелец рамки (если кастомная рамка пользователя) */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerId?: Types.ObjectId;
}

export const UserFrameSchema = SchemaFactory.createForClass(UserFrame);

UserFrameSchema.index({ ownerId: 1 });
UserFrameSchema.index({ isAvailable: 1 });
