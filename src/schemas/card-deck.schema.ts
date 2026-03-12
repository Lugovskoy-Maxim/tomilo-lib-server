import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CardDeckDocument = CardDeck & Document;
export const CARD_DECK_PITY_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const;
export type CardDeckPityRarity = (typeof CARD_DECK_PITY_RARITIES)[number];

@Schema({ timestamps: true })
export class CardDeck {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description?: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop({ required: true, min: 0, default: 0 })
  price: number;

  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({ min: 0 })
  quantity?: number;

  @Prop({ type: Types.ObjectId, ref: 'Title', default: null, index: true })
  titleId?: Types.ObjectId | null;

  @Prop({ required: true, min: 1, default: 3 })
  cardsPerOpen: number;

  @Prop({ required: true, min: 0, max: 1, default: 0.75 })
  titleFocusChance: number;

  @Prop({ min: 0, default: 0 })
  pityThreshold: number;

  @Prop({ type: String, enum: CARD_DECK_PITY_RARITIES, default: 'rare' })
  pityTargetRarity: CardDeckPityRarity;
}

export const CardDeckSchema = SchemaFactory.createForClass(CardDeck);
