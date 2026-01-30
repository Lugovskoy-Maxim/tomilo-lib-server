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
  UseGuards,
  Logger,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { TitlesService } from './titles.service';
import { CreateTitleDto } from './dto/create-title.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { extname } from 'path';
import { FilterOptionsResponseDto } from './dto/title-controller.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { BotDetectionService } from '../common/services/bot-detection.service';
import { UsersService } from '../users/users.service';

// DTO для ответов API (определения типов для внутреннего использования)
class CollectionResponseDto {
  id: string;
  name: string;
  image: string;
  link: string;
  cover: string;
  description?: string;
  titles: string[];
  comments: string[];
  views: number;
}

class ReadingProgressResponseDto {
  id: string;
  title: string;
  slug: string;
  cover: string;
  currentChapter: string;
  chapterNumber: number;
  progress: number;
}

@Controller()
export class TitlesController {
  private readonly logger = new Logger(TitlesController.name);

  constructor(
    private readonly titlesService: TitlesService,
    private readonly botDetectionService: BotDetectionService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Вспомогательный метод для проверки IP-активности
   * Выбрасывает ForbiddenException если IP заблокирован
   */
  private async checkIPActivity(req: any): Promise<void> {
    const ip = req.realIP || req.ip || 'unknown';
    const checkResult = await this.botDetectionService.canMakeRequest(ip);

    if (!checkResult.allowed) {
      if (checkResult.blocked) {
        throw new ForbiddenException(
          `Access denied: IP blocked. ${checkResult.message}`,
        );
      }
      throw new ForbiddenException(
        `Rate limit exceeded. ${checkResult.message}`,
      );
    }
  }

  /**
   * Вспомогательный метод для определения canViewAdult на основе настроек пользователя
   * Возвращает true если пользователь может видеть взрослый контент
   */
  private async getCanViewAdult(req: any): Promise<boolean> {
    // По умолчанию показываем весь контент для неавторизованных пользователей
    let canViewAdult = true;

    // Извлекаем токен из заголовка Authorization
    const authHeader = req.headers?.authorization || req.headers?.Authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      if (token) {
        try {
          // Декодируем JWT токен и верифицируем для получения userId
          const jwtSecret =
            process.env.JWT_SECRET || 'your-super-secret-jwt-key';

          const decoded = jwt.verify(token, jwtSecret) as { userId?: string };

          if (decoded && decoded.userId) {
            const user = await this.usersService.findById(decoded.userId);
            if (user && user.displaySettings) {
              // Если пользователь отключил взрослый контент в настройках, скрываем его
              canViewAdult = user.displaySettings.isAdult !== false;
            }
          }
        } catch {
          // Токен недействителен или истек, показываем весь контент
          canViewAdult = true;
        }
      }
    }

    return canViewAdult;
  }

  /**
   * Обработать isAdult поле - просто возвращает boolean на основе ageLimit
   * Настройки пользователя НЕ влияют на это поле
   */
  private processAdultField(ageLimit: number | undefined | null): boolean {
    // Если ageLimit не определен, обрабатываем как не взрослый контент
    if (ageLimit === undefined || ageLimit === null) {
      return false;
    }

    // Возвращаем true если контент для взрослых (18+)
    return ageLimit >= 18;
  }

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
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const canViewAdult = await this.getCanViewAdult(req);
      const titles = await this.titlesService.getPopularTitles(
        Number(limit),
        canViewAdult,
      );

      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        slug: title.slug,
        cover: title.coverImage,
        rating: title.averageRating,
        type: title.type,
        releaseYear: title.releaseYear,
        description: title.description,
        isAdult: this.processAdultField(title.ageLimit),
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
  async getCollections(
    @Query('limit') limit = 10,
  ): Promise<ApiResponseDto<CollectionResponseDto[]>> {
    try {
      const collections = await this.titlesService.getCollections(
        Number(limit),
      );
      const data = collections.map((collection) => ({
        id: collection._id?.toString(),
        name: collection.name,
        image: collection.cover,
        link: `/collections/${collection._id.toString()}`,
        cover: collection.cover,
        description: collection.description,
        titles: collection.titles?.map((title) => title.toString()) || [],
        comments: collection.comments || [],
        views: collection.views,
      }));

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
        types: filterOptions.types,
        status: filterOptions.status,
        tags: filterOptions.tags,
        releaseYears: filterOptions.releaseYears,
        ageLimits: filterOptions.ageLimits,
        sortByOptions: filterOptions.sortByOptions,
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
        slug: title.slug,
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
    @Query('limit') limit = 15,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const canViewAdult = await this.getCanViewAdult(req);
      const titlesWithChapters =
        await this.titlesService.getTitlesWithRecentChapters(
          Number(limit),
          canViewAdult,
        );
      const data = titlesWithChapters.map((item) => {
        const releaseDate = new Date(item.latestChapter.releaseDate);

        let chapterString = `Глава ${item.maxChapter}`;

        if (item.minChapter !== item.maxChapter) {
          chapterString = `Главы ${item.minChapter}-${item.maxChapter}`;
        }

        return {
          id: item._id?.toString(),
          title: item.name,
          slug: item.slug,
          cover: item.coverImage,
          type: item.type,
          releaseYear: item.releaseYear,
          chapter: chapterString,
          chapterNumber: item.maxChapter,
          timeAgo: releaseDate,
          isAdult: this.processAdultField(item.ageLimit),
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
    @Query('page') page = 1,
    @Query('genres') genres?: string,
    @Query('status') status?: string,
    @Query('types') types?: string,
    @Query('releaseYears') releaseYears?: string,
    @Query('ageLimits') ageLimits?: string,
    @Query('tags') tags?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const canViewAdult = await this.getCanViewAdult(req);
      const result = await this.titlesService.findAll({
        search: query,
        page: Number(page),
        limit: Number(limit),
        genres: this.parseCommaSeparatedValues(genres),
        status: status as any,
        types: this.parseCommaSeparatedValues(types),
        releaseYears: this.parseNumberArray(releaseYears),
        ageLimits: this.parseNumberArray(ageLimits),
        sortBy,
        sortOrder,
        populateChapters: false,
        canViewAdult,
      });

      const data = result.titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        slug: title.slug,
        rating: title.averageRating,
        cover: title.coverImage,
        description: title.description,
        type: title.type,
        releaseYear: title.releaseYear,
        genres: title.genres,
        tags: title.tags,
        status: title.status,
        ageLimit: title.ageLimit,
        isAdult: this.processAdultField(title?.ageLimit),
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
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
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

  private decodeParam(param: string | undefined): string | undefined {
    if (!param) return undefined;
    try {
      // Пытаемся декодировать URL-параметр
      return decodeURIComponent(param);
    } catch (error) {
      // Если декодирование не удалось, возвращаем исходное значение
      this.logger.warn(`Failed to decode parameter: ${param}, error ${error}`);

      return param;
    }
  }

  private parseCommaSeparatedValues(param: string | undefined): string[] {
    if (!param) return [];

    // Заменяем + на пробелы перед декодированием для корректной обработки жанров
    const normalizedParam = param.replace(/\+/g, ' ');

    return normalizedParam
      .split(',')
      .map((value) => this.decodeParam(value.trim()))
      .filter(
        (value): value is string => value !== undefined && value.length > 0,
      );
  }

  private parseNumberArray(param: string | undefined): number[] {
    if (!param) return [];
    return param
      .split(',')
      .map((value) => parseInt(value.trim(), 10))
      .filter((value) => !isNaN(value));
  }

  private parseNumber(param: string | undefined): number | null {
    if (!param) return null;
    const num = parseInt(param.trim(), 10);
    return isNaN(num) ? null : num;
  }

  private parseGenreString(param: string | undefined): string[] {
    // Специальная обработка для жанров с поддержкой URL-кодировки
    if (!param) return [];

    try {
      // Пытаемся декодировать как единую строку
      const decoded = this.decodeParam(param);
      if (decoded) {
        // Если декодирование удалось, проверяем, есть ли запятые
        if (decoded.includes(',')) {
          return decoded
            .split(',')
            .map((genre) => genre.trim())
            .filter((genre) => genre.length > 0);
        } else {
          return [decoded];
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to decode genre parameter: ${param}, error ${error}`,
      );
    }

    // Если декодирование не удалось или нет запятых, обрабатываем как есть
    if (param.includes(',')) {
      return param
        .split(',')
        .map((genre) => genre.trim())
        .filter((genre) => genre.length > 0);
    } else {
      return [param];
    }
  }

  @Get('titles')
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('genres') genres?: string,
    @Query('types') types?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('releaseYears') releaseYears?: string,
    @Query('releaseYear') releaseYear?: string,
    @Query('ageLimits') ageLimits?: string,
    @Query('ageLimit') ageLimit?: string | string[],
    @Query('tags') tags?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      // Логируем только если параметры фильтрации возраста предоставлены
      if (ageLimit !== undefined) {
        this.logger.debug(
          `Received ageLimit query param: ${JSON.stringify(ageLimit)}`,
        );
      }
      if (ageLimits !== undefined) {
        this.logger.debug(`Received ageLimits query param: ${ageLimits}`);
      }

      // Определяем типы для фильтрации
      let filterTypes: string[] = [];
      if (type && types) {
        filterTypes = [
          ...this.parseCommaSeparatedValues(types),
          ...this.parseCommaSeparatedValues(type),
        ];
      } else if (type) {
        filterTypes = [type];
      } else if (types) {
        filterTypes = this.parseCommaSeparatedValues(types);
      }

      // Определяем года для фильтрации
      let filterReleaseYears: number[] = [];
      if (releaseYear && releaseYears) {
        const releaseYearNum = this.parseNumber(releaseYear);
        const releaseYearsArray = this.parseNumberArray(releaseYears);
        if (releaseYearNum) filterReleaseYears.push(releaseYearNum);
        filterReleaseYears = [...filterReleaseYears, ...releaseYearsArray];
      } else if (releaseYear) {
        const releaseYearNum = this.parseNumber(releaseYear);
        if (releaseYearNum) filterReleaseYears = [releaseYearNum];
      } else if (releaseYears) {
        filterReleaseYears = this.parseNumberArray(releaseYears);
      }

      // Определяем возрастные ограничения для фильтрации
      let filterAgeLimits: number[] = [];

      // 1. Обрабатываем ageLimit как массив (ageLimit[0]=12&ageLimit[1]=16)
      if (Array.isArray(ageLimit)) {
        filterAgeLimits = ageLimit
          .map((al) => parseInt(al, 10))
          .filter((al) => !isNaN(al));
      }
      // 2. Обрабатываем ageLimit как одиночное значение (ageLimit=12)
      else if (ageLimit && typeof ageLimit === 'string') {
        const ageLimitNum = this.parseNumber(ageLimit);
        if (ageLimitNum) filterAgeLimits = [ageLimitNum];
      }

      // 3. Обрабатываем ageLimits как строку с запятыми (ageLimits=12,16,18)
      if (ageLimits) {
        const ageLimitsArray = this.parseNumberArray(ageLimits);
        if (ageLimitsArray.length > 0) {
          // Объединяем массивы, удаляем дубликаты
          filterAgeLimits = [
            ...new Set([...filterAgeLimits, ...ageLimitsArray]),
          ];
        }
      }

      // Логируем только если фильтрация по возрастным ограничениям активна
      if (filterAgeLimits.length > 0) {
        this.logger.debug(
          `Active age limits filter: ${JSON.stringify(filterAgeLimits)}`,
        );
      }

      const canViewAdult = await this.getCanViewAdult(req);

      const result = await this.titlesService.findAll({
        page: Number(page),
        limit: Number(limit),
        search,
        genres: this.parseCommaSeparatedValues(genres),
        types: filterTypes,
        status: status as any,
        releaseYears: filterReleaseYears,
        ageLimits: filterAgeLimits,
        tags: this.parseCommaSeparatedValues(tags),
        sortBy,
        sortOrder,
        populateChapters: false,
        canViewAdult,
      });

      const data = {
        ...result,
        titles: result.titles.map((title) => ({
          ...title.toObject(),
          isAdult: this.processAdultField(title?.ageLimit),
        })),
      };

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles',
      };
    } catch (error) {
      this.logger.error(`Error fetching titles: ${error.message}`, error.stack);
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
  async getRecent(
    @Query('limit') limit = 10,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const canViewAdult = await this.getCanViewAdult(req);
      const data = await this.titlesService.getRecentTitles(
        Number(limit),
        canViewAdult,
      );

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

  @Get('titles/random')
  async getRandomTitles(
    @Query('limit') limit = 10,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const canViewAdult = await this.getCanViewAdult(req);
      const titles = await this.titlesService.getRandomTitles(
        Number(limit),
        canViewAdult,
      );

      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        slug: title.slug,
        cover: title.coverImage,
        rating: title.averageRating,
        type: title.type,
        releaseYear: title.releaseYear,
        description: title.description,
        isAdult: this.processAdultField(title?.ageLimit),
      }));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/random',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch random titles',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/random',
      };
    }
  }

  @Get('titles/:id')
  async findOne(
    @Param('id') id: string,
    @Query('populateChapters') populateChapters: string = 'true',
  ): Promise<ApiResponseDto<any>> {
    try {
      const shouldPopulateChapters = populateChapters === 'true';
      const title = await this.titlesService.findById(
        id,
        shouldPopulateChapters,
      );

      const data = {
        ...JSON.parse(JSON.stringify(title)),
        isAdult: this.processAdultField(title?.ageLimit),
      };

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

  @Get('titles/slug/:slug')
  async findBySlug(
    @Param('slug') slug: string,
    @Query('populateChapters') populateChapters: string = 'true',
  ): Promise<ApiResponseDto<any>> {
    try {
      const shouldPopulateChapters = populateChapters === 'true';
      const title = await this.titlesService.findBySlug(
        slug,
        shouldPopulateChapters,
      );

      if (!title) {
        return {
          success: false,
          message: 'Title not found',
          errors: ['Title with provided slug does not exist'],
          timestamp: new Date().toISOString(),
          path: `titles/slug/${slug}`,
        };
      }

      const data = {
        ...JSON.parse(JSON.stringify(title)),
        isAdult: this.processAdultField(title?.ageLimit),
      };

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `titles/slug/${slug}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch title by slug',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `titles/slug/${slug}`,
      };
    }
  }

  @Delete('titles/:id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
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

  @Get('titles/top/day')
  async getTopTitlesDay(
    @Query('limit') limit = 10,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const canViewAdult = await this.getCanViewAdult(req);
      const titles = await this.titlesService.getTopTitlesForPeriod(
        'day',
        Number(limit),
        canViewAdult,
      );

      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        slug: title.slug,
        cover: title.coverImage,
        rating: title.averageRating,
        type: title.type,
        releaseYear: title.releaseYear,
        description: title.description,
        isAdult: this.processAdultField(title?.ageLimit),
      }));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/top/day',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch top titles for day',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/top/day',
      };
    }
  }

  @Get('titles/top/week')
  async getTopTitlesWeek(
    @Query('limit') limit = 10,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const canViewAdult = await this.getCanViewAdult(req);
      const titles = await this.titlesService.getTopTitlesForPeriod(
        'week',
        Number(limit),
        canViewAdult,
      );

      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        slug: title.slug,
        cover: title.coverImage,
        rating: title.averageRating,
        type: title.type,
        releaseYear: title.releaseYear,
        description: title.description,
        isAdult: this.processAdultField(title?.ageLimit),
      }));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/top/week',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch top titles for week',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/top/week',
      };
    }
  }

  @Get('titles/top/month')
  async getTopTitlesMonth(
    @Query('limit') limit = 10,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const canViewAdult = await this.getCanViewAdult(req);
      const titles = await this.titlesService.getTopTitlesForPeriod(
        'month',
        Number(limit),
        canViewAdult,
      );

      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        slug: title.slug,
        cover: title.coverImage,
        rating: title.averageRating,
        type: title.type,
        releaseYear: title.releaseYear,
        description: title.description,
        isAdult: this.processAdultField(title?.ageLimit),
      }));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/top/month',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch top titles for month',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/top/month',
      };
    }
  }

  /**
   * Получить рекомендуемые тайтлы на основе истории чтения и закладок пользователя
   */
  @Get('titles/recommended')
  @UseGuards(JwtAuthGuard)
  async getRecommendedTitles(
    @Query('limit') limit = 10,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      // Извлекаем userId из JWT токена
      const authHeader =
        req.headers?.authorization || req.headers?.Authorization;
      let userId: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token) {
          try {
            const jwtSecret =
              process.env.JWT_SECRET || 'your-super-secret-jwt-key';
            const decoded = jwt.verify(token, jwtSecret) as { userId?: string };
            userId = decoded.userId || null;
          } catch {
            userId = null;
          }
        }
      }

      if (!userId) {
        return {
          success: false,
          message: 'User not authenticated',
          errors: ['Authentication required for recommendations'],
          timestamp: new Date().toISOString(),
          path: 'titles/recommended',
        };
      }

      // Определяем, может ли пользователь видеть взрослый контент
      const canViewAdult = await this.getCanViewAdult(req);

      // Получаем рекомендуемые тайтлы
      const titles = await this.titlesService.getRecommendedTitles(
        userId,
        Number(limit),
        canViewAdult,
      );

      const data = titles.map((title) => ({
        id: title._id?.toString(),
        title: title.name,
        slug: title.slug,
        cover: title.coverImage,
        rating: title.averageRating,
        type: title.type,
        releaseYear: title.releaseYear,
        description: title.description,
        genres: title.genres,
        tags: title.tags,
        isAdult: this.processAdultField(title?.ageLimit),
      }));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'titles/recommended',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch recommended titles',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'titles/recommended',
      };
    }
  }
}
