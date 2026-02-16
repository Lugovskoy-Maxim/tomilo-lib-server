import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '@nestjs/cache-manager';
import { TitlesService } from './titles.service';
import { TitlesController } from './titles.controller';
import { Title, TitleSchema } from '../schemas/title.schema';
import { Chapter, ChapterSchema } from '../schemas/chapter.schema';
import { Collection, CollectionSchema } from '../schemas/collection.schema';
import { FilesModule } from '../files/files.module';
import { BotDetectionModule } from '../common/services/bot-detection.module';
import { UsersModule } from '../users/users.module';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

@Module({
  imports: [
    CacheModule.register({
      ttl: CACHE_TTL_MS,
    }),
    MongooseModule.forFeature([
      { name: Title.name, schema: TitleSchema },
      { name: Chapter.name, schema: ChapterSchema },
      { name: Collection.name, schema: CollectionSchema },
    ]),
    FilesModule,
    BotDetectionModule,
    UsersModule,
  ],
  controllers: [TitlesController],
  providers: [TitlesService],
  exports: [TitlesService],
})
export class TitlesModule {}
