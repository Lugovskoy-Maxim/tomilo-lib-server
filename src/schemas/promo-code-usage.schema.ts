import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PromoCodeReward, PromoCodeRewardSchema } from './promo-code.schema';

export type PromoCodeUsageDocument = PromoCodeUsage & Document;

@Schema({ timestamps: true })
export class PromoCodeUsage {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PromoCode', required: true })
  promoCodeId: Types.ObjectId;

  @Prop({ required: true })
  promoCode: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop()
  username?: string;

  @Prop({ type: [PromoCodeRewardSchema], default: [] })
  rewardsGranted: PromoCodeReward[];

  @Prop({ default: Date.now })
  usedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const PromoCodeUsageSchema =
  SchemaFactory.createForClass(PromoCodeUsage);

PromoCodeUsageSchema.index({ promoCodeId: 1 });
PromoCodeUsageSchema.index({ userId: 1 });
PromoCodeUsageSchema.index({ promoCodeId: 1, userId: 1 });
PromoCodeUsageSchema.index({ usedAt: -1 });
