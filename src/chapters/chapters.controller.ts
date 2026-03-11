import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
  Header,
  UploadedFiles,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  BadRequestException,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChaptersService } from './chapters.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { FileUploadInterceptor } from '../common/interceptors/file-upload.interceptor';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { BotDetectionService } from '../common/services/bot-detection.service';
import { SetChapterRatingDto } from './dto/set-chapter-rating.dto';
import { ToggleChapterReactionDto } from './dto/toggle-chapter-reaction.dto';
import { ALLOWED_REACTION_EMOJIS } from '../schemas/comment.schema';

@Controller('chapters')
export class ChaptersController {
  constructor(
    private readonly chaptersService: ChaptersService,
    private readonly botDetectionService: BotDetectionService,
  ) {}

  /**
   * Вспомогательный метод для проверки IP-активности
   * Выбрасывает ForbiddenException если IP заблокирован
   */
  private async checkIPActivity(req: Request): Promise<void> {
    const ip = (req as any).realIP || req.ip || 'unknown';
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

  @Post()
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async create(
    @Body() createChapterDto: CreateChapterDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.create(createChapterDto);

      return {
        success: true,
        data,
        message: 'Chapter created successfully',
        timestamp: new Date().toISOString(),
        path: 'chapters',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create chapter',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'chapters',
        method: 'POST',
      };
    }
  }

  @Post('upload')
  @UseInterceptors(
    FileUploadInterceptor.createMultiple('pages', {
      destination: './uploads/chapters',
      fileTypes: /\/(jpg|jpeg|png|webp|gif)$/,
      fileSize: 50 * 1024 * 1024, // 50MB limit for chapter pages
      filenamePrefix: 'chapter-page',
      maxFiles: 50,
    }),
  )
  @UsePipes(new ValidationPipe({ transform: true }))
  async createWithPages(
    @Body() createChapterDto: CreateChapterDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!files || files.length === 0) {
        throw new BadRequestException('At least one page image is required');
      }

      const data = await this.chaptersService.createWithPages(
        createChapterDto,
        files,
      );

      return {
        success: true,
        data,
        message: 'Chapter with pages created successfully',
        timestamp: new Date().toISOString(),
        path: 'chapters/upload',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create chapter with pages',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'chapters/upload',
        method: 'POST',
      };
    }
  }

  @Get()
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('titleId') titleId: string,
    @Query('sortBy') sortBy: string = 'chapterNumber',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
    @Query('withoutPages') withoutPages?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.findAll({
        page: Number(page),
        limit: Number(limit),
        titleId,
        sortBy,
        sortOrder,
        withoutPages: withoutPages === 'true' || withoutPages === '1',
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'chapters',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch chapters',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'chapters',
      };
    }
  }

  @Get('count')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async count(
    @Query('titleId') titleId?: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const total = await this.chaptersService.count({ titleId });
      const data = { total };

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'chapters/count',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to count chapters',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'chapters/count',
      };
    }
  }

  @Get('reactions/emojis')
  async getReactionEmojis(): Promise<ApiResponseDto<string[]>> {
    return {
      success: true,
      data: [...ALLOWED_REACTION_EMOJIS],
      timestamp: new Date().toISOString(),
      path: 'chapters/reactions/emojis',
    };
  }

  /** Health check for rating feature: GET /api/chapters/rating/health → 200 if route is registered (after deploy). */
  @Get('rating/health')
  async ratingHealth(): Promise<ApiResponseDto<{ rating: string }>> {
    return {
      success: true,
      data: { rating: 'available' },
      timestamp: new Date().toISOString(),
      path: 'chapters/rating/health',
    };
  }

  @Get(':id/next')
  async getNextChapter(
    @Param('id') id: string,
    @Query('currentChapter') currentChapter: number,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const chapter = await this.chaptersService.findById(id);
      const data = await this.chaptersService.getNextChapter(
        chapter.titleId._id.toString(),
        currentChapter,
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/next`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch next chapter',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/next`,
      };
    }
  }

  @Get(':id/prev')
  async getPrevChapter(
    @Param('id') id: string,
    @Query('currentChapter') currentChapter: number,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const chapter = await this.chaptersService.findById(id);
      const data = await this.chaptersService.getPrevChapter(
        chapter.titleId._id.toString(),
        currentChapter,
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/prev`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch previous chapter',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/prev`,
      };
    }
  }

  @Get('title/:titleId')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getChaptersByTitle(
    @Param('titleId') titleId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'asc',
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const data = await this.chaptersService.findAll({
        page: Number(page),
        limit: Number(limit),
        titleId,
        sortBy: 'chapterNumber',
        sortOrder,
      });
      const userId = req?.user?.userId ?? undefined;
      data.chapters =
        await this.chaptersService.enrichChaptersWithRatingAndReactions(
          data.chapters,
          userId,
        );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/title/${titleId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch chapters by title',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/title/${titleId}`,
      };
    }
  }

  @Get('by-number/:titleId')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getByNumber(
    @Param('titleId') titleId: string,
    @Query('chapterNumber') chapterNumber: number,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const chapter = await this.chaptersService.findByTitleAndNumber(
        titleId,
        Number(chapterNumber),
      );
      if (!chapter) {
        return {
          success: false,
          message: 'Chapter not found',
          errors: ['Chapter not found'],
          timestamp: new Date().toISOString(),
          path: `chapters/by-number/${titleId}`,
        };
      }
      const chapterId =
        (chapter as any)._id?.toString?.() ?? (chapter as any).id;
      const chapterObj =
        typeof (chapter as any).toObject === 'function'
          ? (chapter as any).toObject()
          : chapter;
      const userId = req?.user?.userId ?? null;
      const rating = await this.chaptersService.getRating(
        chapterId,
        userId ?? undefined,
      );
      const { reactions } =
        await this.chaptersService.getReactionsCount(chapterId);
      const data = {
        ...chapterObj,
        ...rating,
        reactions,
      };

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/by-number/${titleId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch chapter by number',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/by-number/${titleId}`,
      };
    }
  }

  @Get('latest/:titleId')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getLatest(
    @Param('titleId') titleId: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const data = await this.chaptersService.getLatestChapter(titleId);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/latest/${titleId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch latest chapter',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/latest/${titleId}`,
      };
    }
  }

  @Patch(':id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async update(
    @Param('id') id: string,
    @Body() updateChapterDto: UpdateChapterDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.update(id, updateChapterDto);

      return {
        success: true,
        data,
        message: 'Chapter updated successfully',
        timestamp: new Date().toISOString(),
        path: `chapters/${id}`,
        method: 'PATCH',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update chapter',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    try {
      await this.chaptersService.delete(id);

      return {
        success: true,
        message: 'Chapter deleted successfully',
        timestamp: new Date().toISOString(),
        path: `chapters/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete chapter',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}`,
        method: 'DELETE',
      };
    }
  }

  @Post(':id/view')
  async incrementViews(
    @Param('id') id: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      // Extract userId from JWT if token is present, otherwise null (anonymous)
      const userId = req?.user?.userId || null;
      const data = await this.chaptersService.incrementViews(id, userId);

      return {
        success: true,
        data,
        message: userId
          ? 'Chapter views incremented successfully'
          : 'Chapter views incremented (anonymous)',
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/view`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to increment chapter views',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/view`,
        method: 'POST',
      };
    }
  }

  @Post(':id/rating')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async setRating(
    @Param('id') id: string,
    @Body() dto: SetChapterRatingDto,
    @Req() req: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.setRating(
        id,
        req.user.userId,
        dto.value,
      );
      return {
        success: true,
        data,
        message: 'Chapter rating updated',
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/rating`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to set chapter rating',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/rating`,
        method: 'POST',
      };
    }
  }

  @Get(':id/rating')
  @UseGuards(OptionalJwtAuthGuard)
  async getRating(
    @Param('id') id: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req?.user?.userId;
      const data = await this.chaptersService.getRating(id, userId);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/rating`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get chapter rating',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/rating`,
      };
    }
  }

  @Get(':id/reactions')
  @UseGuards(OptionalJwtAuthGuard)
  async getReactions(
    @Param('id') id: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req?.user?.userId;
      const data = await this.chaptersService.getReactionsCount(id, userId);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/reactions`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get chapter reactions',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/reactions`,
      };
    }
  }

  @Post(':id/reactions')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async toggleReaction(
    @Param('id') id: string,
    @Body() dto: ToggleChapterReactionDto,
    @Req() req: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.toggleReaction(
        id,
        req.user.userId,
        dto.emoji,
      );
      return {
        success: true,
        data,
        message: 'Chapter reaction toggled',
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/reactions`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to toggle chapter reaction',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/reactions`,
        method: 'POST',
      };
    }
  }

  @Get(':id/reactions/count')
  @UseGuards(OptionalJwtAuthGuard)
  async getReactionsCount(
    @Param('id') id: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req?.user?.userId;
      const data = await this.chaptersService.getReactionsCount(id, userId);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/reactions/count`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get chapter reactions count',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/reactions/count`,
      };
    }
  }

  /** GET one chapter by id — declared last so static paths (e.g. rating/health) and :id/… routes match first */
  @Get(':id')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async findOne(
    @Param('id') id: string,
    @Req() req?: any,
  ): Promise<ApiResponseDto<any>> {
    await this.checkIPActivity(req);

    try {
      const chapter = await this.chaptersService.findById(id);
      const chapterObj =
        typeof (chapter as any).toObject === 'function'
          ? (chapter as any).toObject()
          : chapter;
      const userId = req?.user?.userId ?? null;
      const rating = await this.chaptersService.getRating(
        id,
        userId ?? undefined,
      );
      const { reactions } = await this.chaptersService.getReactionsCount(id);
      const data = {
        ...chapterObj,
        ...rating,
        reactions,
      };

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `chapters/${id}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch chapter',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}`,
      };
    }
  }

  @Post(':id/pages')
  @UseInterceptors(
    FileUploadInterceptor.createMultiple('pages', {
      destination: './uploads/chapters',
      fileTypes: /\/(jpg|jpeg|png|webp|gif)$/,
      fileSize: 50 * 1024 * 1024, // 50MB limit for chapter pages
      filenamePrefix: 'chapter-page',
      maxFiles: 100,
    }),
  )
  @UsePipes(new ValidationPipe({ transform: true }))
  async addPages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!files || files.length === 0) {
        throw new BadRequestException('At least one page image is required');
      }

      const data = await this.chaptersService.addPagesToChapter(id, files);

      return {
        success: true,
        data,
        message: 'Pages added to chapter successfully',
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/pages`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to add pages to chapter',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `chapters/${id}/pages`,
        method: 'POST',
      };
    }
  }

  @Post('bulk-delete')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async bulkDelete(@Body('ids') ids: string[]): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.chaptersService.bulkDelete(ids || []);
      const data = { deleted: result.deletedCount };

      return {
        success: true,
        data,
        message: 'Chapters deleted successfully',
        timestamp: new Date().toISOString(),
        path: 'chapters/bulk-delete',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete chapters',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'chapters/bulk-delete',
        method: 'POST',
      };
    }
  }

  @Post('cleanup-orphaned')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async cleanupOrphanedChapters(): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.chaptersService.deleteChaptersWithoutTitleId();
      const data = { deleted: result.deletedCount };

      return {
        success: true,
        data,
        message: 'Orphaned chapters deleted successfully',
        timestamp: new Date().toISOString(),
        path: 'chapters/cleanup-orphaned',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to cleanup orphaned chapters',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'chapters/cleanup-orphaned',
        method: 'POST',
      };
    }
  }
}
