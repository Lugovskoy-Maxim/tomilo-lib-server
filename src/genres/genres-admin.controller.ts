import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GenresAdminService } from './genres-admin.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('genres/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class GenresAdminController {
  constructor(private readonly genresAdminService: GenresAdminService) {}

  @Get()
  async getGenres(
    @Query('search') search?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.genresAdminService.findAll({
        search,
        page: Number(page),
        limit: Number(limit),
      });
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'genres/admin',
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch genres',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'genres/admin',
        method: 'GET',
      };
    }
  }

  @Get(':id')
  async getGenre(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.genresAdminService.findOne(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `genres/admin/${id}`,
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch genre',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `genres/admin/${id}`,
        method: 'GET',
      };
    }
  }

  @Post()
  async createGenre(
    @Body() body: { name: string; slug?: string; description?: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.genresAdminService.create(body);
      return {
        success: true,
        data,
        message: 'Genre created successfully',
        timestamp: new Date().toISOString(),
        path: 'genres/admin',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create genre',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'genres/admin',
        method: 'POST',
      };
    }
  }

  @Patch(':id')
  async updateGenre(
    @Param('id') id: string,
    @Body() body: { name?: string; slug?: string; description?: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.genresAdminService.update(id, body);
      return {
        success: true,
        data,
        message: 'Genre updated successfully',
        timestamp: new Date().toISOString(),
        path: `genres/admin/${id}`,
        method: 'PATCH',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update genre',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `genres/admin/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete(':id')
  async deleteGenre(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.genresAdminService.remove(id);
      return {
        success: true,
        data,
        message: data.message,
        timestamp: new Date().toISOString(),
        path: `genres/admin/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete genre',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `genres/admin/${id}`,
        method: 'DELETE',
      };
    }
  }

  @Post('merge')
  async mergeGenres(
    @Body() body: { sourceId: string; targetId: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.genresAdminService.merge(body);
      return {
        success: true,
        data,
        message: data.message,
        timestamp: new Date().toISOString(),
        path: 'genres/admin/merge',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to merge genres',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'genres/admin/merge',
        method: 'POST',
      };
    }
  }
}
