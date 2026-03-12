import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CharacterCardDocument = CharacterCard & Document;

export type CharacterCardMediaType = 'image' | 'gif';

@Schema({ timestamps: true })
export class CharacterCard {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Character', index: true })
  characterId: Types.ObjectId;

  /** Уровень (включительно), с которого эта карточка применяется */
  @Prop({ type: Number, default: 1 })
  minLevel: number;

  /** Уровень (включительно), до которого эта карточка применяется */
  @Prop({ type: Number, default: 999 })
  maxLevel: number;

  /** URL картинки/гифа */
  @Prop({ required: true })
  mediaUrl: string;

  @Prop({ type: String, enum: ['image', 'gif'], default: 'image' })
  mediaType: CharacterCardMediaType;

  /** Опционально: название стадии/формы (например “Awakened”) */
  @Prop({ default: '' })
  label?: string;
}

export const CharacterCardSchema = SchemaFactory.createForClass(CharacterCard);
CharacterCardSchema.index({ characterId: 1, minLevel: 1, maxLevel: 1 });
