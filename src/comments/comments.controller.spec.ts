import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentEntityType } from '../schemas/comment.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';

describe('CommentsController', () => {
  let controller: CommentsController;
  let commentsService: CommentsService;

  const mockCommentsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    toggleReaction: jest.fn(),
    getReactionsCount: jest.fn(),
  };

  const mockUser = { userId: 'user-123', role: 'user' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: mockCommentsService }],
    }).compile();

    controller = module.get<CommentsController>(CommentsController);
    commentsService = module.get<CommentsService>(CommentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create comment and return success', async () => {
      const dto: CreateCommentDto = {
        entityType: CommentEntityType.TITLE,
        entityId: new Types.ObjectId().toString(),
        content: 'Hello',
      };
      const created = { _id: new Types.ObjectId(), ...dto };
      mockCommentsService.create.mockResolvedValue(created);

      const req = { user: mockUser };
      const result = await controller.create(dto, req as any);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(created);
      expect(mockCommentsService.create).toHaveBeenCalledWith(
        dto,
        'user-123',
      );
    });

    it('should return error on service throw', async () => {
      mockCommentsService.create.mockRejectedValue(new Error('err'));
      const req = { user: mockUser };
      const result = await controller.create(
        { entityType: CommentEntityType.TITLE, entityId: new Types.ObjectId().toString(), content: 'x' } as CreateCommentDto,
        req as any,
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to create comment');
    });
  });

  describe('findAll', () => {
    it('should return comments for entity', async () => {
      const data = { items: [], total: 0 };
      mockCommentsService.findAll.mockResolvedValue(data);
      const entityId = new Types.ObjectId().toString();

      const result = await controller.findAll(
        CommentEntityType.TITLE,
        entityId,
        1,
        20,
        false,
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(mockCommentsService.findAll).toHaveBeenCalledWith(
        CommentEntityType.TITLE,
        entityId,
        1,
        20,
        false,
      );
    });

    it('should accept entityId "all"', async () => {
      mockCommentsService.findAll.mockResolvedValue({});
      const result = await controller.findAll(
        CommentEntityType.CHAPTER,
        'all',
        1,
        10,
        'true',
      );
      expect(result.success).toBe(true);
      expect(mockCommentsService.findAll).toHaveBeenCalledWith(
        CommentEntityType.CHAPTER,
        'all',
        1,
        10,
        true,
      );
    });

    it('should return error response for invalid entityType', async () => {
      const entityId = new Types.ObjectId().toString();
      const result = await controller.findAll(
        'invalid' as CommentEntityType,
        entityId,
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to fetch comments');
      expect(result.errors).toContain('Invalid entity type');
      expect(mockCommentsService.findAll).not.toHaveBeenCalled();
    });

    it('should return error response for invalid entityId', async () => {
      const result = await controller.findAll(
        CommentEntityType.TITLE,
        'not-valid-id',
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to fetch comments');
      expect(result.errors).toContain('Invalid entity ID');
      expect(mockCommentsService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('getReactionEmojis', () => {
    it('should return allowed emojis', async () => {
      const result = await controller.getReactionEmojis();
      expect(result.success).toBe(true);
      expect(result.data.emojis).toBeDefined();
      expect(Array.isArray(result.data.emojis)).toBe(true);
      expect(result.data.emojis).toContain('👍');
    });
  });

  describe('findOne', () => {
    it('should return comment by id', async () => {
      const id = new Types.ObjectId().toString();
      const data = { _id: id, content: 'Hi' };
      mockCommentsService.findOne.mockResolvedValue(data);

      const result = await controller.findOne(id);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(mockCommentsService.findOne).toHaveBeenCalledWith(id);
    });

    it('should return error on service throw', async () => {
      mockCommentsService.findOne.mockRejectedValue(new Error('Not found'));
      const result = await controller.findOne(new Types.ObjectId().toString());
      expect(result.success).toBe(false);
    });
  });

  describe('update', () => {
    it('should update comment', async () => {
      const id = new Types.ObjectId().toString();
      const dto: UpdateCommentDto = { content: 'Updated' };
      mockCommentsService.update.mockResolvedValue({});

      const req = { user: mockUser };
      const result = await controller.update(id, dto, req as any);
      expect(result.success).toBe(true);
      expect(mockCommentsService.update).toHaveBeenCalledWith(
        id,
        dto,
        'user-123',
      );
    });
  });

  describe('remove', () => {
    it('should remove comment', async () => {
      const id = new Types.ObjectId().toString();
      mockCommentsService.remove.mockResolvedValue(undefined);

      const req = { user: mockUser };
      const result = await controller.remove(id, req as any);
      expect(result.success).toBe(true);
      expect(mockCommentsService.remove).toHaveBeenCalledWith(
        id,
        'user-123',
        'user',
      );
    });
  });

  describe('toggleReaction', () => {
    it('should toggle reaction', async () => {
      const id = new Types.ObjectId().toString();
      const dto: ToggleReactionDto = { emoji: '👍' };
      mockCommentsService.toggleReaction.mockResolvedValue({});

      const req = { user: mockUser };
      const result = await controller.toggleReaction(id, dto, req as any);
      expect(result.success).toBe(true);
      expect(mockCommentsService.toggleReaction).toHaveBeenCalledWith(
        id,
        'user-123',
        '👍',
      );
    });
  });

  describe('likeComment', () => {
    it('should like comment (emoji 👍)', async () => {
      const id = new Types.ObjectId().toString();
      mockCommentsService.toggleReaction.mockResolvedValue({});

      const req = { user: mockUser };
      const result = await controller.likeComment(id, req as any);
      expect(result.success).toBe(true);
      expect(mockCommentsService.toggleReaction).toHaveBeenCalledWith(
        id,
        'user-123',
        '👍',
      );
    });
  });

  describe('dislikeComment', () => {
    it('should dislike comment (emoji 👎)', async () => {
      const id = new Types.ObjectId().toString();
      mockCommentsService.toggleReaction.mockResolvedValue({});

      const req = { user: mockUser };
      const result = await controller.dislikeComment(id, req as any);
      expect(result.success).toBe(true);
      expect(mockCommentsService.toggleReaction).toHaveBeenCalledWith(
        id,
        'user-123',
        '👎',
      );
    });
  });

  describe('getReactionsCount', () => {
    it('should return reactions count', async () => {
      const id = new Types.ObjectId().toString();
      const data = { '👍': 5, '❤️': 2 };
      mockCommentsService.getReactionsCount.mockResolvedValue(data);

      const result = await controller.getReactionsCount(id);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(mockCommentsService.getReactionsCount).toHaveBeenCalledWith(id);
    });
  });
});
