import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StatsResponseDto } from './common/dto/stats-response.dto';

const mockStats: StatsResponseDto = {
  totalTitles: 10,
  totalChapters: 100,
  totalUsers: 50,
  totalCollections: 20,
  totalViews: 5000,
  totalBookmarks: 200,
  daily: {
    views: 100,
    newUsers: 2,
    newTitles: 0,
    newChapters: 3,
    chaptersRead: 50,
  },
  weekly: {
    views: 500,
    newUsers: 5,
    newTitles: 1,
    newChapters: 10,
    chaptersRead: 200,
  },
  monthly: {
    views: 2000,
    newUsers: 15,
    newTitles: 2,
    newChapters: 30,
    chaptersRead: 800,
  },
  popularTitles: [],
  popularChapters: [],
  activeUsersToday: 5,
  newUsersThisMonth: 15,
  totalRatings: 100,
  averageRating: 4.5,
  ongoingTitles: 8,
  completedTitles: 2,
  staleOngoingTitles: 1,
};

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHello: jest.fn().mockReturnValue('Hello World!'),
            getStats: jest.fn().mockResolvedValue(mockStats),
            getRecentStats: jest.fn().mockResolvedValue([]),
            getMonthlyStats: jest.fn().mockResolvedValue({
              year: new Date().getFullYear(),
              month: new Date().getMonth() + 1,
              totalNewUsers: 0,
              totalActiveUsers: 0,
              totalNewTitles: 0,
              totalNewChapters: 0,
              totalChaptersRead: 0,
              totalTitleViews: 0,
              totalChapterViews: 0,
              totalComments: 0,
              totalRatings: 0,
              totalBookmarks: 0,
            }),
            getYearlyStats: jest.fn().mockResolvedValue({
              year: new Date().getFullYear(),
              totalNewUsers: 0,
              totalActiveUsers: 0,
              totalNewTitles: 0,
              totalNewChapters: 0,
              totalChaptersRead: 0,
              totalTitleViews: 0,
              totalChapterViews: 0,
              totalComments: 0,
              totalRatings: 0,
              totalBookmarks: 0,
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
      expect(appService.getHello).toHaveBeenCalled();
    });
  });

  describe('health', () => {
    it('should return status ok and service name', () => {
      const result = appController.healthCheck();
      expect(result).toMatchObject({
        status: 'ok',
        service: 'tomilo-lib-server',
      });
      expect(result.timestamp).toBeDefined();
      expect(typeof result.uptime).toBe('number');
    });
  });

  describe('getStats', () => {
    it('should return stats without history when includeHistory is not true', async () => {
      const result = await appController.getStats();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStats);
      expect(result.data?.dailyHistory).toBeUndefined();
      expect(result.data?.monthlyHistory).toBeUndefined();
      expect(appService.getStats).toHaveBeenCalled();
      expect(appService.getRecentStats).not.toHaveBeenCalled();
    });

    it('should return stats with daily and monthly history when includeHistory=true', async () => {
      const dailyRecord = {
        date: new Date(),
        newUsers: 1,
        activeUsers: 2,
        newTitles: 0,
        newChapters: 1,
        chaptersRead: 10,
        titleViews: 50,
        chapterViews: 30,
        comments: 0,
        ratings: 0,
        bookmarks: 0,
      };
      (appService.getRecentStats as jest.Mock).mockResolvedValue([dailyRecord]);
      (appService.getMonthlyStats as jest.Mock).mockResolvedValue({
        year: 2025,
        month: 2,
        totalNewUsers: 5,
        totalActiveUsers: 10,
        totalNewTitles: 1,
        totalNewChapters: 5,
        totalChaptersRead: 100,
        totalTitleViews: 500,
        totalChapterViews: 300,
        totalComments: 2,
        totalRatings: 10,
        totalBookmarks: 20,
      });

      const result = await appController.getStats('true', '7');
      expect(result.success).toBe(true);
      expect(result.data?.dailyHistory).toHaveLength(1);
      expect(result.data?.monthlyHistory).toHaveLength(1);
      expect(appService.getRecentStats).toHaveBeenCalledWith(7);
    });

    it('should use default 30 days for history when historyDays is not provided', async () => {
      (appService.getRecentStats as jest.Mock).mockResolvedValue([]);
      await appController.getStats('true');
      expect(appService.getRecentStats).toHaveBeenCalledWith(30);
    });
  });

  describe('getStatsHistory', () => {
    it('should return daily history when type=daily', async () => {
      const dailyData = [{ date: new Date(), newUsers: 1 }];
      (appService.getRecentStats as jest.Mock).mockResolvedValue(dailyData);

      const result = await appController.getStatsHistory('daily', undefined, undefined, '14');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(dailyData);
      expect(appService.getRecentStats).toHaveBeenCalledWith(14);
    });

    it('should return monthly history when type=monthly', async () => {
      const monthlyData = { year: 2025, month: 2, totalNewUsers: 5 };
      (appService.getMonthlyStats as jest.Mock).mockResolvedValue(monthlyData);

      const result = await appController.getStatsHistory(
        'monthly',
        '2025',
        '2',
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(monthlyData);
      expect(appService.getMonthlyStats).toHaveBeenCalledWith(2025, 2);
    });

    it('should return yearly history when type=yearly', async () => {
      const yearlyData = { year: 2025, totalNewUsers: 100 };
      (appService.getYearlyStats as jest.Mock).mockResolvedValue(yearlyData);

      const result = await appController.getStatsHistory('yearly', '2025');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(yearlyData);
      expect(appService.getYearlyStats).toHaveBeenCalledWith(2025);
    });

    it('should return all history when type is not specified', async () => {
      (appService.getRecentStats as jest.Mock).mockResolvedValue([]);
      (appService.getMonthlyStats as jest.Mock).mockResolvedValue({});
      (appService.getYearlyStats as jest.Mock).mockResolvedValue({});

      const result = await appController.getStatsHistory('unknown');
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('daily');
      expect(result.data).toHaveProperty('monthly');
      expect(result.data).toHaveProperty('yearly');
    });

    it('should return error response on exception', async () => {
      (appService.getRecentStats as jest.Mock).mockRejectedValue(
        new Error('DB error'),
      );

      const result = await appController.getStatsHistory('daily');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to fetch stats history');
      expect(result.errors).toContain('DB error');
    });
  });
});
