import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe())
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findByUserId(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('isRead') isRead?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user.userId;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const isReadBool =
        isRead === 'true' ? true : isRead === 'false' ? false : undefined;

      const data = await this.notificationsService.findByUserId(userId, {
        page: pageNum,
        limit: limitNum,
        isRead: isReadBool,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'notifications',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch notifications',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'notifications',
      };
    }
  }

  @Get('unread-count')
  async getUnreadCount(
    @Request() req,
    @Query('timeout') timeout: string = '30000',
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user.userId;
      const timeoutMs = parseInt(timeout, 10) || 30000;
      const pollInterval = 1000; // Poll every 1 second

      const initialData =
        await this.notificationsService.getUnreadCount(userId);
      const initialCount = initialData.count;

      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        const currentData =
          await this.notificationsService.getUnreadCount(userId);
        if (currentData.count !== initialCount) {
          return {
            success: true,
            data: currentData,
            timestamp: new Date().toISOString(),
            path: 'notifications/unread-count',
          };
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // Timeout reached, return current count
      return {
        success: true,
        data: initialData,
        timestamp: new Date().toISOString(),
        path: 'notifications/unread-count',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch unread count',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'notifications/unread-count',
      };
    }
  }

  @Post(':id/read')
  async markAsRead(
    @Request() req,
    @Param('id') notificationId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user.userId;
      const data = await this.notificationsService.markAsRead(
        userId,
        notificationId,
      );

      return {
        success: true,
        data,
        message: 'Notification marked as read successfully',
        timestamp: new Date().toISOString(),
        path: `notifications/${notificationId}/read`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to mark notification as read',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `notifications/${notificationId}/read`,
        method: 'POST',
      };
    }
  }

  @Post('mark-all-read')
  async markAllAsRead(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user.userId;
      const data = await this.notificationsService.markAllAsRead(userId);

      return {
        success: true,
        data,
        message: 'All notifications marked as read successfully',
        timestamp: new Date().toISOString(),
        path: 'notifications/mark-all-read',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to mark all notifications as read',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'notifications/mark-all-read',
        method: 'POST',
      };
    }
  }

  @Delete(':id')
  async delete(
    @Request() req,
    @Param('id') notificationId: string,
  ): Promise<ApiResponseDto<void>> {
    try {
      const userId = req.user.userId;
      await this.notificationsService.delete(userId, notificationId);

      return {
        success: true,
        message: 'Notification deleted successfully',
        timestamp: new Date().toISOString(),
        path: `notifications/${notificationId}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete notification',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `notifications/${notificationId}`,
        method: 'DELETE',
      };
    }
  }
}
