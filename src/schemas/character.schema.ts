import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CharacterDocument = Character & Document;

/** Роль персонажа в произведении */
export enum CharacterRole {
  MAIN = 'main',
  SUPPORTING = 'supporting',
  ANTAGONIST = 'antagonist',
  MINOR = 'minor',
  OTHER = 'other',
}

/** Тип связи между персонажами */
export enum CharacterRelationType {
  FRIEND = 'friend',
  RIVAL = 'rival',
  FAMILY = 'family',
  ROMANTIC = 'romantic',
  MENTOR = 'mentor',
  ENEMY = 'enemy',
  ALLY = 'ally',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Character {
  _id: Types.ObjectId;

  /** Тайтл, к которому привязан персонаж */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Title' })
  titleId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  /** URL или путь к изображению аватара */
  @Prop()
  avatar: string;

  /** Возраст (число или строка, например "неизвестно") */
  @Prop()
  age: string;

  @Prop()
  guild: string;

  @Prop()
  clan: string;

  /** Пол */
  @Prop()
  gender: string;

  @Prop()
  description: string;

  /** Роль в произведении */
  @Prop({ type: String, enum: CharacterRole, default: CharacterRole.OTHER })
  role: CharacterRole;

  /** Другие имена, прозвища */
  @Prop([String])
  altNames: string[];

  /** Появление в главах: глава + опциональная заметка к появлению */
  @Prop({
    type: [
      {
        chapterId: { type: Types.ObjectId, ref: 'Chapter', required: true },
        chapterNumber: { type: Number },
        note: { type: String },
      },
    ],
    default: [],
  })
  chapterAppearances: {
    chapterId: Types.ObjectId;
    chapterNumber?: number;
    note?: string;
  }[];

  /** Заметки (общие) */
  @Prop()
  notes: string;

  /** Связи с другими персонажами (в рамках того же тайтла) */
  @Prop({
    type: [
      {
        characterId: { type: Types.ObjectId, ref: 'Character', required: true },
        relationType: {
          type: String,
          enum: Object.values(CharacterRelationType),
          default: CharacterRelationType.OTHER,
        },
        note: { type: String },
      },
    ],
    default: [],
  })
  relatedCharacters: {
    characterId: Types.ObjectId;
    relationType: CharacterRelationType;
    note?: string;
  }[];

  /** Порядок отображения в списке персонажей тайтла (меньше = выше) */
  @Prop({ default: 0 })
  sortOrder: number;
}

export const CharacterSchema = SchemaFactory.createForClass(Character);

CharacterSchema.index({ titleId: 1 });
CharacterSchema.index({ titleId: 1, sortOrder: 1 });
CharacterSchema.index({ name: 'text', altNames: 'text', description: 'text' });
