import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('titles')
  @UseGuards(JwtAuthGuard)
  async getMyTitleSubscriptions(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<any>> {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(
      100,
      Math.max(1, parseInt(String(limit), 10) || 20),
    );
    const data = await this.subscriptionsService.getMyTitleSubscriptions(
      req.user.userId,
      pageNum,
      limitNum,
    );
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: 'subscriptions/titles',
      method: 'GET',
    };
  }

  @Get('titles/:titleId/check')
  @UseGuards(JwtAuthGuard)
  async checkTitleSubscription(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<{ isSubscribed: boolean; subscription?: any }>> {
    const data = await this.subscriptionsService.checkTitleSubscription(
      req.user.userId,
      titleId,
    );
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: `subscriptions/titles/${titleId}/check`,
      method: 'GET',
    };
  }

  @Get('titles/:titleId/count')
  @HttpCode(HttpStatus.OK)
  async getTitleSubscribersCount(
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<{ count: number }>> {
    const count =
      await this.subscriptionsService.getTitleSubscribersCount(titleId);
    return {
      success: true,
      data: { count },
      timestamp: new Date().toISOString(),
      path: `subscriptions/titles/${titleId}/count`,
      method: 'GET',
    };
  }

  @Post('titles')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async subscribeToTitle(
    @Request() req,
    @Body()
    body: {
      titleId: string;
      notifyOnNewChapter?: boolean;
      notifyOnAnnouncement?: boolean;
    },
  ): Promise<ApiResponseDto<any>> {
    const { titleId, notifyOnNewChapter, notifyOnAnnouncement } = body;
    if (!titleId) {
      return {
        success: false,
        message: 'titleId is required',
        errors: ['titleId is required'],
        timestamp: new Date().toISOString(),
        path: 'subscriptions/titles',
        method: 'POST',
      };
    }
    const data = await this.subscriptionsService.subscribeToTitle(
      req.user.userId,
      titleId,
      { notifyOnNewChapter, notifyOnAnnouncement },
    );
    return {
      success: true,
      data,
      message: 'Subscribed successfully',
      timestamp: new Date().toISOString(),
      path: 'subscriptions/titles',
      method: 'POST',
    };
  }

  @Delete('titles/:titleId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async unsubscribeFromTitle(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<void>> {
    await this.subscriptionsService.unsubscribeFromTitle(
      req.user.userId,
      titleId,
    );
    return {
      success: true,
      timestamp: new Date().toISOString(),
      path: `subscriptions/titles/${titleId}`,
      method: 'DELETE',
    };
  }

  @Patch('titles/:titleId')
  @UseGuards(JwtAuthGuard)
  async updateTitleSubscription(
    @Request() req,
    @Param('titleId') titleId: string,
    @Body()
    body: { notifyOnNewChapter?: boolean; notifyOnAnnouncement?: boolean },
  ): Promise<ApiResponseDto<any>> {
    const data = await this.subscriptionsService.updateTitleSubscription(
      req.user.userId,
      titleId,
      body,
    );
    return {
      success: true,
      data,
      message: 'Subscription updated',
      timestamp: new Date().toISOString(),
      path: `subscriptions/titles/${titleId}`,
      method: 'PATCH',
    };
  }
}
