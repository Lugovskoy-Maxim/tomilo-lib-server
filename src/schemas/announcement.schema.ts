import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnnouncementDocument = Announcement & Document;

/** Варианты раскладки для отображения на фронтенде */
export enum AnnouncementLayout {
  DEFAULT = 'default',
  WIDE = 'wide',
  COMPACT = 'compact',
  MINIMAL = 'minimal',
}

/** Типы контент-блоков для структурированного контента (опционально) */
export enum ContentBlockType {
  TITLE = 'title',
  PARAGRAPH = 'paragraph',
  IMAGE = 'image',
  LIST = 'list',
  QUOTE = 'quote',
  CODE = 'code',
  DIVIDER = 'divider',
  EMBED = 'embed',
}

/** Один блок контента (для гибкой вёрстки на фронте) */
export interface ContentBlock {
  type: ContentBlockType;
  /** Данные блока: text, src, items[], language и т.д. */
  data?: Record<string, unknown>;
  /** Стили/классы для кастомизации */
  style?: Record<string, string>;
}

@Schema({ timestamps: true })
export class Announcement {
  _id: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: '' })
  shortDescription: string;

  /** Основной текст в HTML — для WYSIWYG-редакторов */
  @Prop({ default: '' })
  body: string;

  /** Опционально: структурированные блоки (заголовок, параграф, картинка, список и т.д.) */
  @Prop({ type: [Object], default: [] })
  contentBlocks: ContentBlock[];

  /** Обложка объявления (URL или путь) */
  @Prop({ type: String, default: null })
  coverImage: string | null;

  /** Изображения внутри контента (URLs) */
  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ enum: AnnouncementLayout, default: AnnouncementLayout.DEFAULT })
  layout: AnnouncementLayout;

  /** Доп. стили/тема для кастомизации отображения */
  @Prop({ type: Object, default: {} })
  style: Record<string, string>;

  @Prop({ default: false })
  isPublished: boolean;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ default: false })
  isPinned: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);

AnnouncementSchema.index({ slug: 1 }, { unique: true });
AnnouncementSchema.index({ isPublished: 1, publishedAt: -1 });
AnnouncementSchema.index({ isPinned: 1, publishedAt: -1 });
AnnouncementSchema.index({ tags: 1 });
