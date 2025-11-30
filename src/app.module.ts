import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
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
import { ShopModule } from './shop/shop.module';
import { CommentsModule } from './comments/comments.module';
import { Title, TitleSchema } from './schemas/title.schema';
import { Chapter, ChapterSchema } from './schemas/chapter.schema';
import { User, UserSchema } from './schemas/user.schema';
import { Collection, CollectionSchema } from './schemas/collection.schema';
import {
  AutoParsingJob,
  AutoParsingJobSchema,
} from './schemas/auto-parsing-job.schema';
import { AutoParsingModule } from './auto-parsing/auto-parsing.module';
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMongoConfig,
    }),
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
    ShopModule,
    CommentsModule,
    AutoParsingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
