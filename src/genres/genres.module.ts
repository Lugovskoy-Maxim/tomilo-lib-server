import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Genre, GenreSchema } from '../schemas/genre.schema';
import { Title, TitleSchema } from '../schemas/title.schema';
import { GenresAdminController } from './genres-admin.controller';
import { GenresAdminService } from './genres-admin.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Genre.name, schema: GenreSchema },
      { name: Title.name, schema: TitleSchema },
    ]),
  ],
  controllers: [GenresAdminController],
  providers: [GenresAdminService],
  exports: [GenresAdminService],
})
export class GenresModule {}
