import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReadingDropRuleDocument = ReadingDropRule & Document;

@Schema({ timestamps: true })
export class ReadingDropRule {
  _id: Types.ObjectId;

  @Prop({ required: true })
  itemId: string;

  /** Шанс 0–1 */
  @Prop({ required: true })
  chance: number;

  /** После скольких глав за день возможно (например 1 = со 2-й главы) */
  @Prop({ default: 1 })
  minChaptersToday: number;

  /** Макс. дропов этого предмета в день на пользователя */
  @Prop({ required: true })
  maxDropsPerDay: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const ReadingDropRuleSchema =
  SchemaFactory.createForClass(ReadingDropRule);
