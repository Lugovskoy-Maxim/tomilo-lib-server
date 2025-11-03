import { Injectable } from '@nestjs/common';
import { TitlesService } from '../titles/titles.service';

@Injectable()
export class SearchService {
  constructor(private readonly titlesService: TitlesService) {}

  async searchTitles({
    search,
    limit = 10,
  }: {
    search: string;
    limit?: number;
  }) {
    const result = await this.titlesService.findAll({
      search,
      page: 1,
      limit,
    });

    return result.titles;
  }
}
