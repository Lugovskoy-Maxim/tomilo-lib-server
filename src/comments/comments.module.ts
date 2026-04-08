import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { Comment, CommentSchema } from '../schemas/comment.schema';
import { Title, TitleSchema } from '../schemas/title.schema';
import { Chapter, ChapterSchema } from '../schemas/chapter.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { SpamDetectionModule } from '../spam-detection/spam-detection.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: Title.name, schema: TitleSchema },
      { name: Chapter.name, schema: ChapterSchema },
    ]),
    NotificationsModule,
    forwardRef(() => UsersModule),
    SpamDetectionModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
