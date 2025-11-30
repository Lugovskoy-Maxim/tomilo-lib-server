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
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChaptersService } from './chapters.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { FileUploadInterceptor } from '../common/interceptors/file-upload.interceptor';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

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
      fileSize: 10 * 1024 * 1024, // 10MB limit for chapter pages
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
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.findAll({
        page: Number(page),
        limit: Number(limit),
        titleId,
        sortBy,
        sortOrder,
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
  ): Promise<ApiResponseDto<any>> {
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

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.findById(id);

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

  @Get(':id/next')
  async getNextChapter(
    @Param('id') id: string,
    @Query('currentChapter') currentChapter: number,
  ): Promise<ApiResponseDto<any>> {
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
  ): Promise<ApiResponseDto<any>> {
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
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.findAll({
        page: Number(page),
        limit: Number(limit),
        titleId,
        sortBy: 'chapterNumber',
        sortOrder,
      });

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
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.findByTitleAndNumber(
        titleId,
        Number(chapterNumber),
      );

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
  ): Promise<ApiResponseDto<any>> {
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
  async incrementViews(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.chaptersService.incrementViews(id);

      return {
        success: true,
        data,
        message: 'Chapter views incremented successfully',
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

  @Post(':id/pages')
  @UseInterceptors(
    FileUploadInterceptor.createMultiple('pages', {
      destination: './uploads/chapters',
      fileTypes: /\/(jpg|jpeg|png|webp|gif)$/,
      fileSize: 10 * 1024 * 1024, // 10MB limit for chapter pages
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
}
