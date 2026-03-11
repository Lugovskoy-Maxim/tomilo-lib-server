import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PushSubscriptionDocument = PushSubscription & Document;

@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  endpoint: string;

  @Prop({ type: Object, required: true })
  keys: {
    p256dh: string;
    auth: string;
  };

  @Prop({ type: Number })
  expirationTime?: number | null;

  @Prop()
  userAgent?: string;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);

PushSubscriptionSchema.index({ userId: 1 });
// endpoint: index from @Prop({ unique: true })
