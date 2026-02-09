import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

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
   * Записать статистику за сегодня (ручной запуск)
   */
  @Get('record')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async recordTodayStats(): Promise<ApiResponseDto<any>> {
    const stats = await this.statsService.recordDailyStats();

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats/record',
      method: 'GET',
    };
  }
}
