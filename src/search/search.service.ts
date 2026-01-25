import { Injectable } from '@nestjs/common';
import { TitlesService } from '../titles/titles.service';

@Injectable()
export class SearchService {
  constructor(private readonly titlesService: TitlesService) {}

  async searchTitles({
    search,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    canViewAdult = true,
  }: {
    search: string;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    canViewAdult?: boolean;
  }) {
    const result = await this.titlesService.findAll({
      search,
      page: 1,
      limit,
      sortBy,
      sortOrder,
      canViewAdult,
    });

    return result.titles;
  }
}
