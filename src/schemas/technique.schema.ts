import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TechniqueDocument = Technique & Document;

export type TechniqueType =
  | 'attack'
  | 'movement'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'ultimate';

@Schema({ timestamps: true })
export class Technique {
  _id: Types.ObjectId;

  /** Техника может быть общей (characterId=null) или привязанной к персонажу */
  @Prop({ type: Types.ObjectId, ref: 'Character', default: null, index: true })
  characterId?: Types.ObjectId | null;

  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description?: string;

  @Prop({
    type: String,
    enum: ['attack', 'movement', 'heal', 'buff', 'debuff', 'ultimate'],
    required: true,
  })
  type: TechniqueType;

  /** “Сила” техники — используется в расчётах урона/хила (простая модель) */
  @Prop({ type: Number, default: 10 })
  power: number;

  /** Кулдаун в ходах (для лога/симуляции) */
  @Prop({ type: Number, default: 0 })
  cooldownTurns: number;

  /** Требования */
  @Prop({ type: Number, default: 1 })
  requiredLevel: number;

  @Prop({ type: String, default: 'F' })
  requiredRank: string;

  /** Минимальный уровень библиотеки игрока для доступа к изучению */
  @Prop({ type: Number, default: 1 })
  requiredLibraryLevel: number;

  /** Стоимость изучения */
  @Prop({ type: Number, default: 50 })
  learnCostCoins: number;

  @Prop({ default: '' })
  iconUrl?: string;
}

export const TechniqueSchema = SchemaFactory.createForClass(Technique);
TechniqueSchema.index({ id: 1 }, { unique: true });
TechniqueSchema.index({ characterId: 1, requiredLevel: 1 });
