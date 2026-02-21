import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: UsersService;

  const mockUsersService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findProfileById: jest.fn(),
    update: jest.fn(),
    getCanViewAdult: jest.fn(),
  };

  const mockUser = { userId: 'user-123', email: 'u@example.com', roles: ['user'] };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllUsers', () => {
    it('should return paginated users for admin', async () => {
      const data = { items: [], total: 0, page: 1, limit: 10 };
      mockUsersService.findAll.mockResolvedValue(data);

      const result = await controller.getAllUsers(2, 20, 'search');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(mockUsersService.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 20,
        search: 'search',
      });
    });

    it('should return error on service throw', async () => {
      mockUsersService.findAll.mockRejectedValue(new Error('DB error'));
      const result = await controller.getAllUsers(1, 10, '');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to fetch users');
    });
  });

  describe('getUserByIdAdmin', () => {
    it('should return user by id', async () => {
      const id = 'user-id-456';
      const userData = { _id: id, email: 'a@b.com' };
      mockUsersService.findById.mockResolvedValue(userData);

      const result = await controller.getUserByIdAdmin(id);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(userData);
      expect(mockUsersService.findById).toHaveBeenCalledWith(id);
    });

    it('should return error when user not found', async () => {
      mockUsersService.findById.mockRejectedValue(new Error('Not found'));
      const result = await controller.getUserByIdAdmin('id');
      expect(result.success).toBe(false);
      expect(result.message).toBe('User not found');
    });
  });

  describe('getProfile', () => {
    it('should return current user profile', async () => {
      const profile = { userId: 'user-123', email: 'u@example.com', username: 'user' };
      mockUsersService.findProfileById.mockResolvedValue(profile);

      const req = { user: mockUser };
      const result = await controller.getProfile(req as any);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(profile);
      expect(mockUsersService.findProfileById).toHaveBeenCalledWith('user-123');
    });

    it('should return error on service throw', async () => {
      mockUsersService.findProfileById.mockRejectedValue(new Error('err'));
      const req = { user: mockUser };
      const result = await controller.getProfile(req as any);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to fetch profile');
    });
  });

  describe('updateProfile', () => {
    it('should update profile and strip balance/decorations', async () => {
      const dto: UpdateUserDto = {
        username: 'newname',
        balance: 999,
        ownedDecorations: [],
      } as UpdateUserDto & { balance?: number; ownedDecorations?: unknown };
      const updated = { userId: 'user-123', username: 'newname' };
      mockUsersService.update.mockResolvedValue(updated);

      const req = { user: mockUser };
      const result = await controller.updateProfile(req as any, dto);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      const safeUpdate = mockUsersService.update.mock.calls[0][1];
      expect(safeUpdate).not.toHaveProperty('balance');
      expect(safeUpdate).not.toHaveProperty('ownedDecorations');
      expect(safeUpdate).not.toHaveProperty('equippedDecorations');
      expect(mockUsersService.update).toHaveBeenCalledWith('user-123', expect.any(Object));
    });

    it('should return error on service throw', async () => {
      mockUsersService.update.mockRejectedValue(new Error('err'));
      const req = { user: mockUser };
      const result = await controller.updateProfile(req as any, {} as UpdateUserDto);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to update profile');
    });
  });
});
