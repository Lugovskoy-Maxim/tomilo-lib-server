import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

describe('CollectionsController', () => {
  let controller: CollectionsController;
  let collectionsService: CollectionsService;

  const mockCollectionsService = {
    findAll: jest.fn(),
    getTopCollections: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    incrementViews: jest.fn(),
    addTitle: jest.fn(),
    removeTitle: jest.fn(),
    addComment: jest.fn(),
    removeComment: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionsController],
      providers: [
        { provide: CollectionsService, useValue: mockCollectionsService },
      ],
    }).compile();

    controller = module.get<CollectionsController>(CollectionsController);
    collectionsService = module.get<CollectionsService>(CollectionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return result from service', async () => {
      const data = [{ id: '1', name: 'Col1' }];
      mockCollectionsService.findAll.mockResolvedValue(data);

      const result = await controller.findAll('search', 'name', 'asc');
      expect(result).toEqual(data);
      expect(mockCollectionsService.findAll).toHaveBeenCalledWith({
        search: 'search',
        sortBy: 'name',
        sortOrder: 'asc',
      });
    });
  });

  describe('getTopCollections', () => {
    it('should return top collections with success wrapper', () => {
      const data = [{ id: '1', name: 'Top' }];
      mockCollectionsService.getTopCollections.mockReturnValue(data);

      const result = controller.getTopCollections();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(mockCollectionsService.getTopCollections).toHaveBeenCalledWith(10);
    });
  });

  describe('findById', () => {
    it('should return collection by id', async () => {
      const id = new Types.ObjectId().toString();
      const data = { id, name: 'Col' };
      mockCollectionsService.findById.mockResolvedValue(data);

      const result = await controller.findById(id);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(mockCollectionsService.findById).toHaveBeenCalledWith(id);
    });
  });

  describe('create', () => {
    it('should create collection and return success', async () => {
      const dto: CreateCollectionDto = {
        name: 'New Col',
        description: 'Desc',
        titles: [],
      } as CreateCollectionDto;
      const created = { _id: new Types.ObjectId(), ...dto };
      mockCollectionsService.create.mockResolvedValue(created);

      const req = { user: { userId: 'u1', email: 'a@b.com', roles: ['admin'] } };
      const result = await controller.create(req as any, dto);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(created);
      expect(mockCollectionsService.create).toHaveBeenCalledWith(dto);
    });

    it('should set cover from file when provided', async () => {
      const dto: CreateCollectionDto = {
        name: 'Col',
        description: '',
        titles: [],
      } as CreateCollectionDto;
      const file = { filename: 'cover.jpg' } as Express.Multer.File;
      mockCollectionsService.create.mockResolvedValue({});

      await controller.create({} as any, dto, file);
      expect(mockCollectionsService.create).toHaveBeenCalledWith({
        ...dto,
        cover: '/uploads/collections/cover.jpg',
      });
    });
  });

  describe('update', () => {
    it('should update collection', async () => {
      const id = new Types.ObjectId().toString();
      const dto: UpdateCollectionDto = { name: 'Updated' } as UpdateCollectionDto;
      mockCollectionsService.update.mockResolvedValue({});

      const result = await controller.update(id, dto);
      expect(result.success).toBe(true);
      expect(mockCollectionsService.update).toHaveBeenCalledWith(id, dto);
    });
  });

  describe('delete', () => {
    it('should delete collection', async () => {
      const id = new Types.ObjectId().toString();
      mockCollectionsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(id);
      expect(result.success).toBe(true);
      expect(mockCollectionsService.delete).toHaveBeenCalledWith(id);
    });
  });

  describe('incrementViews', () => {
    it('should increment views', async () => {
      const id = new Types.ObjectId().toString();
      mockCollectionsService.incrementViews.mockResolvedValue({ views: 1 });

      const result = await controller.incrementViews(id);
      expect(result.success).toBe(true);
      expect(mockCollectionsService.incrementViews).toHaveBeenCalledWith(id);
    });
  });

  describe('addTitle', () => {
    it('should add title to collection', async () => {
      const collectionId = new Types.ObjectId().toString();
      const titleId = new Types.ObjectId().toString();
      mockCollectionsService.addTitle.mockResolvedValue({});

      const result = await controller.addTitle(collectionId, titleId);
      expect(result.success).toBe(true);
      expect(mockCollectionsService.addTitle).toHaveBeenCalledWith(
        collectionId,
        expect.any(Types.ObjectId),
      );
    });
  });

  describe('removeTitle', () => {
    it('should remove title from collection', async () => {
      const collectionId = new Types.ObjectId().toString();
      const titleId = new Types.ObjectId().toString();
      mockCollectionsService.removeTitle.mockResolvedValue({});

      const result = await controller.removeTitle(collectionId, titleId);
      expect(result.success).toBe(true);
      expect(mockCollectionsService.removeTitle).toHaveBeenCalledWith(
        collectionId,
        expect.any(Types.ObjectId),
      );
    });
  });

  describe('addComment', () => {
    it('should add comment to collection', async () => {
      const collectionId = new Types.ObjectId().toString();
      mockCollectionsService.addComment.mockResolvedValue({});

      const result = await controller.addComment(collectionId, 'Great!');
      expect(result.success).toBe(true);
      expect(mockCollectionsService.addComment).toHaveBeenCalledWith(
        collectionId,
        'Great!',
      );
    });
  });

  describe('removeComment', () => {
    it('should remove comment by index', async () => {
      const collectionId = new Types.ObjectId().toString();
      mockCollectionsService.removeComment.mockResolvedValue({});

      const result = await controller.removeComment(collectionId, 0);
      expect(result.success).toBe(true);
      expect(mockCollectionsService.removeComment).toHaveBeenCalledWith(
        collectionId,
        0,
      );
    });
  });
});
