import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: NotificationsService;

  const mockNotificationsService = {
    findByUserId: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    delete: jest.fn(),
  };

  const mockUser = { userId: 'user-id-123' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    notificationsService = module.get<NotificationsService>(
      NotificationsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findByUserId', () => {
    it('should return paginated notifications', async () => {
      const data = { items: [], total: 0, page: 1, limit: 20 };
      mockNotificationsService.findByUserId.mockResolvedValue(data);

      const req = { user: mockUser };
      const result = await controller.findByUserId(
        req as any,
        '2',
        '10',
        undefined,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(mockNotificationsService.findByUserId).toHaveBeenCalledWith(
        'user-id-123',
        { page: 2, limit: 10, isRead: undefined },
      );
    });

    it('should pass isRead filter when provided', async () => {
      mockNotificationsService.findByUserId.mockResolvedValue({});
      const req = { user: mockUser };
      await controller.findByUserId(req as any, '1', '20', 'false');
      expect(mockNotificationsService.findByUserId).toHaveBeenCalledWith(
        'user-id-123',
        { page: 1, limit: 20, isRead: false },
      );
    });

    it('should return error on service throw', async () => {
      mockNotificationsService.findByUserId.mockRejectedValue(
        new Error('DB error'),
      );
      const req = { user: mockUser };
      const result = await controller.findByUserId(req as any);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to fetch notifications');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockNotificationsService.getUnreadCount.mockResolvedValue(5);
      const req = { user: mockUser };
      const result = await controller.getUnreadCount(req as any);
      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
      expect(mockNotificationsService.getUnreadCount).toHaveBeenCalledWith(
        'user-id-123',
      );
    });

    it('should return error on service throw', async () => {
      mockNotificationsService.getUnreadCount.mockRejectedValue(
        new Error('err'),
      );
      const req = { user: mockUser };
      const result = await controller.getUnreadCount(req as any);
      expect(result.success).toBe(false);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      mockNotificationsService.markAsRead.mockResolvedValue({});
      const req = { user: mockUser };
      const result = await controller.markAsRead(req as any, 'notif-id');
      expect(result.success).toBe(true);
      expect(result.message).toContain('marked as read');
      expect(mockNotificationsService.markAsRead).toHaveBeenCalledWith(
        'user-id-123',
        'notif-id',
      );
    });

    it('should return error on service throw', async () => {
      mockNotificationsService.markAsRead.mockRejectedValue(new Error('err'));
      const req = { user: mockUser };
      const result = await controller.markAsRead(req as any, 'notif-id');
      expect(result.success).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all as read', async () => {
      mockNotificationsService.markAllAsRead.mockResolvedValue({ count: 3 });
      const req = { user: mockUser };
      const result = await controller.markAllAsRead(req as any);
      expect(result.success).toBe(true);
      expect(mockNotificationsService.markAllAsRead).toHaveBeenCalledWith(
        'user-id-123',
      );
    });
  });

  describe('delete', () => {
    it('should delete notification', async () => {
      mockNotificationsService.delete.mockResolvedValue(undefined);
      const req = { user: mockUser };
      const result = await controller.delete(req as any, 'notif-id');
      expect(result.success).toBe(true);
      expect(mockNotificationsService.delete).toHaveBeenCalledWith(
        'user-id-123',
        'notif-id',
      );
    });

    it('should return error on service throw', async () => {
      mockNotificationsService.delete.mockRejectedValue(new Error('err'));
      const req = { user: mockUser };
      const result = await controller.delete(req as any, 'notif-id');
      expect(result.success).toBe(false);
    });
  });
});
