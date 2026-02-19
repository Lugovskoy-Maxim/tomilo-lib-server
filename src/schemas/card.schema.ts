import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CardDocument = Card & Document;

/** Карточка: все поля необязательные. Дата создания — из timestamps (createdAt). */
@Schema({ timestamps: true })
export class Card {
  _id: Types.ObjectId;

  /** Сила карточки (необязательно) */
  @Prop()
  strength?: number;

  /** Принадлежность к тайтлу (необязательно) */
  @Prop({ type: Types.ObjectId, ref: 'Title' })
  titleId?: Types.ObjectId;

  /** Персонаж (схема Character будет добавлена позже) (необязательно) */
  @Prop({ type: Types.ObjectId, ref: 'Character' })
  characterId?: Types.ObjectId;

  /** Создатель карточки (необязательно) */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const CardSchema = SchemaFactory.createForClass(Card);

CardSchema.index({ titleId: 1 });
CardSchema.index({ characterId: 1 });
CardSchema.index({ createdBy: 1 });
