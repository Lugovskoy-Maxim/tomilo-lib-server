import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { Title, TitleDocument } from '../schemas/title.schema';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';

@Injectable()
export class ChaptersService {
  constructor(
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
  ) {}

  async findAll({
    page = 1,
    limit = 10,
    titleId,
    sortBy = 'chapterNumber',
    sortOrder = 'desc',
  }: {
    page?: number;
    limit?: number;
    titleId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (titleId) {
      if (!Types.ObjectId.isValid(titleId)) {
        throw new BadRequestException('Invalid title ID');
      }
      query.titleId = new Types.ObjectId(titleId);
    }

    const sortOptions: any = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [chapters, total] = await Promise.all([
      this.chapterModel
        .find(query)
        .populate('titleId')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.chapterModel.countDocuments(query),
    ]);

    return {
      chapters,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<ChapterDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid chapter ID');
    }

    const chapter = await this.chapterModel
      .findById(id)
      .populate('titleId')
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    return chapter;
  }

  async findByTitleAndNumber(
    titleId: string,
    chapterNumber: number,
  ): Promise<ChapterDocument | null> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }

    return this.chapterModel
      .findOne({
        titleId: new Types.ObjectId(titleId),
        chapterNumber,
      })
      .populate('titleId')
      .exec();
  }

  async create(createChapterDto: CreateChapterDto): Promise<ChapterDocument> {
    const { titleId, chapterNumber } = createChapterDto;

    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }

    // Проверка существования тайтла
    const title = await this.titleModel.findById(titleId);
    if (!title) {
      throw new NotFoundException('Title not found');
    }

    // Проверка на существующую главу
    const existingChapter = await this.findByTitleAndNumber(
      titleId,
      chapterNumber,
    );
    if (existingChapter) {
      throw new ConflictException(
        `Chapter ${chapterNumber} already exists for this title`,
      );
    }

    const chapter = new this.chapterModel(createChapterDto);
    const savedChapter = await chapter.save();

    // Добавляем главу в тайтл
    await this.titleModel.findByIdAndUpdate(titleId, {
      $push: { chapters: savedChapter._id },
      $inc: { totalChapters: 1 },
    });

    return savedChapter.populate('titleId');
  }

  async update(
    id: string,
    updateChapterDto: UpdateChapterDto,
  ): Promise<ChapterDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid chapter ID');
    }

    const chapter = await this.chapterModel
      .findByIdAndUpdate(id, updateChapterDto, { new: true })
      .populate('titleId')
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    return chapter;
  }

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid chapter ID');
    }

    const chapter = await this.chapterModel.findById(id);
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    // Удаляем главу из тайтла
    await this.titleModel.findByIdAndUpdate(chapter.titleId, {
      $pull: { chapters: chapter._id },
      $inc: { totalChapters: -1 },
    });

    await this.chapterModel.findByIdAndDelete(id).exec();
  }

  async incrementViews(id: string): Promise<ChapterDocument> {
    const chapter = await this.chapterModel
      .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
      .populate('titleId')
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    // Также увеличиваем просмотры тайтла
    await this.titleModel.findByIdAndUpdate(chapter.titleId, {
      $inc: { totalViews: 1 },
    });

    return chapter;
  }

  async getNextChapter(
    titleId: string,
    currentChapterNumber: number,
  ): Promise<ChapterDocument | null> {
    return this.chapterModel
      .findOne({
        titleId: new Types.ObjectId(titleId),
        chapterNumber: { $gt: currentChapterNumber },
      })
      .sort({ chapterNumber: 1 })
      .populate('titleId')
      .exec();
  }

  async getPrevChapter(
    titleId: string,
    currentChapterNumber: number,
  ): Promise<ChapterDocument | null> {
    return this.chapterModel
      .findOne({
        titleId: new Types.ObjectId(titleId),
        chapterNumber: { $lt: currentChapterNumber },
      })
      .sort({ chapterNumber: -1 })
      .populate('titleId')
      .exec();
  }

  async getChaptersByTitle(
    titleId: string,
    sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<ChapterDocument[]> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }

    return this.chapterModel
      .find({ titleId: new Types.ObjectId(titleId) })
      .sort({ chapterNumber: sortOrder === 'asc' ? 1 : -1 })
      .populate('titleId')
      .exec();
  }
}
