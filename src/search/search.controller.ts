import { Controller, Get, Query, Request } from '@nestjs/common';
import { SearchService } from './search.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { UsersService } from '../users/users.service';

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
  constructor(
    private readonly searchService: SearchService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async searchTitles(
    @Request() req: any,
    @Query('q') query: string,
    @Query('limit') limit = 10,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<ApiResponseDto<TitleResponseDto[]>> {
    try {
      // Determine if user can view adult content
      let canViewAdult = true; // Default: show all content for unauthenticated users

      // Check if user is authenticated via JWT
      if (req.user && req.user.userId) {
        try {
          const user = await this.usersService.findById(req.user.userId);
          if (user && user.displaySettings) {
            // If user has disabled adult content in settings, filter it out
            canViewAdult = user.displaySettings.isAdult !== false;
          }
        } catch {
          // User not found or error, default to showing all content
          canViewAdult = true;
        }
      }

      const titles = await this.searchService.searchTitles({
        search: query,
        limit: Number(limit),
        sortBy,
        sortOrder,
        canViewAdult,
      });

      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        slug: title.slug,
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
