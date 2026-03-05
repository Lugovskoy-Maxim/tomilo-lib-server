import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Главный дашборд - общая статистика для админки
   */
  @Get('dashboard')
  async getDashboard(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getDashboardStats();

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/dashboard',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch dashboard stats',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/dashboard',
      };
    }
  }

  /**
   * Статистика за период (для графиков)
   */
  @Get('dashboard/chart')
  async getDashboardChart(
    @Query('days') days = 30,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getDashboardChartData(Number(days));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/dashboard/chart',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch chart data',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/dashboard/chart',
      };
    }
  }

  /**
   * Список пользователей с фильтрацией и пагинацией
   */
  @Get('users')
  async getUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getUsers({
        page: Number(page),
        limit: Number(limit),
        search,
        role,
        sortBy,
        sortOrder,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/users',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch users',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/users',
      };
    }
  }

  /**
   * Получить конкретного пользователя с полной информацией
   */
  @Get('users/:id')
  async getUser(@Param('id') userId: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getUserById(userId);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch user',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}`,
      };
    }
  }

  /**
   * Последние действия (активность)
   */
  @Get('activity')
  async getRecentActivity(
    @Query('limit') limit = 50,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getRecentActivity(Number(limit));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/activity',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch recent activity',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/activity',
      };
    }
  }

  /**
   * Заблокировать пользователя
   */
  @Post('users/:id/ban')
  async banUser(
    @Param('id') userId: string,
    @Body() body: { reason?: string; duration?: number },
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.banUser(
        userId,
        req.user.userId,
        body.reason,
        body.duration,
      );

      return {
        success: true,
        data,
        message: 'User banned successfully',
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}/ban`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to ban user',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}/ban`,
        method: 'POST',
      };
    }
  }

  /**
   * Разблокировать пользователя
   */
  @Post('users/:id/unban')
  async unbanUser(
    @Param('id') userId: string,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.unbanUser(userId, req.user.userId);

      return {
        success: true,
        data,
        message: 'User unbanned successfully',
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}/unban`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to unban user',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}/unban`,
        method: 'POST',
      };
    }
  }

  /**
   * Изменить роль пользователя
   */
  @Put('users/:id/role')
  async changeUserRole(
    @Param('id') userId: string,
    @Body() body: { role: string },
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.changeUserRole(
        userId,
        body.role,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: 'User role changed successfully',
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}/role`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to change user role',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}/role`,
        method: 'PUT',
      };
    }
  }

  /**
   * Список тайтлов для админки (все / только неопубликованные / только опубликованные)
   */
  @Get('titles')
  async getTitles(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('isPublished') isPublished?: string,
    @Query('sortBy') sortBy = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<ApiResponseDto<any>> {
    try {
      const isPublishedFilter =
        isPublished === 'true' ? true : isPublished === 'false' ? false : undefined;

      const data = await this.adminService.getTitles({
        page: Number(page),
        limit: Number(limit),
        isPublished: isPublishedFilter,
        sortBy,
        sortOrder,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/titles',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch titles',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/titles',
      };
    }
  }

  /**
   * Массовое удаление тайтлов
   */
  @Post('titles/bulk-delete')
  async bulkDeleteTitles(
    @Body() body: { ids: string[] },
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.bulkDeleteTitles(
        body.ids,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: `Deleted ${data.deletedCount} titles`,
        timestamp: new Date().toISOString(),
        path: 'admin/titles/bulk-delete',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete titles',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/titles/bulk-delete',
        method: 'POST',
      };
    }
  }

  /**
   * Массовое обновление тайтлов (статус, тип, жанры)
   */
  @Put('titles/bulk-update')
  async bulkUpdateTitles(
    @Body() body: { ids: string[]; update: Record<string, any> },
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.bulkUpdateTitles(
        body.ids,
        body.update,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: `Updated ${data.modifiedCount} titles`,
        timestamp: new Date().toISOString(),
        path: 'admin/titles/bulk-update',
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update titles',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/titles/bulk-update',
        method: 'PUT',
      };
    }
  }

  /**
   * Статистика комментариев
   */
  @Get('comments/stats')
  async getCommentsStats(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getCommentsStats();

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/comments/stats',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch comments stats',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/comments/stats',
      };
    }
  }

  /**
   * Список комментариев для модерации
   */
  @Get('comments')
  async getComments(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('entityType') entityType?: string,
    @Query('isVisible') isVisible?: string,
    @Query('userId') userId?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const isVisibleBool =
        isVisible === 'true'
          ? true
          : isVisible === 'false'
            ? false
            : undefined;

      const data = await this.adminService.getComments({
        page: Number(page),
        limit: Number(limit),
        entityType,
        isVisible: isVisibleBool,
        userId,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/comments',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch comments',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/comments',
      };
    }
  }

  /**
   * Скрыть/показать комментарий
   */
  @Put('comments/:id/visibility')
  async toggleCommentVisibility(
    @Param('id') commentId: string,
    @Body() body: { isVisible: boolean },
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.toggleCommentVisibility(
        commentId,
        body.isVisible,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: `Comment ${body.isVisible ? 'shown' : 'hidden'} successfully`,
        timestamp: new Date().toISOString(),
        path: `admin/comments/${commentId}/visibility`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update comment visibility',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `admin/comments/${commentId}/visibility`,
        method: 'PUT',
      };
    }
  }

  /**
   * Удалить комментарий
   */
  @Delete('comments/:id')
  async deleteComment(
    @Param('id') commentId: string,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      await this.adminService.deleteComment(commentId, req.user.userId);

      return {
        success: true,
        message: 'Comment deleted successfully',
        timestamp: new Date().toISOString(),
        path: `admin/comments/${commentId}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete comment',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `admin/comments/${commentId}`,
        method: 'DELETE',
      };
    }
  }

  /**
   * Массовое удаление комментариев
   */
  @Post('comments/bulk-delete')
  async bulkDeleteComments(
    @Body() body: { ids: string[] },
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.bulkDeleteComments(
        body.ids,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: `Deleted ${data.deletedCount} comments`,
        timestamp: new Date().toISOString(),
        path: 'admin/comments/bulk-delete',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete comments',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/comments/bulk-delete',
        method: 'POST',
      };
    }
  }

  /**
   * Удалить комментарии пользователя
   */
  @Delete('users/:id/comments')
  async deleteUserComments(
    @Param('id') userId: string,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.deleteUserComments(
        userId,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: `Deleted ${data.deletedCount} comments`,
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}/comments`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete user comments',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `admin/users/${userId}/comments`,
        method: 'DELETE',
      };
    }
  }

  /**
   * Лог действий администраторов
   */
  @Get('logs')
  async getAdminLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getAdminLogs({
        page: Number(page),
        limit: Number(limit),
        action,
        adminId,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/logs',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch admin logs',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/logs',
      };
    }
  }

  /**
   * Экспорт пользователей в CSV
   */
  @Get('export/users')
  @Header('Content-Type', 'text/csv')
  async exportUsers(
    @Res() res: Response,
    @Query('format') format: 'csv' | 'json' = 'csv',
  ): Promise<void> {
    try {
      const data = await this.adminService.exportUsers(format);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="users_${Date.now()}.json"`,
        );
        res.send(JSON.stringify(data, null, 2));
      } else {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="users_${Date.now()}.csv"`,
        );
        res.send(data);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to export users',
        errors: [(error as Error).message],
      });
    }
  }

  /**
   * Экспорт тайтлов в CSV/JSON
   */
  @Get('export/titles')
  async exportTitles(
    @Res() res: Response,
    @Query('format') format: 'csv' | 'json' = 'csv',
  ): Promise<void> {
    try {
      const data = await this.adminService.exportTitles(format);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="titles_${Date.now()}.json"`,
        );
        res.send(JSON.stringify(data, null, 2));
      } else {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="titles_${Date.now()}.csv"`,
        );
        res.send(data);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to export titles',
        errors: [(error as Error).message],
      });
    }
  }

  /**
   * Health check для админки (status, uptime, memory, db, cache)
   */
  @Get('health')
  async getHealth(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getSystemHealth();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/health',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch system health',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/health',
      };
    }
  }

  /**
   * Системная информация (версия, uptime, память)
   */
  @Get('system')
  async getSystemInfo(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.getSystemInfo();

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'admin/system',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch system info',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/system',
      };
    }
  }

  /**
   * Очистка кэша
   */
  @Post('cache/clear')
  async clearCache(
    @Body() body: { keys?: string[] },
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.adminService.clearCache(
        body.keys,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString(),
        path: 'admin/cache/clear',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to clear cache',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'admin/cache/clear',
        method: 'POST',
      };
    }
  }
}
