import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DailyStats, DailyStatsDocument } from '../schemas/daily-stats.schema';
import { Title, TitleDocument } from '../schemas/title.schema';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { Comment, CommentDocument } from '../schemas/comment.schema';
import { LoggerService } from '../common/logger/logger.service';

// Helper function to get start of day
function getStartOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class StatsService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(DailyStats.name)
    private dailyStatsModel: Model<DailyStatsDocument>,
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
  ) {
    this.logger.setContext(StatsService.name);
  }

  /**
   * Записать статистику за день
   */
  async recordDailyStats(date: Date = new Date()): Promise<DailyStats> {
    const startOfDay = getStartOfDay(date);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    this.logger.log(`Recording daily stats for ${startOfDay.toISOString()}`);

    // Проверяем, не записана ли уже статистика за этот день
    const existingStats = await this.dailyStatsModel.findOne({
      date: startOfDay,
      isRecorded: true,
    });

    if (existingStats) {
      this.logger.log(`Stats already recorded for ${startOfDay.toISOString()}`);
      return existingStats;
    }

    // Собираем статистику за день
    const [
      newUsers,
      activeUsers,
      newTitles,
      newChapters,
      chaptersRead,
      titleViews,
      chapterViews,
      comments,
      ratings,
      bookmarks,
      popularTitles,
      popularChapters,
    ] = await Promise.all([
      // Новые пользователи
      this.userModel.countDocuments({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
      }),

      // Активные пользователи
      this.userModel.countDocuments({
        lastActivityAt: { $gte: startOfDay, $lt: endOfDay },
      }),

      // Новые тайтлы
      this.titleModel.countDocuments({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
      }),

      // Новые главы
      this.chapterModel.countDocuments({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
      }),

      // Прочитано глав
      this.chapterModel.countDocuments({
        lastViewedAt: { $gte: startOfDay, $lt: endOfDay },
      }),

      // Просмотры тайтлов за день
      this.titleModel.aggregate([
        { $match: { lastDayReset: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: '$dayViews' } } },
      ]),

      // Просмотры глав
      this.chapterModel.aggregate([
        {
          $match: {
            lastViewedAt: { $gte: startOfDay, $lt: endOfDay },
          },
        },
        { $group: { _id: null, total: { $sum: '$views' } } },
      ]),

      // Комментарии
      this.commentModel.countDocuments({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
      }),

      // Оценки (из тайтлов)
      this.titleModel.aggregate([
        {
          $match: {
            updatedAt: { $gte: startOfDay, $lt: endOfDay },
            totalRatings: { $gt: 0 },
          },
        },
        { $group: { _id: null, total: { $sum: '$totalRatings' } } },
      ]),

      // Закладки (из пользователей)
      this.userModel.aggregate([
        {
          $match: {
            updatedAt: { $gte: startOfDay, $lt: endOfDay },
          },
        },
        {
          $project: {
            bookmarkCount: { $size: '$bookmarks' },
          },
        },
        { $group: { _id: null, total: { $sum: '$bookmarkCount' } } },
      ]),

      // Популярные тайтлы (топ 10)
      this.titleModel
        .find({ isPublished: true })
        .sort({ dayViews: -1 })
        .limit(10)
        .select('name slug dayViews')
        .lean(),

      // Популярные главы (топ 10)
      this.chapterModel.aggregate([
        {
          $match: {
            isPublished: true,
            lastViewedAt: { $gte: startOfDay, $lt: endOfDay },
          },
        },
        { $sort: { views: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'titles',
            localField: 'titleId',
            foreignField: '_id',
            as: 'title',
          },
        },
        {
          $project: {
            _id: 1,
            titleId: 1,
            chapterNumber: 1,
            name: 1,
            views: 1,
            titleName: { $arrayElemAt: ['$title.name', 0] },
          },
        },
      ]),
    ]);

    // Создаем или обновляем запись статистики
    const stats = await this.dailyStatsModel.findOneAndUpdate(
      { date: startOfDay },
      {
        date: startOfDay,
        newUsers,
        activeUsers,
        newTitles,
        newChapters,
        chaptersRead: chaptersRead || 0,
        titleViews: titleViews[0]?.total || 0,
        chapterViews: chapterViews[0]?.total || 0,
        comments,
        ratings: ratings[0]?.total || 0,
        bookmarks: bookmarks[0]?.total || 0,
        popularTitles: popularTitles.map((t) => ({
          titleId: t._id.toString(),
          name: t.name,
          slug: t.slug,
          views: t.dayViews || 0,
        })),
        popularChapters: popularChapters.map((c) => ({
          chapterId: c._id.toString(),
          titleId: c.titleId?.toString() || '',
          titleName: c.titleName || '',
          chapterNumber: c.chapterNumber,
          name: c.name || '',
          views: c.views,
        })),
        isRecorded: true,
        recordedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `Daily stats recorded successfully for ${startOfDay.toISOString()}`,
    );
    return stats;
  }

  /**
   * Получить статистику за конкретный день
   */
  async getDailyStats(date: Date): Promise<DailyStats | null> {
    const startOfDay = getStartOfDay(date);
    return this.dailyStatsModel.findOne({ date: startOfDay }).exec();
  }

  /**
   * Получить статистику за диапазон дат
   */
  async getStatsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<DailyStats[]> {
    const start = getStartOfDay(startDate);
    const end = getStartOfDay(endDate);
    end.setDate(end.getDate() + 1);

    return this.dailyStatsModel
      .find({
        date: { $gte: start, $lt: end },
        isRecorded: true,
      })
      .sort({ date: 1 })
      .exec();
  }

  /**
   * Получить статистику за месяц (агрегированная)
   */
  async getMonthlyStats(
    year: number,
    month: number,
  ): Promise<{
    year: number;
    month: number;
    totalNewUsers: number;
    totalActiveUsers: number;
    totalNewTitles: number;
    totalNewChapters: number;
    totalChaptersRead: number;
    totalTitleViews: number;
    totalChapterViews: number;
    totalComments: number;
    totalRatings: number;
    totalBookmarks: number;
    dailyStats: DailyStats[];
  }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const dailyStats = await this.getStatsByDateRange(startDate, endDate);

    const totals = dailyStats.reduce(
      (acc, day) => ({
        totalNewUsers: acc.totalNewUsers + day.newUsers,
        totalActiveUsers: acc.totalActiveUsers + day.activeUsers,
        totalNewTitles: acc.totalNewTitles + day.newTitles,
        totalNewChapters: acc.totalNewChapters + day.newChapters,
        totalChaptersRead: acc.totalChaptersRead + day.chaptersRead,
        totalTitleViews: acc.totalTitleViews + day.titleViews,
        totalChapterViews: acc.totalChapterViews + day.chapterViews,
        totalComments: acc.totalComments + day.comments,
        totalRatings: acc.totalRatings + day.ratings,
        totalBookmarks: acc.totalBookmarks + day.bookmarks,
      }),
      {
        totalNewUsers: 0,
        totalActiveUsers: 0,
        totalNewTitles: 0,
        totalNewChapters: 0,
        totalChaptersRead: 0,
        totalTitleViews: 0,
        totalChapterViews: 0,
        totalComments: 0,
        totalRatings: 0,
        totalBookmarks: 0,
      },
    );

    return {
      year,
      month,
      ...totals,
      dailyStats,
    };
  }

  /**
   * Получить статистику за год (агрегированная по месяцам)
   */
  async getYearlyStats(year: number): Promise<{
    year: number;
    months: {
      month: number;
      totalNewUsers: number;
      totalActiveUsers: number;
      totalNewTitles: number;
      totalNewChapters: number;
      totalChaptersRead: number;
      totalTitleViews: number;
      totalChapterViews: number;
      totalComments: number;
      totalRatings: number;
      totalBookmarks: number;
    }[];
    yearlyTotals: {
      totalNewUsers: number;
      totalActiveUsers: number;
      totalNewTitles: number;
      totalNewChapters: number;
      totalChaptersRead: number;
      totalTitleViews: number;
      totalChapterViews: number;
      totalComments: number;
      totalRatings: number;
      totalBookmarks: number;
    };
  }> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const dailyStats = await this.getStatsByDateRange(startDate, endDate);

    // Группируем по месяцам
    const monthlyData = new Map<
      number,
      {
        month: number;
        totalNewUsers: number;
        totalActiveUsers: number;
        totalNewTitles: number;
        totalNewChapters: number;
        totalChaptersRead: number;
        totalTitleViews: number;
        totalChapterViews: number;
        totalComments: number;
        totalRatings: number;
        totalBookmarks: number;
      }
    >();

    // Инициализируем все месяцы
    for (let i = 1; i <= 12; i++) {
      monthlyData.set(i, {
        month: i,
        totalNewUsers: 0,
        totalActiveUsers: 0,
        totalNewTitles: 0,
        totalNewChapters: 0,
        totalChaptersRead: 0,
        totalTitleViews: 0,
        totalChapterViews: 0,
        totalComments: 0,
        totalRatings: 0,
        totalBookmarks: 0,
      });
    }

    // Агрегируем данные
    for (const day of dailyStats) {
      const month = day.date.getMonth() + 1;
      const monthData = monthlyData.get(month)!;

      monthData.totalNewUsers += day.newUsers;
      monthData.totalActiveUsers += day.activeUsers;
      monthData.totalNewTitles += day.newTitles;
      monthData.totalNewChapters += day.newChapters;
      monthData.totalChaptersRead += day.chaptersRead;
      monthData.totalTitleViews += day.titleViews;
      monthData.totalChapterViews += day.chapterViews;
      monthData.totalComments += day.comments;
      monthData.totalRatings += day.ratings;
      monthData.totalBookmarks += day.bookmarks;
    }

    const months = Array.from(monthlyData.values());

    // Считаем годовые итоги
    const yearlyTotals = months.reduce(
      (acc, month) => ({
        totalNewUsers: acc.totalNewUsers + month.totalNewUsers,
        totalActiveUsers: acc.totalActiveUsers + month.totalActiveUsers,
        totalNewTitles: acc.totalNewTitles + month.totalNewTitles,
        totalNewChapters: acc.totalNewChapters + month.totalNewChapters,
        totalChaptersRead: acc.totalChaptersRead + month.totalChaptersRead,
        totalTitleViews: acc.totalTitleViews + month.totalTitleViews,
        totalChapterViews: acc.totalChapterViews + month.totalChapterViews,
        totalComments: acc.totalComments + month.totalComments,
        totalRatings: acc.totalRatings + month.totalRatings,
        totalBookmarks: acc.totalBookmarks + month.totalBookmarks,
      }),
      {
        totalNewUsers: 0,
        totalActiveUsers: 0,
        totalNewTitles: 0,
        totalNewChapters: 0,
        totalChaptersRead: 0,
        totalTitleViews: 0,
        totalChapterViews: 0,
        totalComments: 0,
        totalRatings: 0,
        totalBookmarks: 0,
      },
    );

    return {
      year,
      months,
      yearlyTotals,
    };
  }

  /**
   * Получить последние N дней статистики
   */
  async getRecentDailyStats(days: number = 30): Promise<DailyStats[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.getStatsByDateRange(startDate, endDate);
  }

  /**
   * Получить доступные годы статистики
   */
  async getAvailableYears(): Promise<number[]> {
    const years = await this.dailyStatsModel.aggregate<{ _id: number }>([
      { $match: { isRecorded: true } },
      {
        $group: {
          _id: { $year: '$date' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return years.map((y) => y._id);
  }

  /**
   * Обзорная статистика для главной админки
   */
  async getStats(options?: { includeHistory?: boolean; historyDays?: number }): Promise<any> {
    const now = new Date();
    const today = getStartOfDay(now);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [
      totalTitles,
      totalChapters,
      totalUsers,
      dailyStatsToday,
      dailyStatsWeek,
      dailyStatsMonth,
    ] = await Promise.all([
      this.titleModel.countDocuments({ isPublished: true }),
      this.chapterModel.countDocuments({ isPublished: true }),
      this.userModel.countDocuments(),
      this.dailyStatsModel.findOne({ date: today, isRecorded: true }).lean(),
      this.getStatsByDateRange(weekAgo, now),
      this.getStatsByDateRange(monthAgo, now),
    ]);
    const totalCollections = 0;

    const sumViews = (list: DailyStats[]) =>
      list.reduce((s, d) => s + (d.titleViews || 0) + (d.chapterViews || 0), 0);
    const sum = (list: DailyStats[], key: keyof DailyStats) =>
      list.reduce((s, d) => s + Number(d[key] ?? 0), 0);

    const daily = dailyStatsToday
      ? {
          views: (dailyStatsToday.titleViews || 0) + (dailyStatsToday.chapterViews || 0),
          newUsers: dailyStatsToday.newUsers || 0,
          newTitles: dailyStatsToday.newTitles || 0,
          newChapters: dailyStatsToday.newChapters || 0,
          chaptersRead: dailyStatsToday.chaptersRead || 0,
        }
      : { views: 0, newUsers: 0, newTitles: 0, newChapters: 0, chaptersRead: 0 };

    const weekly = {
      views: sumViews(dailyStatsWeek),
      newUsers: sum(dailyStatsWeek, 'newUsers'),
      newTitles: sum(dailyStatsWeek, 'newTitles'),
      newChapters: sum(dailyStatsWeek, 'newChapters'),
      chaptersRead: sum(dailyStatsWeek, 'chaptersRead'),
    };

    const monthly = {
      views: sumViews(dailyStatsMonth),
      newUsers: sum(dailyStatsMonth, 'newUsers'),
      newTitles: sum(dailyStatsMonth, 'newTitles'),
      newChapters: sum(dailyStatsMonth, 'newChapters'),
      chaptersRead: sum(dailyStatsMonth, 'chaptersRead'),
    };

    const totalViews = await this.titleModel.aggregate([{ $group: { _id: null, total: { $sum: '$dayViews' } } }]).then((r) => r[0]?.total ?? 0);
    const bookmarksAgg = await this.userModel
      .aggregate([
        { $project: { c: { $size: { $ifNull: ['$bookmarks', []] } } } },
        { $group: { _id: null, total: { $sum: '$c' } } },
      ] as any[])
      .then((r) => r[0]?.total ?? 0);

    let history: any[] | undefined;
    if (options?.includeHistory && options?.historyDays) {
      const hist = await this.getRecentDailyStats(options.historyDays);
      history = hist.map((d) => ({
        date: d.date.toISOString().split('T')[0],
        views: (d.titleViews || 0) + (d.chapterViews || 0),
        newUsers: d.newUsers,
        newTitles: d.newTitles,
        newChapters: d.newChapters,
        chaptersRead: d.chaptersRead,
        totalUsers,
        totalTitles,
        totalChapters,
      }));
    }

    return {
      totalTitles,
      totalChapters,
      totalUsers,
      totalCollections,
      totalViews,
      totalBookmarks: bookmarksAgg,
      daily,
      weekly,
      monthly,
      popularTitles: dailyStatsToday?.popularTitles?.slice(0, 10) ?? [],
      popularChapters: dailyStatsToday?.popularChapters?.slice(0, 10) ?? [],
      activeUsersToday: dailyStatsToday?.activeUsers ?? 0,
      newUsersThisMonth: monthly.newUsers,
      totalRatings: 0,
      averageRating: 0,
      ongoingTitles: 0,
      completedTitles: 0,
      ...(history && { history }),
    };
  }

  /**
   * История для вкладки «Статистика»: daily | monthly | yearly
   */
  async getHistory(
    type: 'daily' | 'monthly' | 'yearly',
    opts: { days?: number; year?: number; month?: number },
  ): Promise<{ type: string; data: any[]; total: number }> {
    const year = opts.year ?? new Date().getFullYear();
    const month = opts.month ?? new Date().getMonth() + 1;

    if (type === 'daily') {
      const days = opts.days ?? 30;
      const list = await this.getRecentDailyStats(days);
      const data = list.map((d) => ({
        date: d.date.toISOString().split('T')[0],
        views: (d.titleViews || 0) + (d.chapterViews || 0),
        newUsers: d.newUsers,
        newTitles: d.newTitles,
        newChapters: d.newChapters,
        chaptersRead: d.chaptersRead,
        totalUsers: 0,
        totalTitles: 0,
        totalChapters: 0,
      }));
      return { type: 'daily', data, total: data.length };
    }

    if (type === 'monthly') {
      const list = await this.getStatsByDateRange(
        new Date(year, month - 1, 1),
        new Date(year, month, 1),
      );
      const totals = list.reduce(
        (acc, d) => ({
          views: acc.views + (d.titleViews || 0) + (d.chapterViews || 0),
          newUsers: acc.newUsers + d.newUsers,
          newTitles: acc.newTitles + d.newTitles,
          newChapters: acc.newChapters + d.newChapters,
          chaptersRead: acc.chaptersRead + d.chaptersRead,
        }),
        { views: 0, newUsers: 0, newTitles: 0, newChapters: 0, chaptersRead: 0 },
      );
      const data = [{ year, month, ...totals }];
      return { type: 'monthly', data, total: 1 };
    }

    if (type === 'yearly') {
      const yrStats = await this.getYearlyStats(year);
      const data = [
        {
          year,
          views: (yrStats.yearlyTotals.totalTitleViews || 0) + (yrStats.yearlyTotals.totalChapterViews || 0),
          newUsers: yrStats.yearlyTotals.totalNewUsers,
          newTitles: yrStats.yearlyTotals.totalNewTitles,
          newChapters: yrStats.yearlyTotals.totalNewChapters,
          chaptersRead: yrStats.yearlyTotals.totalChaptersRead,
          totalUsers: 0,
          totalTitles: 0,
          totalChapters: 0,
        },
      ];
      return { type: 'yearly', data, total: 1 };
    }

    return { type, data: [], total: 0 };
  }
}
