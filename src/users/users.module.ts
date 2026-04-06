import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from '../schemas/user.schema';
import { ChapterRead, ChapterReadSchema } from '../schemas/chapter-read.schema';
import { TitleRead, TitleReadSchema } from '../schemas/title-read.schema';
import {
  ReadingHistoryTitle,
  ReadingHistoryTitleSchema,
  ReadingHistoryOrder,
  ReadingHistoryOrderSchema,
} from '../schemas/reading-history.schema';
import { FilesModule } from '../files/files.module';
import { ChaptersModule } from '../chapters/chapters.module';
import { BotDetectionModule } from '../common/services/bot-detection.module';
import { PushModule } from '../push/push.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GameItemsModule } from '../game-items/game-items.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ChapterRead.name, schema: ChapterReadSchema },
      { name: TitleRead.name, schema: TitleReadSchema },
      { name: ReadingHistoryTitle.name, schema: ReadingHistoryTitleSchema },
      { name: ReadingHistoryOrder.name, schema: ReadingHistoryOrderSchema },
    ]),
    FilesModule,
    forwardRef(() => ChaptersModule),
    BotDetectionModule,
    PushModule,
    forwardRef(() => NotificationsModule),
    GameItemsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
