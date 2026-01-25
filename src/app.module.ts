import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from './users/users.module';
import { TitlesModule } from './titles/titles.module';
import { ChaptersModule } from './chapters/chapters.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getMongoConfig } from './config/mongo-config';
import { SearchModule } from './search/search.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MangaParserModule } from './manga-parser/manga-parser.module';
import { CollectionsModule } from './collections/collections.module';

import { LoggerModule } from './common/logger/logger.module';
import { UtilsModule } from './common/utils/utils.module';
import { FilesModule } from './files/files.module';
import { ShopModule } from './shop/shop.module';
import { CommentsModule } from './comments/comments.module';
import { ReportsModule } from './comments/reports.module';
import { Title, TitleSchema } from './schemas/title.schema';
import { Chapter, ChapterSchema } from './schemas/chapter.schema';
import { User, UserSchema } from './schemas/user.schema';
import { Collection, CollectionSchema } from './schemas/collection.schema';
import {
  AutoParsingJob,
  AutoParsingJobSchema,
} from './schemas/auto-parsing-job.schema';
import { AutoParsingModule } from './auto-parsing/auto-parsing.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMongoConfig,
    }),
    // Rate limiting configuration
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 60, // 60 requests per minute for normal endpoints
      },
    ]),
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: Title.name, schema: TitleSchema },
      { name: Chapter.name, schema: ChapterSchema },
      { name: User.name, schema: UserSchema },
      { name: Collection.name, schema: CollectionSchema },
      { name: AutoParsingJob.name, schema: AutoParsingJobSchema },
    ]),
    UsersModule,
    AuthModule,
    TitlesModule,
    ChaptersModule,
    SearchModule,
    NotificationsModule,
    MangaParserModule,
    CollectionsModule,

    LoggerModule,

    UtilsModule,
    FilesModule,
    ShopModule,
    CommentsModule,
    ReportsModule,
    AutoParsingModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
