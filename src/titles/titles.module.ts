import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TitlesService } from './titles.service';
import { TitlesController } from './titles.controller';
import { Title, TitleSchema } from '../schemas/title.schema';
import { Chapter, ChapterSchema } from '../schemas/chapter.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Title.name, schema: TitleSchema },
      { name: Chapter.name, schema: ChapterSchema },
    ]),
  ],
  controllers: [TitlesController],
  providers: [TitlesService],
  exports: [TitlesService],
})
export class TitlesModule {}
