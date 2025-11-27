import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AutoParsingService } from './auto-parsing.service';
import { AutoParsingController } from './auto-parsing.controller';
import { MangaParserModule } from '../manga-parser/manga-parser.module';
import { TitlesModule } from '../titles/titles.module';
import {
  AutoParsingJob,
  AutoParsingJobSchema,
} from '../schemas/auto-parsing-job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AutoParsingJob.name, schema: AutoParsingJobSchema },
    ]),
    MangaParserModule,
    TitlesModule,
  ],
  controllers: [AutoParsingController],
  providers: [AutoParsingService],
  exports: [AutoParsingService],
})
export class AutoParsingModule {}
