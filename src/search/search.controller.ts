import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

// DTO для ответов API
class TitleResponseDto {
  id: string;
  title: string;
  cover: string;
  description?: string;
  totalChapters?: number;
  rating?: number;
  releaseYear?: number;
  type?: string;
}

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async searchTitles(
    @Query('q') query: string,
    @Query('limit') limit = 10,
  ): Promise<TitleResponseDto[]> {
    const titles = await this.searchService.searchTitles({
      search: query,
      limit: Number(limit),
    });

    return titles.map((title) => ({
      id: title._id?.toString(),
      title: title.name,
      cover: title.coverImage,
      description: title.description,
      totalChapters: title.chapters.length,
      rating: title.rating,
      releaseYear: title.releaseYear,
      type: title.type,
    }));
  }
}
