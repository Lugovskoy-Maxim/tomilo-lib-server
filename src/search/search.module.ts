import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { TitlesModule } from '../titles/titles.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TitlesModule, UsersModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
