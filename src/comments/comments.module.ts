import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { Comment, CommentSchema } from '../schemas/comment.schema';
import { Title, TitleSchema } from '../schemas/title.schema';
import { Chapter, ChapterSchema } from '../schemas/chapter.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      { name: Title.name, schema: TitleSchema },
      { name: Chapter.name, schema: ChapterSchema },
    ]),
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}

