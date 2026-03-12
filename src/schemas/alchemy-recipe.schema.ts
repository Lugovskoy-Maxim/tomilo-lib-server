import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlchemyRecipeDocument = AlchemyRecipe & Document;

@Schema({ timestamps: true })
export class AlchemyRecipe {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  icon: string;

  @Prop({ default: 0 })
  coinCost: number;

  @Prop({
    type: [
      {
        itemId: { type: String, required: true },
        count: { type: Number, required: true },
      },
    ],
    default: [],
  })
  ingredients: { itemId: string; count: number }[];

  /** Тип результата или привязка к consumable itemId */
  @Prop({ default: 'pill_common' })
  resultType: string;

  /** Стихия рецепта (для бонусов от стихии пользователя) */
  @Prop({
    type: String,
    enum: ['fire', 'water', 'earth', 'wood', 'metal', null],
    default: null,
  })
  element?: 'fire' | 'water' | 'earth' | 'wood' | 'metal' | null;

  /** Веса качества при успешной варке (common, quality, legendary) — в сумме 100 */
  @Prop({
    type: {
      common: { type: Number, default: 70 },
      quality: { type: Number, default: 25 },
      legendary: { type: Number, default: 5 },
    },
    default: () => ({ common: 70, quality: 25, legendary: 5 }),
  })
  qualityWeights: { common: number; quality: number; legendary: number };

  /** Риск “взрыва котла”/провала (0..100). Можно усиливать на сложных рецептах. */
  @Prop({ type: Number, default: 8 })
  mishapChancePercent?: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const AlchemyRecipeSchema = SchemaFactory.createForClass(AlchemyRecipe);
