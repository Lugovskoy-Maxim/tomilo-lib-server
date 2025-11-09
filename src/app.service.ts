import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Title, TitleDocument } from './schemas/title.schema';
import { Chapter, ChapterDocument } from './schemas/chapter.schema';
import { User, UserDocument } from './schemas/user.schema';
import { StatsResponseDto } from './common/dto/stats-response.dto';

@Injectable()
export class AppService {
  constructor(
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getStats(): Promise<StatsResponseDto> {
    const [
      totalTitles,
      totalChapters,
      totalUsers,
      titleViewsResult,
      chapterViewsResult,
      totalBookmarks,
    ] = await Promise.all([
      this.titleModel.countDocuments(),
      this.chapterModel.countDocuments(),
      this.userModel.countDocuments(),
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
      totalViews,
      totalBookmarks: totalBookmarksCount,
    };

    return stats;
  }
}
