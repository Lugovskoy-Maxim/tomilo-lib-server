import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Collection, CollectionDocument } from '../schemas/collection.schema';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectModel(Collection.name)
    private collectionModel: Model<CollectionDocument>,
  ) {}

  async findAll({
    search,
    sortBy = 'views',
    sortOrder = 'desc',
  }: {
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const query: any = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const sortOptions: any = {};
    if (sortBy) {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const collections = await this.collectionModel
      .find(query)
      .populate('titles')
      .sort(sortOptions)
      .exec();

    return collections;
  }

  async findById(id: string): Promise<CollectionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid collection ID');
    }

    const collection = await this.collectionModel
      .findById(id)
      .populate('titles')
      .exec();

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return collection;
  }

  async findByName(name: string): Promise<CollectionDocument | null> {
    return this.collectionModel
      .findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } })
      .exec();
  }

  async create(
    createCollectionDto: CreateCollectionDto,
  ): Promise<CollectionDocument> {
    const { name } = createCollectionDto;

    // Проверка на существующую коллекцию
    if (name) {
      const existingCollection = await this.findByName(name);
      if (existingCollection) {
        throw new ConflictException('Collection with this name already exists');
      }
    }

    const collection = new this.collectionModel(createCollectionDto);
    const saved = await collection.save();
    await saved.populate('titles');
    return saved;
  }

  async update(
    id: string,
    updateCollectionDto: UpdateCollectionDto,
  ): Promise<CollectionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid collection ID');
    }

    const collection = await this.collectionModel
      .findByIdAndUpdate(id, updateCollectionDto, { new: true })
      .populate('titles')
      .exec();

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return collection;
  }

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid collection ID');
    }

    const collection = await this.collectionModel.findByIdAndDelete(id).exec();

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
  }

  async incrementViews(id: string): Promise<CollectionDocument> {
    const collection = await this.collectionModel
      .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
      .exec();

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return collection;
  }

  async getTopCollections(limit = 10): Promise<CollectionDocument[]> {
    return this.collectionModel
      .find()
      .sort({ views: -1 })
      .limit(limit)
      .populate('titles')
      .exec();
  }

  async addTitle(collectionId: string, titleId: Types.ObjectId): Promise<void> {
    const collection = await this.collectionModel.findByIdAndUpdate(
      collectionId,
      { $addToSet: { titles: titleId } },
      { new: true },
    );

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
  }

  async removeTitle(
    collectionId: string,
    titleId: Types.ObjectId,
  ): Promise<void> {
    const collection = await this.collectionModel.findByIdAndUpdate(
      collectionId,
      { $pull: { titles: titleId } },
      { new: true },
    );

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
  }

  async addComment(collectionId: string, comment: string): Promise<void> {
    const collection = await this.collectionModel.findByIdAndUpdate(
      collectionId,
      { $push: { comments: comment } },
      { new: true },
    );

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
  }

  async removeComment(
    collectionId: string,
    commentIndex: number,
  ): Promise<void> {
    const collection = await this.collectionModel.findById(collectionId);

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    if (commentIndex < 0 || commentIndex >= collection.comments.length) {
      throw new BadRequestException('Invalid comment index');
    }

    collection.comments.splice(commentIndex, 1);
    await collection.save();
  }
}
