import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { MangaParserService } from './manga-parser.service';
import { MangaParserController } from './manga-parser.controller';
import { ParsingGateway } from './parsing.gateway';
import { TitlesModule } from '../titles/titles.module';
import { ChaptersModule } from '../chapters/chapters.module';
import { FilesModule } from '../files/files.module';

const SUPPORTED_SITES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Module({
  imports: [
    CacheModule.register({ ttl: SUPPORTED_SITES_CACHE_TTL_MS }),
    TitlesModule,
    ChaptersModule,
    FilesModule,
  ],
  controllers: [MangaParserController],
  providers: [MangaParserService, ParsingGateway],
  exports: [MangaParserService],
})
export class MangaParserModule {}
