import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Title, TitleDocument, TitleStatus } from '../schemas/title.schema';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { CreateTitleDto } from './dto/create-title.dto';
import { UpdateTitleDto } from './dto/update-title.dto';

@Injectable()
export class TitlesService {
  constructor(
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
  ) {}

  async findAll({
    page = 1,
    limit = 10,
    search,
    genre,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  }: {
    page?: number;
    limit?: number;
    search?: string;
    genre?: string;
    status?: TitleStatus;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { altNames: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (genre) {
      query.genres = genre;
    }

    if (status) {
      query.status = status;
    }

    const sortOptions: any = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [titles, total] = await Promise.all([
      this.titleModel
        .find(query)
        .populate('chapters')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.titleModel.countDocuments(query),
    ]);

    return {
      titles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<TitleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid title ID');
    }

    const title = await this.titleModel
      .findById(id)
      .populate({
        path: 'chapters',
        options: { sort: { chapterNumber: 1 } },
      })
      .exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    return title;
  }

  async findByName(name: string): Promise<TitleDocument | null> {
    return this.titleModel
      .findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } })
      .exec();
  }

  async create(createTitleDto: CreateTitleDto): Promise<TitleDocument> {
    const { name } = createTitleDto;

    // Проверка на существующий тайтл
    const existingTitle = await this.findByName(name);
    if (existingTitle) {
      throw new ConflictException('Title with this name already exists');
    }

    const title = new this.titleModel(createTitleDto);
    return title.save();
  }

  async update(
    id: string,
    updateTitleDto: UpdateTitleDto,
  ): Promise<TitleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid title ID');
    }

    const title = await this.titleModel
      .findByIdAndUpdate(id, updateTitleDto, { new: true })
      .exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    return title;
  }

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid title ID');
    }

    const result = await this.titleModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Title not found');
    }
  }

  async incrementViews(id: string): Promise<TitleDocument> {
    const title = await this.titleModel
      .findByIdAndUpdate(id, { $inc: { totalViews: 1 } }, { new: true })
      .exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    return title;
  }

  async updateRating(id: string, newRating: number): Promise<TitleDocument> {
    const title = await this.titleModel
      .findByIdAndUpdate(id, { rating: newRating }, { new: true })
      .exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    return title;
  }

  async getPopularTitles(limit = 10): Promise<TitleDocument[]> {
    return this.titleModel
      .find()
      .sort({ totalViews: -1, rating: -1 })
      .limit(limit)
      .populate('chapters')
      .exec();
  }

  async getRecentTitles(limit = 10): Promise<TitleDocument[]> {
    return this.titleModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('chapters')
      .exec();
  }

  async addChapter(titleId: string, chapterId: Types.ObjectId): Promise<void> {
    const title = await this.titleModel.findByIdAndUpdate(
      titleId,
      {
        $push: { chapters: chapterId },
        $inc: { totalChapters: 1 },
      },
      { new: true },
    );

    if (!title) {
      throw new NotFoundException('Title not found');
    }
  }

  async getChaptersCount(titleId: string): Promise<{ count: number }> {
    const count = await this.chapterModel.countDocuments({ titleId });
    return { count };
  }

  async removeChapter(
    titleId: string,
    chapterId: Types.ObjectId,
  ): Promise<void> {
    const title = await this.titleModel.findByIdAndUpdate(
      titleId,
      {
        $pull: { chapters: chapterId },
        $inc: { totalChapters: -1 },
      },
      { new: true },
    );

    if (!title) {
      throw new NotFoundException('Title not found');
    }
  }
}
