import {
  Controller,
  Get,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { QueryAnnouncementDto } from './dto/query-announcement.dto';

/** Публичный API: список и просмотр объявлений/новостей (только опубликованные) */
@Controller('announcements')
@UsePipes(new ValidationPipe({ whitelist: true }))
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  async findAll(
    @Query() query: QueryAnnouncementDto,
  ): Promise<ApiResponseDto<{ announcements: unknown[]; pagination: unknown }>> {
    const data = await this.announcementsService.findAll(query, {
      forPublic: true,
    });
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: 'announcements',
    };
  }

  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<ApiResponseDto<unknown>> {
    const data = await this.announcementsService.findBySlug(slug, {
      forPublic: true,
    });
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: `announcements/by-slug/${slug}`,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ApiResponseDto<unknown>> {
    const data = await this.announcementsService.findById(id, {
      forPublic: true,
    });
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: `announcements/${id}`,
    };
  }
}
