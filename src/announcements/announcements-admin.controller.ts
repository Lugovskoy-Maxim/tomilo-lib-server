import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FileUploadInterceptor } from '../common/interceptors/file-upload.interceptor';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { QueryAnnouncementDto } from './dto/query-announcement.dto';

@Controller('announcements/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@UsePipes(new ValidationPipe({ whitelist: true }))
export class AnnouncementsAdminController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  async findAll(
    @Query() query: QueryAnnouncementDto,
  ): Promise<ApiResponseDto<{ announcements: unknown[]; pagination: unknown }>> {
    const data = await this.announcementsService.findAll(query, {
      forPublic: false,
    });
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: 'announcements/admin',
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ApiResponseDto<unknown>> {
    const data = await this.announcementsService.findById(id);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: `announcements/admin/${id}`,
    };
  }

  @Post()
  async create(
    @Body() dto: CreateAnnouncementDto,
  ): Promise<ApiResponseDto<unknown>> {
    const data = await this.announcementsService.create(dto);
    return {
      success: true,
      data,
      message: 'Announcement created',
      timestamp: new Date().toISOString(),
      path: 'announcements/admin',
      method: 'POST',
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ): Promise<ApiResponseDto<unknown>> {
    const data = await this.announcementsService.update(id, dto);
    return {
      success: true,
      data,
      message: 'Announcement updated',
      timestamp: new Date().toISOString(),
      path: `announcements/admin/${id}`,
      method: 'PATCH',
    };
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    await this.announcementsService.delete(id);
    return {
      success: true,
      message: 'Announcement deleted',
      timestamp: new Date().toISOString(),
      path: `announcements/admin/${id}`,
      method: 'DELETE',
    };
  }

  @Post('upload-image')
  @UseInterceptors(
    FileUploadInterceptor.create('file', {
      destination: './uploads/announcements',
      fileTypes: /\/(jpg|jpeg|png|gif|webp)$/,
      fileSize: 10 * 1024 * 1024, // 10 MB
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('announcementId') announcementId?: string,
  ): Promise<ApiResponseDto<{ url: string }>> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const data = await this.announcementsService.saveImage(
      file,
      announcementId || undefined,
    );
    return {
      success: true,
      data,
      message: 'Image uploaded',
      timestamp: new Date().toISOString(),
      path: 'announcements/admin/upload-image',
      method: 'POST',
    };
  }
}
