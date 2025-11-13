import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Title, TitleDocument } from './schemas/title.schema';
import { Chapter, ChapterDocument } from './schemas/chapter.schema';
import { User, UserDocument } from './schemas/user.schema';
import { Collection, CollectionDocument } from './schemas/collection.schema';
import { StatsResponseDto } from './common/dto/stats-response.dto';
import { LoggerService } from './common/logger/logger.service';

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
    const [
      totalTitles,
      totalChapters,
      totalUsers,
      totalCollections,
      titleViewsResult,
      chapterViewsResult,
      totalBookmarks,
    ] = await Promise.all([
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
    ]);

    const totalTitleViews = titleViewsResult[0]?.total || 0;
    const totalChapterViews = chapterViewsResult[0]?.total || 0;
    const totalViews = totalTitleViews + totalChapterViews;
    const totalBookmarksCount = totalBookmarks[0]?.total || 0;

    const stats: StatsResponseDto = {
      totalTitles,
      totalChapters,
      totalUsers,
      totalCollections,
      totalViews,
      totalBookmarks: totalBookmarksCount,
    };

    this.logger.log(
      `Statistics fetched successfully: ${JSON.stringify(stats)}`,
    );
    return stats;
  }
}
