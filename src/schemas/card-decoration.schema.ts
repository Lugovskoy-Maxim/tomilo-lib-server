import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CardDecorationDocument = CardDecoration & Document;

export const CARD_STAGE_ORDER = [
  'F',
  'E',
  'D',
  'C',
  'B',
  'A',
  'S',
  'SS',
  'SSS',
] as const;

export type CardStageRank = (typeof CARD_STAGE_ORDER)[number];

@Schema({ _id: false })
export class CardStage {
  @Prop({ type: String, required: true, enum: CARD_STAGE_ORDER })
  rank: CardStageRank;

  @Prop({ default: '' })
  imageUrl: string;

  @Prop({ min: 1, default: 1 })
  requiredLevel: number;

  @Prop({ min: 0, default: 0 })
  upgradeCoins: number;

  @Prop({ default: '' })
  upgradeItemId?: string;

  @Prop({ min: 0, default: 0 })
  upgradeItemCount?: number;

  @Prop({ min: 0, max: 1, default: 1 })
  upgradeSuccessChance?: number;
}

export const CardStageSchema = SchemaFactory.createForClass(CardStage);

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

  /** Остаток в наличии. Не задано = без ограничений. При 0 продажа запрещена. */
  @Prop({ min: 0 })
  quantity?: number;

  /** Автор (из предложений пользователей). Получает 10% от каждой продажи. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  authorId?: Types.ObjectId;

  /** Игровая карточка персонажа всегда должна быть привязана к существующему персонажу. */
  @Prop({ type: Types.ObjectId, ref: 'Character', default: null })
  characterId?: Types.ObjectId | null;

  /** Денормализованный titleId персонажа для быстрых выборок по тайтлу. */
  @Prop({ type: Types.ObjectId, ref: 'Title', index: true, default: null })
  titleId?: Types.ObjectId | null;

  @Prop({ type: [CardStageSchema], default: [] })
  stages?: CardStage[];
}

export const CardDecorationSchema =
  SchemaFactory.createForClass(CardDecoration);

CardDecorationSchema.index({ characterId: 1 });
CardDecorationSchema.index({ titleId: 1, isAvailable: 1 });
