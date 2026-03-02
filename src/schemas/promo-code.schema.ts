import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PromoCodeDocument = PromoCode & Document;

export type PromoCodeRewardType = 'balance' | 'decoration' | 'premium';
export type PromoCodeStatus = 'active' | 'inactive' | 'expired' | 'exhausted';

@Schema({ _id: false })
export class PromoCodeReward {
  @Prop({ required: true, enum: ['balance', 'decoration', 'premium'] })
  type: PromoCodeRewardType;

  @Prop()
  amount?: number;

  @Prop({ type: Types.ObjectId })
  decorationId?: Types.ObjectId;

  @Prop()
  decorationType?: 'avatar' | 'frame' | 'background' | 'card';

  @Prop()
  displayName?: string;
}

export const PromoCodeRewardSchema =
  SchemaFactory.createForClass(PromoCodeReward);

@Schema({ timestamps: true })
export class PromoCode {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop()
  description?: string;

  @Prop({ type: [PromoCodeRewardSchema], default: [] })
  rewards: PromoCodeReward[];

  @Prop({ type: Number, default: null })
  maxUses: number | null;

  @Prop({ default: 0 })
  usedCount: number;

  @Prop({ default: 1 })
  maxUsesPerUser: number;

  @Prop()
  startsAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ default: 'active', enum: ['active', 'inactive', 'expired', 'exhausted'] })
  status: PromoCodeStatus;

  @Prop({ default: false })
  newUsersOnly: boolean;

  @Prop()
  minLevel?: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const PromoCodeSchema = SchemaFactory.createForClass(PromoCode);

PromoCodeSchema.index({ code: 1 }, { unique: true });
PromoCodeSchema.index({ status: 1 });
PromoCodeSchema.index({ expiresAt: 1 });
PromoCodeSchema.index({ createdAt: -1 });
