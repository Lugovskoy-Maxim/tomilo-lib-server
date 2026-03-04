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
import { AchievementsAdminService } from './achievements-admin.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('achievements/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AchievementsAdminController {
  constructor(private readonly achievementsAdminService: AchievementsAdminService) {}

  @Get()
  async getAchievements(
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('rarity') rarity?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.achievementsAdminService.findAll({
        search,
        type,
        rarity,
        page: Number(page),
        limit: Number(limit),
      });
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'achievements/admin',
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch achievements',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'achievements/admin',
        method: 'GET',
      };
    }
  }

  @Get(':id')
  async getAchievement(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.achievementsAdminService.findOne(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `achievements/admin/${id}`,
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch achievement',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `achievements/admin/${id}`,
        method: 'GET',
      };
    }
  }

  @Post()
  async createAchievement(
    @Body()
    body: {
      id: string;
      name: string;
      description?: string;
      icon?: string;
      type: string;
      rarity: string;
      maxProgress?: number;
      isHidden?: boolean;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.achievementsAdminService.create(body);
      return {
        success: true,
        data,
        message: 'Achievement created successfully',
        timestamp: new Date().toISOString(),
        path: 'achievements/admin',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create achievement',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'achievements/admin',
        method: 'POST',
      };
    }
  }

  @Post('grant')
  async grantAchievement(
    @Body() body: { achievementId: string; userId: string; progress?: number },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.achievementsAdminService.grant(body);
      return {
        success: true,
        data,
        message: data.message,
        timestamp: new Date().toISOString(),
        path: 'achievements/admin/grant',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to grant achievement',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'achievements/admin/grant',
        method: 'POST',
      };
    }
  }

  @Post('revoke')
  async revokeAchievement(
    @Body() body: { achievementId: string; userId: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.achievementsAdminService.revoke(body);
      return {
        success: true,
        data,
        message: data.message,
        timestamp: new Date().toISOString(),
        path: 'achievements/admin/revoke',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to revoke achievement',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'achievements/admin/revoke',
        method: 'POST',
      };
    }
  }

  @Patch(':id')
  async updateAchievement(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      description: string;
      icon: string;
      type: string;
      rarity: string;
      maxProgress: number;
      isHidden: boolean;
    }>,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.achievementsAdminService.update(id, body);
      return {
        success: true,
        data,
        message: 'Achievement updated successfully',
        timestamp: new Date().toISOString(),
        path: `achievements/admin/${id}`,
        method: 'PATCH',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update achievement',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `achievements/admin/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete(':id')
  async deleteAchievement(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.achievementsAdminService.remove(id);
      return {
        success: true,
        data,
        message: data.message,
        timestamp: new Date().toISOString(),
        path: `achievements/admin/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete achievement',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `achievements/admin/${id}`,
        method: 'DELETE',
      };
    }
  }
}
