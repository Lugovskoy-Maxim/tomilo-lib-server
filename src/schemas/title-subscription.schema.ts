import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TitleSubscriptionDocument = TitleSubscription & Document;

@Schema({ timestamps: true })
export class TitleSubscription {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Title' })
  titleId: Types.ObjectId;

  @Prop({ default: true })
  notifyOnNewChapter: boolean;

  @Prop({ default: true })
  notifyOnAnnouncement: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const TitleSubscriptionSchema =
  SchemaFactory.createForClass(TitleSubscription);

TitleSubscriptionSchema.index({ userId: 1, titleId: 1 }, { unique: true });
TitleSubscriptionSchema.index({ titleId: 1 });
