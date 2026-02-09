import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DailyStatsDocument = DailyStats & Document;

@Schema({ timestamps: true })
export class DailyStats {
  @Prop({ required: true, unique: true })
  date!: Date; // Дата статистики (начало дня)

  // Пользователи
  @Prop({ default: 0 })
  newUsers!: number; // Новые регистрации

  @Prop({ default: 0 })
  activeUsers!: number; // Активные пользователи (зашли на сайт)

  @Prop({ default: 0 })
  uniqueVisitors!: number; // Уникальные посетители

  // Контент
  @Prop({ default: 0 })
  newTitles!: number; // Новые тайтлы

  @Prop({ default: 0 })
  newChapters!: number; // Новые главы

  @Prop({ default: 0 })
  chaptersRead!: number; // Прочитано глав

  // Просмотры
  @Prop({ default: 0 })
  titleViews!: number; // Просмотры тайтлов

  @Prop({ default: 0 })
  chapterViews!: number; // Просмотры глав

  // Взаимодействия
  @Prop({ default: 0 })
  comments!: number; // Комментарии

  @Prop({ default: 0 })
  ratings!: number; // Оценки

  @Prop({ default: 0 })
  bookmarks!: number; // Закладки добавлены

  // Популярный контент (топ 10)
  @Prop({
    type: [
      {
        titleId: String,
        name: String,
        slug: String,
        views: Number,
      },
    ],
    default: [],
  })
  popularTitles!: {
    titleId: string;
    name: string;
    slug: string;
    views: number;
  }[];

  @Prop({
    type: [
      {
        chapterId: String,
        titleId: String,
        titleName: String,
        chapterNumber: Number,
        name: String,
        views: Number,
      },
    ],
    default: [],
  })
  popularChapters!: {
    chapterId: string;
    titleId: string;
    titleName: string;
    chapterNumber: number;
    name: string;
    views: number;
  }[];

  // Метаданные
  @Prop({ default: false })
  isRecorded!: boolean; // Флаг что статистика зафиксирована

  @Prop()
  recordedAt?: Date; // Время записи статистики
}

export const DailyStatsSchema = SchemaFactory.createForClass(DailyStats);

// Индексы для быстрого поиска
DailyStatsSchema.index({ date: 1 });
DailyStatsSchema.index({ date: -1 });
DailyStatsSchema.index({ date: 1, isRecorded: 1 });
