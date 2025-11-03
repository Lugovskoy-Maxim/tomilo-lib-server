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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { TitlesService } from './titles.service';
import { CreateTitleDto } from './dto/create-title.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { extname } from 'path';
import { FilterOptionsResponseDto } from './dto/title-controller.dto';

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

  // Эндпоинты для главной страницы
  @Get('titles/popular')
  async getPopularTitles(
    @Query('limit') limit = 10,
  ): Promise<TitleResponseDto[]> {
    const titles = await this.titlesService.getPopularTitles(Number(limit));

    return titles.map((title) => ({
      id: title._id?.toString(),
      title: title.name,
      cover: title.coverImage,
      description: title.description,
    }));
  }

  @Get('collections')
  getCollections(@Query('limit') limit = 10): CollectionResponseDto[] {
    // Здесь должна быть логика получения коллекций
    // Временно возвращаем заглушку
    return [
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
  }

  @Get('titles/filters/options')
  async getFilterOptions(): Promise<FilterOptionsResponseDto> {
    const filterOptions = await this.titlesService.getFilterOptions();

    return {
      genres: filterOptions.genres,
      // types: filterOptions.types,
      status: filterOptions.status,
    };
  }

  @Get('user/reading-progress')
  async getReadingProgress(
    @Query('limit') limit = 10,
  ): Promise<ReadingProgressResponseDto[]> {
    // Здесь должна быть логика получения прогресса чтения пользователя
    // Временно возвращаем заглушку
    const popularTitles = await this.titlesService.getPopularTitles(
      Number(limit),
    );

    return popularTitles.map((title, index) => ({
      id: title._id?.toString(),
      title: title.name,
      cover: title.coverImage,
      currentChapter: `Глава ${index + 1}`,
      chapterNumber: index + 1,
      progress: Math.floor(Math.random() * 100),
    }));
  }

  @Get('titles/latest-updates')
  async getLatestUpdates(
    @Query('limit') limit = 10,
  ): Promise<LatestUpdateResponseDto[]> {
    const recentTitles = await this.titlesService.getRecentTitles(
      Number(limit),
    );

    return recentTitles.map((title, index) => ({
      id: title._id?.toString(),
      title: title.name,
      cover: title.coverImage,
      chapter: `Глава ${index + 150}`,
      chapterNumber: index + 150,
      timeAgo: `${index + 1} часа назад`,
    }));
  }

  @Get('search')
  async searchTitles(@Query('q') query: string, @Query('limit') limit = 10) {
    const result = await this.titlesService.findAll({
      search: query,
      page: 1,
      limit: Number(limit),
    });

    return result.titles.map((title) => ({
      id: title._id?.toString(),
      title: title.name,
      cover: title.coverImage,
      description: title.description,
    }));
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
  ) {
    if (file) {
      createTitleDto.coverImage = `/uploads/covers/${file.filename}`;
    }
    return this.titlesService.create(createTitleDto);
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
  ) {
    if (file) {
      updateTitleDto.coverImage = `/uploads/covers/${file.filename}`;
    }
    return this.titlesService.update(id, updateTitleDto);
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
  ) {
    return this.titlesService.findAll({
      page: Number(page),
      limit: Number(limit),
      search,
      genre,
      status: status as any,
      sortBy,
      sortOrder,
    });
  }

  @Get('titles/recent')
  async getRecent(@Query('limit') limit = 10) {
    return this.titlesService.getRecentTitles(Number(limit));
  }

  @Get('titles/:id')
  async findOne(@Param('id') id: string) {
    return this.titlesService.findById(id);
  }

  @Delete('titles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.titlesService.delete(id);
  }

  @Post('titles/:id/view')
  async incrementViews(@Param('id') id: string) {
    return this.titlesService.incrementViews(id);
  }

  @Get('titles/:id/chapters/count')
  async getChaptersCount(@Param('id') id: string) {
    return this.titlesService.getChaptersCount(id);
  }
}
