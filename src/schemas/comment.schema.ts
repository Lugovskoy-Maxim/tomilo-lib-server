import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommentDocument = Comment & Document;

/** Разрешённые эмодзи для реакций (как в Telegram) */
export const ALLOWED_REACTION_EMOJIS = [
  '👍',
  '👎',
  '❤️',
  '🔥',
  '😂',
  '😮',
  '😢',
  '🎉',
  '👏',
] as const;
export type ReactionEmoji = (typeof ALLOWED_REACTION_EMOJIS)[number];

export enum CommentEntityType {
  TITLE = 'title',
  CHAPTER = 'chapter',
}

@Schema({ timestamps: true })
export class Comment {
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: CommentEntityType })
  entityType: CommentEntityType;

  @Prop({ required: true, type: Types.ObjectId })
  entityId: Types.ObjectId;

  @Prop({ required: true, minlength: 1, maxlength: 5000 })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null })
  parentId: Types.ObjectId | null;

  /** Реакции как в Telegram: эмодзи + пользователи */
  @Prop({
    type: [
      {
        emoji: { type: String, required: true },
        userIds: [{ type: Types.ObjectId, ref: 'User' }],
      },
    ],
    default: [],
  })
  reactions: { emoji: string; userIds: Types.ObjectId[] }[];

  /** @deprecated Используйте reactions. Оставлено для обратной совместимости. */
  @Prop({ default: 0 })
  likes: number;

  /** @deprecated Используйте reactions. Оставлено для обратной совместимости. */
  @Prop({ default: 0 })
  dislikes: number;

  /** @deprecated Используйте reactions. Оставлено для обратной совместимости. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  likedBy: Types.ObjectId[];

  /** @deprecated Используйте reactions. Оставлено для обратной совместимости. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  dislikedBy: Types.ObjectId[];

  @Prop({ default: true })
  isVisible: boolean;

  @Prop({ default: false })
  isEdited: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
CommentSchema.index({ userId: 1 });
CommentSchema.index({ parentId: 1 });
CommentSchema.index({ createdAt: -1 });
