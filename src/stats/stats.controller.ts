import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * Обзорная статистика (для главной админки)
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getStats(
    @Query('includeHistory') includeHistory?: string,
    @Query('historyDays') historyDays?: string,
  ): Promise<ApiResponseDto<any>> {
    const stats = await this.statsService.getStats({
      includeHistory: includeHistory === 'true',
      historyDays: historyDays ? parseInt(historyDays, 10) : undefined,
    });
    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats',
      method: 'GET',
    };
  }

  /**
   * История статистики (по дням / месяцам / годам)
   */
  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getStatsHistory(
    @Query('type') type: 'daily' | 'monthly' | 'yearly',
    @Query('days') days?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<ApiResponseDto<{ type: string; data: any[]; total: number }>> {
    const yearNum = year ? parseInt(year, 10) : new Date().getFullYear();
    const monthNum = month ? parseInt(month, 10) : undefined;
    const daysNum = days ? parseInt(days, 10) : 30;
    const result = await this.statsService.getHistory(type, {
      days: type === 'daily' ? daysNum : undefined,
      year: type !== 'daily' ? yearNum : undefined,
      month: type === 'monthly' ? monthNum : undefined,
    });
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      path: '/stats/history',
      method: 'GET',
    };
  }

  /**
   * Получить статистику за конкретный день
   */
  @Get('daily')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getDailyStats(
    @Query('date') dateString?: string,
  ): Promise<ApiResponseDto<any>> {
    const date = dateString ? new Date(dateString) : new Date();
    const stats = await this.statsService.getDailyStats(date);

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats/daily',
      method: 'GET',
    };
  }

  /**
   * Получить статистику за диапазон дат
   */
  @Get('range')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getStatsByRange(
    @Query('start') startDateString: string,
    @Query('end') endDateString: string,
  ): Promise<ApiResponseDto<any>> {
    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);

    const stats = await this.statsService.getStatsByDateRange(
      startDate,
      endDate,
    );

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats/range',
      method: 'GET',
    };
  }

  /**
   * Получить статистику за месяц
   */
  @Get('monthly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getMonthlyStats(
    @Query('year') yearString: string,
    @Query('month') monthString: string,
  ): Promise<ApiResponseDto<any>> {
    const year = parseInt(yearString, 10) || new Date().getFullYear();
    const month = parseInt(monthString, 10) || new Date().getMonth() + 1;

    const stats = await this.statsService.getMonthlyStats(year, month);

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats/monthly',
      method: 'GET',
    };
  }

  /**
   * Получить статистику за год
   */
  @Get('yearly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getYearlyStats(
    @Query('year') yearString: string,
  ): Promise<ApiResponseDto<any>> {
    const year = parseInt(yearString, 10) || new Date().getFullYear();

    const stats = await this.statsService.getYearlyStats(year);

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats/yearly',
      method: 'GET',
    };
  }

  /**
   * Получить последние N дней статистики
   */
  @Get('recent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getRecentStats(
    @Query('days') daysString: string,
  ): Promise<ApiResponseDto<any>> {
    const days = parseInt(daysString, 10) || 30;

    const stats = await this.statsService.getRecentDailyStats(days);

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats/recent',
      method: 'GET',
    };
  }

  /**
   * Получить доступные годы статистики
   */
  @Get('years')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAvailableYears(): Promise<ApiResponseDto<any>> {
    const years = await this.statsService.getAvailableYears();

    return {
      success: true,
      data: years,
      timestamp: new Date().toISOString(),
      path: '/stats/years',
      method: 'GET',
    };
  }

  /**
   * Записать статистику за сегодня (ручной запуск). Поддерживаются GET и POST (клиент шлёт POST).
   */
  @Get('record')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async recordTodayStatsGet(): Promise<ApiResponseDto<any>> {
    const stats = await this.statsService.recordDailyStats();
    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats/record',
      method: 'GET',
    };
  }

  @Post('record')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async recordTodayStatsPost(): Promise<ApiResponseDto<any>> {
    const stats = await this.statsService.recordDailyStats();
    return {
      success: true,
      data: { success: true, message: 'OK', date: new Date().toISOString().split('T')[0], recorded: !!stats },
      timestamp: new Date().toISOString(),
      path: '/stats/record',
      method: 'POST',
    };
  }
}
