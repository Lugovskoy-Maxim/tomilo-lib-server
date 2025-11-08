import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChaptersService } from './chapters.service';
import { ChaptersController } from './chapters.controller';
import { Chapter, ChapterSchema } from '../schemas/chapter.schema';
import { Title, TitleSchema } from '../schemas/title.schema';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Chapter.name, schema: ChapterSchema },
      { name: Title.name, schema: TitleSchema },
    ]),
    FilesModule,
    NotificationsModule,
  ],
  controllers: [ChaptersController],
  providers: [ChaptersService],
  exports: [ChaptersService, MongooseModule],
})
export class ChaptersModule {}
