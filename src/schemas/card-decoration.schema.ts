import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CardDecorationDocument = CardDecoration & Document;

@Schema({ timestamps: true })
export class CardDecoration {
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
}

export const CardDecorationSchema =
  SchemaFactory.createForClass(CardDecoration);
