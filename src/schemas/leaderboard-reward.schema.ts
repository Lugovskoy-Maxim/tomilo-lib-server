import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeaderboardRewardDocument = LeaderboardReward & Document;

export const LEADERBOARD_CATEGORIES = [
  'level',
  'readingTime',
  'ratings',
  'comments',
  'streak',
  'chaptersRead',
] as const;
export const LEADERBOARD_PERIODS = ['week', 'month'] as const;

@Schema({ timestamps: true })
export class LeaderboardReward {
  _id: Types.ObjectId;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true, enum: ['week', 'month'] })
  period: string;

  @Prop({ required: true })
  rankMin: number;

  @Prop({ required: true })
  rankMax: number;

  @Prop()
  itemId?: string;

  @Prop({ default: 0 })
  itemCount: number;

  @Prop({ default: 0 })
  coins: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const LeaderboardRewardSchema =
  SchemaFactory.createForClass(LeaderboardReward);
