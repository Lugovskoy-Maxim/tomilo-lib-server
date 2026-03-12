import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DailyQuestItemRewardDocument = DailyQuestItemReward & Document;

export const DAILY_QUEST_TYPES = [
  'read_chapters',
  'add_bookmark',
  'leave_comment',
  'rate_title',
  'daily_login',
] as const;

@Schema({ timestamps: true })
export class DailyQuestItemReward {
  _id: Types.ObjectId;

  @Prop({ required: true, enum: DAILY_QUEST_TYPES })
  questType: string;

  @Prop({ required: true })
  itemId: string;

  @Prop({ required: true })
  countMin: number;

  @Prop({ required: true })
  countMax: number;

  /** Шанс 0–1; если 1 — всегда даём */
  @Prop({ default: 1 })
  chance: number;

  /** Приоритет сортировки (меньше — раньше) */
  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const DailyQuestItemRewardSchema =
  SchemaFactory.createForClass(DailyQuestItemReward);
