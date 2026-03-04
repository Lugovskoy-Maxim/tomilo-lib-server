import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AchievementDocument = Achievement & Document;

export const ACHIEVEMENT_TYPES = [
  'reading',
  'collection',
  'social',
  'special',
  'milestone',
] as const;
export type AchievementTypeValue = (typeof ACHIEVEMENT_TYPES)[number];

export const ACHIEVEMENT_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const;
export type AchievementRarityValue = (typeof ACHIEVEMENT_RARITIES)[number];

@Schema({ timestamps: true })
export class Achievement {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  icon: string;

  @Prop({ required: true, enum: ACHIEVEMENT_TYPES })
  type: string;

  @Prop({ required: true, enum: ACHIEVEMENT_RARITIES })
  rarity: string;

  @Prop({ default: 1 })
  maxProgress: number;

  @Prop({ default: false })
  isHidden: boolean;
}

export const AchievementSchema = SchemaFactory.createForClass(Achievement);
