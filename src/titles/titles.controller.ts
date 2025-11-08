import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Put,
  UsePipes,
  ValidationPipe,
  ParseFloatPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { TitlesService } from './titles.service';
import { CreateTitleDto } from './dto/create-title.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { extname } from 'path';
import { FilterOptionsResponseDto } from './dto/title-controller.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';

// DTO для ответов API
class TitleResponseDto {
  id: string;
  title: string;
  cover: string;
  description?: string;
}

class CollectionResponseDto {
  id: string;
  name: string;
  image: string;
  link: string;
}

class ReadingProgressResponseDto {
  id: string;
  title: string;
  cover: string;
  currentChapter: string;
  chapterNumber: number;
  progress: number;
}

class LatestUpdateResponseDto {
  id: string;
  title: string;
  cover: string;
  chapter: string;
  chapterNumber: number;
  timeAgo: string;
}

@Controller()
export class TitlesController {
  constructor(private readonly titlesService: TitlesService) {}

  private getHoursWord(hours: number): string {
    if (hours % 10 === 1 && hours % 100 !== 11) {
      return 'час';
    } else if (
      [2, 3, 4].includes(hours % 10) &&
      ![12, 13, 14].includes(hours % 100)
    ) {
      return 'часа';
    } else {
      return 'часов';
    }
  }

  // Эндпоинты для главной страницы
  @Get('titles/popular')
  async getPopularTitles(
    @Query('limit') limit = 10,
  ): Promise<ApiResponseDto<TitleResponseDto[]>> {
    try {
      const titles = await this.titlesService.getPopularTitles(Number(limit));
      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        cover: title.coverImage,
        rating: title.rating,
        type: title.type,
        releaseYear: title.releaseYear,
        description: title.description,
      }));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/popular',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch popular titles',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/popular',
      };
    }
  }

  @Get('collections')
  getCollections(
    @Query('limit') limit = 10,
  ): ApiResponseDto<CollectionResponseDto[]> {
    try {
      // Здесь должна быть логика получения коллекций
      // Временно возвращаем заглушку
      const data: CollectionResponseDto[] = [
        {
          id: '1',
          name: 'Сёнен',
          image: '/uploads/collections/1.webp',
          link: '/collections/shonen',
        },
        {
          id: '2',
          name: 'Романтика',
          image: '/uploads/collections/2.webp',
          link: '/collections/romance',
        },
        {
          id: '3',
          name: 'Фэнтези',
          image: '/uploads/collections/3.webp',
          link: '/collections/fantasy',
        },
        {
          id: '4',
          name: 'Фэнтези',
          image: '/uploads/collections/3.webp',
          link: '/collections/fantasy',
        },
        {
          id: '5',
          name: 'Фэнтези',
          image: '/uploads/collections/3.webp',
          link: '/collections/fantasy',
        },
      ].slice(0, limit);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'collections',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch collections',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'collections',
      };
    }
  }

  @Get('titles/filters/options')
  async getFilterOptions(): Promise<ApiResponseDto<FilterOptionsResponseDto>> {
    try {
      const filterOptions = await this.titlesService.getFilterOptions();
      const data: FilterOptionsResponseDto = {
        genres: filterOptions.genres,
        // types: filterOptions.types,
        status: filterOptions.status,
      };

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/filters/options',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch filter options',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/filters/options',
      };
    }
  }

  @Get('user/reading-progress')
  async getReadingProgress(
    @Query('limit') limit = 10,
  ): Promise<ApiResponseDto<ReadingProgressResponseDto[]>> {
    try {
      // Здесь должна быть логика получения прогресса чтения пользователя
      // Временно возвращаем заглушку
      const popularTitles = await this.titlesService.getPopularTitles(
        Number(limit),
      );
      const data = popularTitles.map((title, index) => ({
        id: title._id?.toString(),
        title: title.name,
        cover: title.coverImage,
        currentChapter: `Глава ${index + 1}`,
        chapterNumber: index + 1,
        progress: Math.floor(Math.random() * 100),
      }));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'user/reading-progress',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch reading progress',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'user/reading-progress',
      };
    }
  }

  @Get('titles/latest-updates')
  async getLatestUpdates(
    @Query('limit') limit = 10,
  ): Promise<ApiResponseDto<LatestUpdateResponseDto[]>> {
    try {
      const titlesWithChapters =
        await this.titlesService.getTitlesWithRecentChapters(Number(limit));
      const data = titlesWithChapters.map((item) => {
        // Вычисляем время назад в часах
        const now = new Date();
        const releaseDate = new Date(item.latestChapter.releaseDate);
        const diffInHours = Math.floor(
          (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60),
        );
        const timeAgo =
          diffInHours <= 0
            ? 'Меньше часа назад'
            : `${diffInHours} ${this.getHoursWord(diffInHours)} назад`;

        return {
          id: item._id?.toString(),
          title: item.name,
          cover: item.coverImage,
          chapter: `Глава ${item.latestChapter.chapterNumber}`,
          chapterNumber: item.latestChapter.chapterNumber,
          timeAgo: timeAgo,
        };
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/latest-updates',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch latest updates',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/latest-updates',
      };
    }
  }

  @Get('search')
  async searchTitles(
    @Query('q') query: string,
    @Query('limit') limit = 10,
  ): Promise<ApiResponseDto<TitleResponseDto[]>> {
    try {
      const result = await this.titlesService.findAll({
        search: query,
        page: 1,
        limit: Number(limit),
      });
      const data = result.titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        cover: title.coverImage,
        description: title.description,
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

  @Post('titles')
  @UseInterceptors(
    FileInterceptor('coverImage', {
      storage: diskStorage({
        destination: './uploads/covers',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async create(
    @Body() createTitleDto: CreateTitleDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (file) {
        createTitleDto.coverImage = `/uploads/covers/${file.filename}`;
      }
      const data = await this.titlesService.create(createTitleDto);

      return {
        success: true,
        data,
        message: 'Title created successfully',
        timestamp: new Date().toISOString(),
        path: 'titles',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create title',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles',
        method: 'POST',
      };
    }
  }

  @Put('titles/:id')
  @UseInterceptors(
    FileInterceptor('coverImage', {
      storage: diskStorage({
        destination: './uploads/covers',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  @UsePipes(new ValidationPipe({ transform: true }))
  async update(
    @Param('id') id: string,
    @Body() updateTitleDto: UpdateTitleDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (file) {
        updateTitleDto.coverImage = `/uploads/covers/${file.filename}`;
      }
      const data = await this.titlesService.update(id, updateTitleDto);

      return {
        success: true,
        data,
        message: 'Title updated successfully',
        timestamp: new Date().toISOString(),
        path: `titles/${id}`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update title',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `titles/${id}`,
        method: 'PUT',
      };
    }
  }

  @Get('titles')
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('genre') genre?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.titlesService.findAll({
        page: Number(page),
        limit: Number(limit),
        search,
        genre,
        status: status as any,
        sortBy,
        sortOrder,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch titles',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles',
      };
    }
  }

  @Get('titles/recent')
  async getRecent(@Query('limit') limit = 10): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.titlesService.getRecentTitles(Number(limit));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/recent',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch recent titles',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/recent',
      };
    }
  }

  @Get('titles/:id')
  async findOne(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.titlesService.findById(id);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `titles/${id}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch title',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `titles/${id}`,
      };
    }
  }

  @Delete('titles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    try {
      await this.titlesService.delete(id);

      return {
        success: true,
        message: 'Title deleted successfully',
        timestamp: new Date().toISOString(),
        path: `titles/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete title',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `titles/${id}`,
        method: 'DELETE',
      };
    }
  }

  @Post('titles/:id/views')
  async incrementViews(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.titlesService.incrementViews(id);

      return {
        success: true,
        data,
        message: 'Views incremented successfully',
        timestamp: new Date().toISOString(),
        path: `titles/${id}/views`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to increment views',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `titles/${id}/views`,
        method: 'POST',
      };
    }
  }

  @Post('titles/:id/rating')
  async updateRating(
    @Param('id') id: string,
    @Body('rating', ParseFloatPipe) rating: number,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.titlesService.updateRating(id, rating);

      return {
        success: true,
        data,
        message: 'Rating updated successfully',
        timestamp: new Date().toISOString(),
        path: `titles/${id}/rating`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update rating',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `titles/${id}/rating`,
        method: 'POST',
      };
    }
  }

  @Get('titles/:id/chapters/count')
  async getChaptersCount(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.titlesService.getChaptersCount(id);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `titles/${id}/chapters/count`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch chapters count',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `titles/${id}/chapters/count`,
      };
    }
  }
}
