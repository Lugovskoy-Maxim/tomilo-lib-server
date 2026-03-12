import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GameItemDocument = GameItem & Document;

export const GAME_ITEM_TYPES = ['material', 'consumable', 'special'] as const;
export type GameItemTypeValue = (typeof GAME_ITEM_TYPES)[number];

export const GAME_ITEM_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const;
export type GameItemRarityValue = (typeof GAME_ITEM_RARITIES)[number];

@Schema({ timestamps: true })
export class GameItem {
  _id: Types.ObjectId;

  /** Уникальный ключ (slug), например "spirit_stone" */
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  /** URL или имя иконки */
  @Prop({ default: '' })
  icon: string;

  @Prop({ required: true, enum: GAME_ITEM_TYPES })
  type: string;

  @Prop({ required: true, enum: GAME_ITEM_RARITIES })
  rarity: string;

  @Prop({ default: true })
  stackable: boolean;

  @Prop({ default: 999 })
  maxStack: number;

  /** Для алхимии: участвует в рецептах */
  @Prop({ default: false })
  usedInRecipes: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const GameItemSchema = SchemaFactory.createForClass(GameItem);
