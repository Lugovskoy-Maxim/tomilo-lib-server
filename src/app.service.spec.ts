import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AppService } from './app.service';
import { StatsService } from './stats/stats.service';
import { Title } from './schemas/title.schema';
import { Chapter } from './schemas/chapter.schema';
import { User } from './schemas/user.schema';
import { Collection } from './schemas/collection.schema';

const mockAggregate = jest.fn().mockResolvedValue([]);
const mockCountDocuments = jest.fn().mockResolvedValue(0);
const mockFind = jest.fn().mockReturnValue({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([]),
});

const mockModel = () => ({
  countDocuments: mockCountDocuments,
  aggregate: mockAggregate,
  find: mockFind,
});

const mockCacheManager = {
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
};

const mockStatsService = {
  getRecentDailyStats: jest.fn().mockResolvedValue([]),
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
};

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAggregate.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);
    mockCacheManager.get.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: getModelToken(Title.name), useFactory: mockModel },
        { provide: getModelToken(Chapter.name), useFactory: mockModel },
        { provide: getModelToken(User.name), useFactory: mockModel },
        { provide: getModelToken(Collection.name), useFactory: mockModel },
        { provide: StatsService, useValue: mockStatsService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHello', () => {
    it('should return "Hello World!"', () => {
      expect(service.getHello()).toBe('Hello World!');
    });
  });

  describe('getStats', () => {
    it('should return stats from cache when available', async () => {
      const cachedStats = {
        totalTitles: 5,
        totalChapters: 50,
        totalUsers: 10,
        totalCollections: 2,
        totalViews: 1000,
        totalBookmarks: 20,
        daily: { views: 0, newUsers: 0, newTitles: 0, newChapters: 0, chaptersRead: 0 },
        weekly: { views: 0, newUsers: 0, newTitles: 0, newChapters: 0, chaptersRead: 0 },
        monthly: { views: 0, newUsers: 0, newTitles: 0, newChapters: 0, chaptersRead: 0 },
        popularTitles: [],
        popularChapters: [],
        activeUsersToday: 0,
        newUsersThisMonth: 0,
        totalRatings: 0,
        averageRating: 0,
        ongoingTitles: 0,
        completedTitles: 0,
        staleOngoingTitles: 0,
      };
      mockCacheManager.get.mockResolvedValueOnce(cachedStats);

      const result = await service.getStats();
      expect(result).toEqual(cachedStats);
      expect(mockCacheManager.get).toHaveBeenCalledWith('stats');
      expect(mockCountDocuments).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache when cache is empty', async () => {
      mockCountDocuments.mockResolvedValue(0);
      mockAggregate.mockResolvedValue([]);

      const result = await service.getStats();
      expect(result.totalTitles).toBe(0);
      expect(result.totalChapters).toBe(0);
      expect(result.totalUsers).toBe(0);
      expect(result.totalCollections).toBe(0);
      expect(result.daily).toBeDefined();
      expect(result.weekly).toBeDefined();
      expect(result.monthly).toBeDefined();
      expect(result.popularTitles).toEqual([]);
      expect(result.popularChapters).toEqual([]);
      expect(mockCacheManager.set).toHaveBeenCalledWith('stats', result);
    });
  });

  describe('getRecentStats', () => {
    it('should return cached data when available', async () => {
      const cached = [{ date: new Date(), newUsers: 1 }];
      mockCacheManager.get.mockResolvedValueOnce(cached);

      const result = await service.getRecentStats(30);
      expect(result).toEqual(cached);
      expect(mockStatsService.getRecentDailyStats).not.toHaveBeenCalled();
    });

    it('should call StatsService and cache when cache is empty', async () => {
      const data = [{ date: new Date(), newUsers: 2 }];
      mockStatsService.getRecentDailyStats.mockResolvedValueOnce(data);

      const result = await service.getRecentStats(7);
      expect(result).toEqual(data);
      expect(mockStatsService.getRecentDailyStats).toHaveBeenCalledWith(7);
      expect(mockCacheManager.set).toHaveBeenCalledWith('stats:recent:7', data);
    });
  });

  describe('getMonthlyStats', () => {
    it('should return cached data when available', async () => {
      const cached = { year: 2025, month: 2, totalNewUsers: 10 };
      mockCacheManager.get.mockResolvedValueOnce(cached);

      const result = await service.getMonthlyStats(2025, 2);
      expect(result).toEqual(cached);
      expect(mockStatsService.getMonthlyStats).not.toHaveBeenCalled();
    });

    it('should call StatsService and cache when cache is empty', async () => {
      const data = { year: 2025, month: 3, totalNewUsers: 5 };
      mockStatsService.getMonthlyStats.mockResolvedValueOnce(data);

      const result = await service.getMonthlyStats(2025, 3);
      expect(result).toEqual(data);
      expect(mockStatsService.getMonthlyStats).toHaveBeenCalledWith(2025, 3);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'stats:monthly:2025:3',
        data,
      );
    });
  });

  describe('getYearlyStats', () => {
    it('should return cached data when available', async () => {
      const cached = { year: 2025, totalNewUsers: 100 };
      mockCacheManager.get.mockResolvedValueOnce(cached);

      const result = await service.getYearlyStats(2025);
      expect(result).toEqual(cached);
      expect(mockStatsService.getYearlyStats).not.toHaveBeenCalled();
    });

    it('should call StatsService and cache when cache is empty', async () => {
      const data = { year: 2024, totalNewUsers: 50 };
      mockStatsService.getYearlyStats.mockResolvedValueOnce(data);

      const result = await service.getYearlyStats(2024);
      expect(result).toEqual(data);
      expect(mockStatsService.getYearlyStats).toHaveBeenCalledWith(2024);
      expect(mockCacheManager.set).toHaveBeenCalledWith('stats:yearly:2024', data);
    });
  });
});
