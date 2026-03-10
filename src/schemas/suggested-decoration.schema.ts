import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SuggestedDecorationDocument = SuggestedDecoration & Document;

/** Статус предложения: ожидает голосования, принято (добавлено в магазин), отклонено */
export type SuggestedDecorationStatus = 'pending' | 'accepted' | 'rejected';

@Schema({ timestamps: true })
export class SuggestedDecoration {
  _id: Types.ObjectId;

  @Prop({ required: true, enum: ['avatar', 'frame', 'background', 'card'] })
  type: 'avatar' | 'frame' | 'background' | 'card';

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true })
  imageUrl: string;

  /** Автор предложения — получает 10% от продаж при добавлении в магазин */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId;

  /** Голоса: массив ID пользователей (один голос на пользователя) */
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  votedUserIds: Types.ObjectId[];

  @Prop({ default: 'pending', enum: ['pending', 'accepted', 'rejected'] })
  status: SuggestedDecorationStatus;

  /** ID декорации в магазине после принятия (если accepted) */
  @Prop({ type: Types.ObjectId })
  acceptedDecorationId?: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  acceptedAt?: Date;
}

export const SuggestedDecorationSchema =
  SchemaFactory.createForClass(SuggestedDecoration);

SuggestedDecorationSchema.index({ status: 1 });
SuggestedDecorationSchema.index({ authorId: 1 });
SuggestedDecorationSchema.index({ votedUserIds: 1 });
