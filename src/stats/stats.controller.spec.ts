import { Test, TestingModule } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('StatsController', () => {
  let controller: StatsController;

  const mockStatsService = {
    getStats: jest.fn(),
    getHistory: jest.fn(),
    getDailyStats: jest.fn(),
    getStatsByDateRange: jest.fn(),
    getMonthlyStats: jest.fn(),
    getYearlyStats: jest.fn(),
    getRecentDailyStats: jest.fn(),
    getAvailableYears: jest.fn(),
    recordDailyStats: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [{ provide: StatsService, useValue: mockStatsService }],
    }).compile();

    controller = module.get<StatsController>(StatsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStats', () => {
    it('should return stats and call service with options', async () => {
      const statsData = { totalTitles: 10, totalChapters: 100 };
      mockStatsService.getStats.mockResolvedValue(statsData);

      const result = await controller.getStats('true', '7');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(statsData);
      expect(result.path).toBe('/stats');
      expect(mockStatsService.getStats).toHaveBeenCalledWith({
        includeHistory: true,
        historyDays: 7,
      });
    });

    it('should call service without history when includeHistory is not "true"', async () => {
      mockStatsService.getStats.mockResolvedValue({});
      await controller.getStats(undefined, undefined);
      expect(mockStatsService.getStats).toHaveBeenCalledWith({
        includeHistory: false,
        historyDays: undefined,
      });
    });
  });

  describe('getStatsHistory', () => {
    it('should return daily history', async () => {
      const historyData = { type: 'daily', data: [], total: 0 };
      mockStatsService.getHistory.mockResolvedValue(historyData);

      const result = await controller.getStatsHistory(
        'daily',
        '14',
        undefined,
        undefined,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(historyData);
      expect(mockStatsService.getHistory).toHaveBeenCalledWith('daily', {
        days: 14,
        year: undefined,
        month: undefined,
      });
    });

    it('should return monthly history with year and month', async () => {
      const historyData = { type: 'monthly', data: [], total: 0 };
      mockStatsService.getHistory.mockResolvedValue(historyData);

      const result = await controller.getStatsHistory(
        'monthly',
        undefined,
        '2025',
        '3',
      );
      expect(result.success).toBe(true);
      expect(mockStatsService.getHistory).toHaveBeenCalledWith('monthly', {
        days: undefined,
        year: 2025,
        month: 3,
      });
    });

    it('should use default year and days when not provided', async () => {
      mockStatsService.getHistory.mockResolvedValue({});
      await controller.getStatsHistory('daily');
      const year = new Date().getFullYear();
      expect(mockStatsService.getHistory).toHaveBeenCalledWith('daily', {
        days: 30,
        year: undefined,
        month: undefined,
      });
    });
  });

  describe('getDailyStats', () => {
    it('should return stats for given date', async () => {
      const dailyData = { date: '2025-02-22', newUsers: 5 };
      mockStatsService.getDailyStats.mockResolvedValue(dailyData);

      const result = await controller.getDailyStats('2025-02-22');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(dailyData);
      expect(mockStatsService.getDailyStats).toHaveBeenCalledWith(
        new Date('2025-02-22'),
      );
    });

    it('should use current date when date not provided', async () => {
      mockStatsService.getDailyStats.mockResolvedValue(null);
      await controller.getDailyStats(undefined);
      expect(mockStatsService.getDailyStats).toHaveBeenCalled();
      const callArg = mockStatsService.getDailyStats.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Date);
    });
  });

  describe('getStatsByRange', () => {
    it('should return stats for date range', async () => {
      const rangeData = [];
      mockStatsService.getStatsByDateRange.mockResolvedValue(rangeData);

      const result = await controller.getStatsByRange(
        '2025-02-01',
        '2025-02-22',
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(rangeData);
      expect(mockStatsService.getStatsByDateRange).toHaveBeenCalledWith(
        new Date('2025-02-01'),
        new Date('2025-02-22'),
      );
    });
  });

  describe('getMonthlyStats', () => {
    it('should return monthly stats', async () => {
      const monthlyData = { year: 2025, month: 2, totalNewUsers: 10 };
      mockStatsService.getMonthlyStats.mockResolvedValue(monthlyData);

      const result = await controller.getMonthlyStats('2025', '2');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(monthlyData);
      expect(mockStatsService.getMonthlyStats).toHaveBeenCalledWith(2025, 2);
    });
  });

  describe('getYearlyStats', () => {
    it('should return yearly stats', async () => {
      const yearlyData = { year: 2025, totalNewUsers: 100 };
      mockStatsService.getYearlyStats.mockResolvedValue(yearlyData);

      const result = await controller.getYearlyStats('2025');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(yearlyData);
      expect(mockStatsService.getYearlyStats).toHaveBeenCalledWith(2025);
    });
  });

  describe('getRecentStats', () => {
    it('should return recent daily stats', async () => {
      const recentData = [];
      mockStatsService.getRecentDailyStats.mockResolvedValue(recentData);

      const result = await controller.getRecentStats('14');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(recentData);
      expect(mockStatsService.getRecentDailyStats).toHaveBeenCalledWith(14);
    });

    it('should use 30 days when days not provided', async () => {
      mockStatsService.getRecentDailyStats.mockResolvedValue([]);
      await controller.getRecentStats(undefined);
      expect(mockStatsService.getRecentDailyStats).toHaveBeenCalledWith(30);
    });
  });

  describe('getAvailableYears', () => {
    it('should return list of years', async () => {
      const years = [2023, 2024, 2025];
      mockStatsService.getAvailableYears.mockResolvedValue(years);

      const result = await controller.getAvailableYears();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(years);
      expect(mockStatsService.getAvailableYears).toHaveBeenCalled();
    });
  });

  describe('recordTodayStats', () => {
    it('GET record should call recordDailyStats and return result', async () => {
      const recorded = { date: new Date(), newUsers: 1 };
      mockStatsService.recordDailyStats.mockResolvedValue(recorded);

      const result = await controller.recordTodayStatsGet();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(recorded);
      expect(mockStatsService.recordDailyStats).toHaveBeenCalled();
    });

    it('POST record should return success wrapper with recorded flag', async () => {
      const recorded = {};
      mockStatsService.recordDailyStats.mockResolvedValue(recorded);

      const result = await controller.recordTodayStatsPost();
      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.recorded).toBe(true);
      expect(mockStatsService.recordDailyStats).toHaveBeenCalled();
    });
  });
});
