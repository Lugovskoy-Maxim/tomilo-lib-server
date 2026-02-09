import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { DailyStats, DailyStatsSchema } from '../schemas/daily-stats.schema';
import { Title, TitleSchema } from '../schemas/title.schema';
import { Chapter, ChapterSchema } from '../schemas/chapter.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Comment, CommentSchema } from '../schemas/comment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DailyStats.name, schema: DailyStatsSchema },
      { name: Title.name, schema: TitleSchema },
      { name: Chapter.name, schema: ChapterSchema },
      { name: User.name, schema: UserSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
  ],
  providers: [StatsService],
  controllers: [StatsController],
  exports: [StatsService],
})
export class StatsModule {}
