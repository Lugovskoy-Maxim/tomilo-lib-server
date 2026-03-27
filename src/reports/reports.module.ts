import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Report, ReportSchema } from '../schemas/report.schema';
import { User, UserSchema } from '../schemas/user.schema';
import {
  Notification,
  NotificationSchema,
} from '../schemas/notification.schema';
import { Comment, CommentSchema } from '../schemas/comment.schema';
import { Chapter, ChapterSchema } from '../schemas/chapter.schema';
import { UsersModule } from '../users/users.module';
import { AutoParsingModule } from '../auto-parsing/auto-parsing.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: User.name, schema: UserSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Chapter.name, schema: ChapterSchema },
    ]),
    UsersModule,
    AutoParsingModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
