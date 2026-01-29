import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Title, TitleDocument } from './schemas/title.schema';
import { Chapter, ChapterDocument } from './schemas/chapter.schema';
import { User, UserDocument } from './schemas/user.schema';
import { Collection, CollectionDocument } from './schemas/collection.schema';
import { StatsResponseDto } from './common/dto/stats-response.dto';
import { LoggerService } from './common/logger/logger.service';

// Helper function to get date boundaries
function getDateBoundaries() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  return {
    today,
    weekAgo,
    monthAgo,
  };
}

@Injectable()
export class AppService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Collection.name)
    private collectionModel: Model<CollectionDocument>,
  ) {
    this.logger.setContext(AppService.name);
  }

  getHello(): string {
    this.logger.log('Hello World endpoint called');
    return 'Hello World!';
  }

  async getStats(): Promise<StatsResponseDto> {
    this.logger.log('Fetching application statistics');

    const { today, weekAgo, monthAgo } = getDateBoundaries();

    // Run all aggregations in parallel for performance
    const [
      // Base counts
      totalTitles,
      totalChapters,
      totalUsers,
      totalCollections,
      titleViewsResult,
      chapterViewsResult,
      totalBookmarks,
      totalRatingsResult,
      averageRatingResult,

      // Title status counts
      ongoingTitles,
      completedTitles,

      // Daily stats
      dailyViewsResult,
      dailyNewUsers,
      dailyNewTitles,
      dailyNewChapters,
      dailyChaptersRead,

      // Weekly stats
      weeklyViewsResult,
      weeklyNewUsers,
      weeklyNewTitles,
      weeklyNewChapters,
      weeklyChaptersRead,

      // Monthly stats
      monthlyViewsResult,
      monthlyNewUsers,
      monthlyNewTitles,
      monthlyNewChapters,
      monthlyChaptersRead,

      // Active users
      activeUsersToday,

      // Popular content
      popularTitles,
      popularChapters,

      // Stale ongoing titles (status=ongoing, no chapter updates for over a month)
      staleOngoingTitles,
    ] = await Promise.all([
      // Base counts
      this.titleModel.countDocuments(),
      this.chapterModel.countDocuments(),
      this.userModel.countDocuments(),
      this.collectionModel.countDocuments(),
      this.titleModel.aggregate([
        { $group: { _id: null, total: { $sum: '$views' } } },
      ]),
      this.chapterModel.aggregate([
        { $group: { _id: null, total: { $sum: '$views' } } },
      ]),
      this.userModel.aggregate([
        { $group: { _id: null, total: { $sum: { $size: '$bookmarks' } } } },
      ]),
      this.titleModel.aggregate([
        { $group: { _id: null, total: { $sum: '$totalRatings' } } },
      ]),
      this.titleModel.aggregate([
        { $group: { _id: null, avg: { $avg: '$averageRating' } } },
      ]),

      // Title status counts
      this.titleModel.countDocuments({ status: 'ongoing' }),
      this.titleModel.countDocuments({ status: 'completed' }),

      // Daily views from titles
      this.titleModel.aggregate([
        { $match: { lastDayReset: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$dayViews' } } },
      ]),

      // Daily new users
      this.userModel.countDocuments({ createdAt: { $gte: today } }),

      // Daily new titles
      this.titleModel.countDocuments({ createdAt: { $gte: today } }),

      // Daily new chapters
      this.chapterModel.countDocuments({ createdAt: { $gte: today } }),

      // Daily chapters read (using activity tracking or chapter views increment)
      this.chapterModel.countDocuments({
        lastViewedAt: { $gte: today },
      }),

      // Weekly views
      this.titleModel.aggregate([
        { $match: { lastWeekReset: { $gte: weekAgo } } },
        { $group: { _id: null, total: { $sum: '$weekViews' } } },
      ]),

      // Weekly new users
      this.userModel.countDocuments({ createdAt: { $gte: weekAgo } }),

      // Weekly new titles
      this.titleModel.countDocuments({ createdAt: { $gte: weekAgo } }),

      // Weekly new chapters
      this.chapterModel.countDocuments({ createdAt: { $gte: weekAgo } }),

      // Weekly chapters read
      this.chapterModel.countDocuments({
        lastViewedAt: { $gte: weekAgo },
      }),

      // Monthly views
      this.titleModel.aggregate([
        { $match: { lastMonthReset: { $gte: monthAgo } } },
        { $group: { _id: null, total: { $sum: '$monthViews' } } },
      ]),

      // Monthly new users
      this.userModel.countDocuments({ createdAt: { $gte: monthAgo } }),

      // Monthly new titles
      this.titleModel.countDocuments({ createdAt: { $gte: monthAgo } }),

      // Monthly new chapters
      this.chapterModel.countDocuments({ createdAt: { $gte: monthAgo } }),

      // Monthly chapters read
      this.chapterModel.countDocuments({
        lastViewedAt: { $gte: monthAgo },
      }),

      // Active users today (users with activity in last 24h)
      this.userModel.countDocuments({
        lastActivityAt: { $gte: today },
      }),

      // Popular titles (top 10 by total views)
      this.titleModel
        .find({ isPublished: true })
        .sort({ views: -1 })
        .limit(10)
        .select('name slug views dayViews weekViews monthViews')
        .lean(),

      // Popular chapters (top 10 by views) with title lookup
      this.chapterModel.aggregate([
        { $match: { isPublished: true } },
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

      // Stale ongoing titles (status=ongoing, no chapter updates for over a month)
      // A title is considered stale if no chapters have been added in the last month
      this.titleModel.countDocuments({
        status: 'ongoing',
        updatedAt: { $lt: monthAgo },
      }),
    ]);

    // Calculate totals
    const totalTitleViews = titleViewsResult[0]?.total || 0;
    const totalChapterViews = chapterViewsResult[0]?.total || 0;
    const totalViews = totalTitleViews + totalChapterViews;
    const totalBookmarksCount = totalBookmarks[0]?.total || 0;
    const totalRatings = totalRatingsResult[0]?.total || 0;
    const averageRating = averageRatingResult[0]?.avg || 0;

    // Build the stats object
    const stats: StatsResponseDto = {
      // Base counts
      totalTitles,
      totalChapters,
      totalUsers,
      totalCollections,
      totalViews,
      totalBookmarks: totalBookmarksCount,

      // Daily statistics
      daily: {
        views: dailyViewsResult[0]?.total || 0,
        newUsers: dailyNewUsers,
        newTitles: dailyNewTitles,
        newChapters: dailyNewChapters,
        chaptersRead: dailyChaptersRead,
      },

      // Weekly statistics
      weekly: {
        views: weeklyViewsResult[0]?.total || 0,
        newUsers: weeklyNewUsers,
        newTitles: weeklyNewTitles,
        newChapters: weeklyNewChapters,
        chaptersRead: weeklyChaptersRead,
      },

      // Monthly statistics
      monthly: {
        views: monthlyViewsResult[0]?.total || 0,
        newUsers: monthlyNewUsers,
        newTitles: monthlyNewTitles,
        newChapters: monthlyNewChapters,
        chaptersRead: monthlyChaptersRead,
      },

      // Popular content
      popularTitles: popularTitles.map((title) => ({
        id: title._id.toString(),
        name: title.name,
        slug: title.slug,
        views: title.views,
        dayViews: title.dayViews || 0,
        weekViews: title.weekViews || 0,
        monthViews: title.monthViews || 0,
      })),

      popularChapters: popularChapters.map((chapter) => ({
        id: chapter._id.toString(),
        titleId: chapter.titleId?.toString() || '',
        titleName: chapter.titleName || '',
        chapterNumber: chapter.chapterNumber,
        name: chapter.name || '',
        views: chapter.views,
      })),

      // Additional metrics
      activeUsersToday,
      newUsersThisMonth: monthlyNewUsers,
      totalRatings,
      averageRating: Math.round(averageRating * 100) / 100,
      ongoingTitles,
      completedTitles,
      staleOngoingTitles,
    };

    this.logger.log(
      `Statistics fetched successfully: ${JSON.stringify(stats)}`,
    );
    return stats;
  }
}
