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
      try {
        const days = parseInt(historyDays || '30', 10) || 30;

        // Get recent daily stats (only recorded days; may be empty)
        const recentStats = await this.appService.getRecentStats(days);
        stats.dailyHistory = recentStats.map((day) => ({
          date:
            day.date instanceof Date
              ? day.date.toISOString()
              : new Date(day.date as unknown as string).toISOString(),
          newUsers: day.newUsers ?? 0,
          activeUsers: day.activeUsers ?? 0,
          newTitles: day.newTitles ?? 0,
          newChapters: day.newChapters ?? 0,
          chaptersRead: day.chaptersRead ?? 0,
          titleViews: day.titleViews ?? 0,
          chapterViews: day.chapterViews ?? 0,
          comments: day.comments ?? 0,
          ratings: day.ratings ?? 0,
          bookmarks: day.bookmarks ?? 0,
        }));

        // Get monthly stats for current year
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const monthlyStats = await this.appService.getMonthlyStats(
          currentYear,
          currentMonth,
        );
        stats.monthlyHistory = [
          {
            year: monthlyStats.year,
            month: monthlyStats.month,
            totalNewUsers: monthlyStats.totalNewUsers ?? 0,
            totalActiveUsers: monthlyStats.totalActiveUsers ?? 0,
            totalNewTitles: monthlyStats.totalNewTitles ?? 0,
            totalNewChapters: monthlyStats.totalNewChapters ?? 0,
            totalChaptersRead: monthlyStats.totalChaptersRead ?? 0,
            totalTitleViews: monthlyStats.totalTitleViews ?? 0,
            totalChapterViews: monthlyStats.totalChapterViews ?? 0,
            totalComments: monthlyStats.totalComments ?? 0,
            totalRatings: monthlyStats.totalRatings ?? 0,
            totalBookmarks: monthlyStats.totalBookmarks ?? 0,
          },
        ];
      } catch (err) {
        // Return main stats even if history fails (e.g. no recorded daily stats yet)
        stats.dailyHistory = [];
        stats.monthlyHistory = [];
      }
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
    try {
      const year =
        parseInt(yearString || '', 10) || new Date().getFullYear();
      const month =
        parseInt(monthString || '', 10) || new Date().getMonth() + 1;
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
    } catch (err) {
      return {
        success: false,
        message: 'Failed to fetch stats history',
        errors: [err instanceof Error ? err.message : String(err)],
        timestamp: new Date().toISOString(),
        path: '/stats/history',
        method: 'GET',
      };
    }
  }
}
