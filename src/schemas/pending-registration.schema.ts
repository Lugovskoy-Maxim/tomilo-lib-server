import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PendingRegistrationDocument = PendingRegistration & Document;

@Schema({ timestamps: true })
export class PendingRegistration {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  hashedPassword: string;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  expiresAt: Date;

  /** Время последней отправки письма (для лимита раз в минуту). */
  @Prop({ required: true })
  sentAt: Date;
}

export const PendingRegistrationSchema =
  SchemaFactory.createForClass(PendingRegistration);

PendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
