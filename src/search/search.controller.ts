import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';

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
  ): Promise<ApiResponseDto<TitleResponseDto[]>> {
    try {
      const titles = await this.searchService.searchTitles({
        search: query,
        limit: Number(limit),
      });

      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        cover: title.coverImage,
        description: title.description,
        totalChapters: title.chapters.length,
        rating: title.averageRating,
        releaseYear: title.releaseYear,
        type: title.type,
      }));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'search',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to search titles',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'search',
      };
    }
  }
}
