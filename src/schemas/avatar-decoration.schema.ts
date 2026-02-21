import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AvatarDecorationDocument = AvatarDecoration & Document;

@Schema({ timestamps: true })
export class AvatarDecoration {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, enum: ['common', 'rare', 'epic', 'legendary'] })
  rarity: string;

  @Prop({ default: true })
  isAvailable: boolean;

  @Prop()
  description: string;

  /** Остаток в наличии. Не задано = без ограничений. При 0 продажа запрещена. */
  @Prop({ min: 0 })
  quantity?: number;
}

export const AvatarDecorationSchema =
  SchemaFactory.createForClass(AvatarDecoration);
