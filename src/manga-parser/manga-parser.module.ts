import { Module } from '@nestjs/common';
import { MangaParserService } from './manga-parser.service';
import { MangaParserController } from './manga-parser.controller';
import { ParsingGateway } from './parsing.gateway';
import { TitlesModule } from '../titles/titles.module';
import { ChaptersModule } from '../chapters/chapters.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [TitlesModule, ChaptersModule, FilesModule],
  controllers: [MangaParserController],
  providers: [MangaParserService, ParsingGateway],
  exports: [MangaParserService],
})
export class MangaParserModule {}
