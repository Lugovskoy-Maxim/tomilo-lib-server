import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema } from '../schemas/comment.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { SpamDetectionService } from './spam-detection.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  providers: [SpamDetectionService],
  exports: [SpamDetectionService],
})
export class SpamDetectionModule {}
