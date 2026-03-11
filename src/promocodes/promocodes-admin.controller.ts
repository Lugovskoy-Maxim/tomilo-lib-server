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
  Req,
} from '@nestjs/common';
import { PromocodesService } from './promocodes.service';
import { CreatePromoCodeDto, UpdatePromoCodeDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

interface AuthenticatedRequest {
  user: { userId: string; email: string; roles: string[] };
}

@Controller('promocodes/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@UsePipes(new ValidationPipe({ transform: true }))
export class PromocodesAdminController {
  constructor(private readonly promocodesService: PromocodesService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ): Promise<ApiResponseDto<unknown>> {
    try {
      const result = await this.promocodesService.findAll({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        status,
        search,
      });
      return {
        success: true,
        data: result.data,
        message: 'Promo codes fetched successfully',
        timestamp: new Date().toISOString(),
        path: 'promocodes/admin',
        method: 'GET',
        ...{ total: result.total, page: result.page, limit: result.limit },
      } as ApiResponseDto<unknown>;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch promo codes',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'promocodes/admin',
        method: 'GET',
      };
    }
  }

  @Get('generate')
  async generateCode(
    @Query('length') length?: string,
    @Query('prefix') prefix?: string,
  ): Promise<ApiResponseDto<{ code: string }>> {
    try {
      const code = await this.promocodesService.generateCode({
        length: length ? parseInt(length, 10) : 8,
        prefix: prefix ?? '',
      });
      return {
        success: true,
        data: { code },
        message: 'Code generated successfully',
        timestamp: new Date().toISOString(),
        path: 'promocodes/admin/generate',
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate code',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'promocodes/admin/generate',
        method: 'GET',
      };
    }
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ApiResponseDto<unknown>> {
    try {
      const promo = await this.promocodesService.findById(id);
      return {
        success: true,
        data: promo,
        message: 'Promo code fetched successfully',
        timestamp: new Date().toISOString(),
        path: `promocodes/admin/${id}`,
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch promo code',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `promocodes/admin/${id}`,
        method: 'GET',
      };
    }
  }

  @Get(':id/usage')
  async getUsage(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<unknown>> {
    try {
      const result = await this.promocodesService.getUsage(id, {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      return {
        success: true,
        data: result.data,
        message: 'Usage history fetched successfully',
        timestamp: new Date().toISOString(),
        path: `promocodes/admin/${id}/usage`,
        method: 'GET',
        ...{ total: result.total, page: result.page, limit: result.limit },
      } as ApiResponseDto<unknown>;
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch usage history',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `promocodes/admin/${id}/usage`,
        method: 'GET',
      };
    }
  }

  @Post()
  async create(
    @Body() dto: CreatePromoCodeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponseDto<unknown>> {
    try {
      const promo = await this.promocodesService.create(dto, req.user.userId);
      return {
        success: true,
        data: promo,
        message: 'Promo code created successfully',
        timestamp: new Date().toISOString(),
        path: 'promocodes/admin',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create promo code',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'promocodes/admin',
        method: 'POST',
      };
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePromoCodeDto,
  ): Promise<ApiResponseDto<unknown>> {
    try {
      const promo = await this.promocodesService.update(id, dto);
      return {
        success: true,
        data: promo,
        message: 'Promo code updated successfully',
        timestamp: new Date().toISOString(),
        path: `promocodes/admin/${id}`,
        method: 'PATCH',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update promo code',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `promocodes/admin/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<{ message: string }>> {
    try {
      await this.promocodesService.delete(id);
      return {
        success: true,
        data: { message: 'Promo code deleted successfully' },
        message: 'Promo code deleted successfully',
        timestamp: new Date().toISOString(),
        path: `promocodes/admin/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete promo code',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `promocodes/admin/${id}`,
        method: 'DELETE',
      };
    }
  }
}
