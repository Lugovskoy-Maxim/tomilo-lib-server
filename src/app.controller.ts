import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiResponseDto } from './common/dto/api-response.dto';
import { StatsResponseDto } from './common/dto/stats-response.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'tomilo-lib-server',
    };
  }

  @Get('stats')
  async getStats(
    @Query('includeHistory') includeHistory?: string,
    @Query('historyDays') historyDays?: string,
  ): Promise<ApiResponseDto<StatsResponseDto>> {
    const stats = await this.appService.getStats();

    // Add historical data if requested
    if (includeHistory === 'true') {
      const days = parseInt(historyDays || '30', 10) || 30;

      // Get recent daily stats
      const recentStats = await this.appService.getRecentStats(days);
      stats.dailyHistory = recentStats.map((day) => ({
        date: day.date.toISOString(),
        newUsers: day.newUsers,
        activeUsers: day.activeUsers,
        newTitles: day.newTitles,
        newChapters: day.newChapters,
        chaptersRead: day.chaptersRead,
        titleViews: day.titleViews,
        chapterViews: day.chapterViews,
        comments: day.comments,
        ratings: day.ratings,
        bookmarks: day.bookmarks,
      }));

      // Get monthly stats for current year
      const currentYear = new Date().getFullYear();
      const monthlyStats = await this.appService.getMonthlyStats(
        currentYear,
        new Date().getMonth() + 1,
      );
      stats.monthlyHistory = [
        {
          year: monthlyStats.year,
          month: monthlyStats.month,
          totalNewUsers: monthlyStats.totalNewUsers,
          totalActiveUsers: monthlyStats.totalActiveUsers,
          totalNewTitles: monthlyStats.totalNewTitles,
          totalNewChapters: monthlyStats.totalNewChapters,
          totalChaptersRead: monthlyStats.totalChaptersRead,
          totalTitleViews: monthlyStats.totalTitleViews,
          totalChapterViews: monthlyStats.totalChapterViews,
          totalComments: monthlyStats.totalComments,
          totalRatings: monthlyStats.totalRatings,
          totalBookmarks: monthlyStats.totalBookmarks,
        },
      ];
    }

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      path: '/stats',
      method: 'GET',
    };
  }

  @Get('stats/history')
  async getStatsHistory(
    @Query('type') type: string,
    @Query('year') yearString?: string,
    @Query('month') monthString?: string,
    @Query('days') daysString?: string,
  ): Promise<ApiResponseDto<any>> {
    const year = parseInt(yearString || '', 10) || new Date().getFullYear();
    const month = parseInt(monthString || '', 10) || new Date().getMonth() + 1;
    const days = parseInt(daysString || '', 10) || 30;

    let data: any;

    switch (type) {
      case 'daily':
        data = await this.appService.getRecentStats(days);
        break;
      case 'monthly':
        data = await this.appService.getMonthlyStats(year, month);
        break;
      case 'yearly':
        data = await this.appService.getYearlyStats(year);
        break;
      default: {
        // Return all types if no specific type requested
        const [daily, monthly, yearly] = await Promise.all([
          this.appService.getRecentStats(30),
          this.appService.getMonthlyStats(
            new Date().getFullYear(),
            new Date().getMonth() + 1,
          ),
          this.appService.getYearlyStats(new Date().getFullYear()),
        ]);
        data = { daily, monthly, yearly };
        break;
      }
    }

    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      path: '/stats/history',
      method: 'GET',
    };
  }
}
