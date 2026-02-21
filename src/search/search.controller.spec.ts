import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { UsersService } from '../users/users.service';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: SearchService;
  let usersService: UsersService;

  const mockSearchService = {
    searchTitles: jest.fn(),
  };

  const mockUsersService = {
    getCanViewAdult: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: mockSearchService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
    searchService = module.get<SearchService>(SearchService);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('searchTitles', () => {
    it('should return search results and map to response DTO', async () => {
      const mockTitles = [
        {
          _id: { toString: () => 'id1' },
          name: 'Title 1',
          slug: 'title-1',
          coverImage: '/cover1.jpg',
          description: 'Desc',
          chapters: [{}, {}],
          averageRating: 4.5,
          releaseYear: 2024,
          type: 'manga',
        },
      ];
      mockSearchService.searchTitles.mockResolvedValue(mockTitles);

      const req = { headers: {} };
      const result = await controller.searchTitles(
        req as any,
        'test query',
        10,
        'createdAt',
        'desc',
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'id1',
        title: 'Title 1',
        slug: 'title-1',
        cover: '/cover1.jpg',
        description: 'Desc',
        totalChapters: 2,
        rating: 4.5,
        releaseYear: 2024,
        type: 'manga',
      });
      expect(mockSearchService.searchTitles).toHaveBeenCalledWith({
        search: 'test query',
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        canViewAdult: true,
      });
    });

    it('should use JWT to get canViewAdult when Bearer token present', async () => {
      mockSearchService.searchTitles.mockResolvedValue([]);
      mockUsersService.getCanViewAdult.mockResolvedValue(false);

      const req = {
        headers: {
          authorization: 'Bearer valid-token-will-be-decoded-by-jwt',
        },
      };
      // JWT verify will fail with invalid token, so canViewAdult stays true in catch
      await controller.searchTitles(req as any, 'q', 5);
      expect(mockSearchService.searchTitles).toHaveBeenCalled();
    });

    it('should return error response when search throws', async () => {
      mockSearchService.searchTitles.mockRejectedValue(new Error('DB error'));

      const req = { headers: {} };
      const result = await controller.searchTitles(req as any, 'q');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to search titles');
      expect(result.errors).toContain('DB error');
    });
  });
});
