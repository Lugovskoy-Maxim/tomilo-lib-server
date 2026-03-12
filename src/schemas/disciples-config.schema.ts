import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DisciplesConfigDocument = DisciplesConfig & Document;

@Schema({ timestamps: true, _id: true })
export class DisciplesConfig {
  _id: Types.ObjectId;

  /** Уникальный ключ конфига (один документ) */
  @Prop({ required: true, unique: true, default: 'default' })
  id: string;

  @Prop({ required: true })
  rerollCostCoins: number;

  @Prop({ required: true })
  trainCostCoins: number;

  @Prop({ default: 3 })
  maxDisciples: number;

  @Prop({ default: 5 })
  maxBattlesPerDay: number;

  /** Диапазоны статов при найме */
  @Prop({
    type: {
      attackMin: { type: Number, default: 5 },
      attackMax: { type: Number, default: 15 },
      defenseMin: { type: Number, default: 5 },
      defenseMax: { type: Number, default: 15 },
      speedMin: { type: Number, default: 3 },
      speedMax: { type: Number, default: 12 },
      hpMin: { type: Number, default: 20 },
      hpMax: { type: Number, default: 50 },
    },
    default: () => ({
      attackMin: 5,
      attackMax: 15,
      defenseMin: 5,
      defenseMax: 15,
      speedMin: 3,
      speedMax: 12,
      hpMin: 20,
      hpMax: 50,
    }),
  })
  statRanges: {
    attackMin: number;
    attackMax: number;
    defenseMin: number;
    defenseMax: number;
    speedMin: number;
    speedMax: number;
    hpMin: number;
    hpMax: number;
  };

  /** Коэффициенты формулы CP: CP = attack*k1 + defense*k2 + speed*k3 + hp*k4 */
  @Prop({
    type: {
      attack: { type: Number, default: 1.2 },
      defense: { type: Number, default: 1.0 },
      speed: { type: Number, default: 0.8 },
      hp: { type: Number, default: 0.3 },
    },
    default: () => ({ attack: 1.2, defense: 1.0, speed: 0.8, hp: 0.3 }),
  })
  cpFormula: { attack: number; defense: number; speed: number; hp: number };

  /** Коэффициент k для winChance: 0.5 + k * (CP_A - CP_B) / (CP_A + CP_B) */
  @Prop({ default: 0.3 })
  winChanceK: number;

  /** Лимит статов после тренировок (cap) */
  @Prop({ default: 50 })
  statCap: number;

  /** Время жизни кандидата реролла в минутах */
  @Prop({ default: 10 })
  rerollCandidateTtlMinutes: number;

  /** Пул персонажей: 'all' | 'bookmarks' */
  @Prop({ default: 'all' })
  characterPool: 'all' | 'bookmarks';

  /** Недельная схватка: монет за победу / поражение */
  @Prop({ default: 100 })
  weeklyBattleCoinsWin: number;

  @Prop({ default: 20 })
  weeklyBattleCoinsLoss: number;

  /** Изменение рейтинга за победу/поражение (рейтинг Эло-подобный) */
  @Prop({ default: 25 })
  weeklyRatingK: number;

  /** Экспедиции */
  @Prop({ default: 24 })
  expeditionCooldownHours: number;

  @Prop({ default: 0 })
  expeditionCostCoinsEasy: number;

  @Prop({ default: 25 })
  expeditionCostCoinsNormal: number;

  @Prop({ default: 60 })
  expeditionCostCoinsHard: number;
}

export const DisciplesConfigSchema =
  SchemaFactory.createForClass(DisciplesConfig);
