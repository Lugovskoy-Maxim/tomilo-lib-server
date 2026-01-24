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
import { Collection, CollectionDocument } from '../schemas/collection.schema';
import { CreateTitleDto } from './dto/create-title.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { FilesService } from '../files/files.service';

@Injectable()
export class TitlesService {
  constructor(
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    @InjectModel(Collection.name)
    private collectionModel: Model<CollectionDocument>,
    private readonly filesService: FilesService,
  ) {}

  async findAll({
    page = 1,
    limit = 10,
    search,
    genres,
    types,
    status,
    releaseYears,
    ageLimits,
    tags,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    populateChapters = true,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    genres?: string[];
    types?: string[];
    status?: TitleStatus;
    releaseYears?: number[];
    ageLimits?: number[];
    tags?: string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    populateChapters?: boolean;
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

    if (genres && genres.length > 0) {
      query.genres = { $in: genres };
    }

    if (status) {
      query.status = status;
    }

    if (types && types.length > 0) {
      query.type = { $in: types };
    }

    if (releaseYears && releaseYears.length > 0) {
      query.releaseYear = { $in: releaseYears };
    }

    if (ageLimits && ageLimits.length > 0) {
      query.ageLimit = { $in: ageLimits };
    }

    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    // Map common sorting parameter names to actual field names
    const sortFieldMap: { [key: string]: string } = {
      chapters: 'totalChapters',
      year: 'releaseYear',
      rating: 'averageRating',
    };

    const actualSortBy = sortFieldMap[sortBy] || sortBy;
    const sortOptions: any = {};
    sortOptions[actualSortBy] = sortOrder === 'desc' ? -1 : 1;

    // Build the find query
    let findQuery = this.titleModel.find(query);

    // Conditionally populate chapters
    if (populateChapters) {
      findQuery = findQuery.populate({
        path: 'chapters',
        select: '-pages',
      });
    }

    const [titles, total] = await Promise.all([
      findQuery.sort(sortOptions).skip(skip).limit(limit).exec(),
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

  async getFilterOptions() {
    // Получаем все тайтлы для извлечения уникальных значений
    const titles = await this.titleModel.find().exec();

    const genres = new Set<string>();
    const types = new Set<string>();
    const status = new Set<string>();
    const tags = new Set<string>();
    const releaseYears = new Set<number>();
    const ageLimits = new Set<number>();

    titles.forEach((title) => {
      // Добавляем жанры
      if (title.genres && Array.isArray(title.genres)) {
        title.genres.forEach((genre) => genres.add(genre));
      }

      // Добавляем тип
      if (title.type) {
        types.add(title.type);
      }

      // Добавляем статус
      if (title.status) {
        status.add(title.status);
      }

      // Добавляем теги
      if (title.tags && Array.isArray(title.tags)) {
        title.tags.forEach((tag) => tags.add(tag));
      }

      // Добавляем года выпуска
      if (title.releaseYear) {
        releaseYears.add(title.releaseYear);
      }

      // Добавляем возрастные ограничения
      if (title.ageLimit !== undefined && title.ageLimit !== null) {
        ageLimits.add(title.ageLimit);
      }
    });

    return {
      genres: Array.from(genres).sort(),
      types: Array.from(types).sort(),
      status: Array.from(status).sort(),
      tags: Array.from(tags).sort(),
      releaseYears: Array.from(releaseYears).sort((a, b) => b - a), // Сортируем по убыванию (новые года сначала)
      ageLimits: Array.from(ageLimits).sort((a, b) => a - b),
      sortByOptions: [
        'createdAt',
        'updatedAt',
        'name',
        'views',
        'weekViews',
        'dayViews',
        'monthViews',
        'averageRating',
        'totalChapters',
        'releaseYear',
      ],
    };
  }

  async findById(
    id: string,
    populateChapters: boolean = true,
  ): Promise<TitleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid title ID');
    }

    let query = this.titleModel.findById(id);

    // Conditionally populate chapters
    if (populateChapters) {
      query = query.populate({
        path: 'chapters',
        select: '-chapters',
        options: { sort: { chapterNumber: 1 } },
      });
    }

    const title = await query.exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    return title;
  }

  async findBySlug(
    slug: string,
    populateChapters: boolean = true,
  ): Promise<TitleDocument | null> {
    let query = this.titleModel.findOne({ slug });

    // Conditionally populate chapters
    if (populateChapters) {
      query = query.populate({
        path: 'chapters',
        select: '-chapters',
        options: { sort: { chapterNumber: 1 } },
      });
    }

    return query.exec();
  }

  async findByName(name: string): Promise<TitleDocument | null> {
    return this.titleModel
      .findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } })
      .exec();
  }

  async create(createTitleDto: CreateTitleDto): Promise<TitleDocument> {
    const { name, slug } = createTitleDto;

    // Проверка на существующий тайтл по имени
    const existingTitle = await this.findByName(name);
    if (existingTitle) {
      throw new ConflictException('Title with this name already exists');
    }

    // Проверка на существующий тайтл по slug
    const existingTitleBySlug = await this.findBySlug(slug);
    if (existingTitleBySlug) {
      throw new ConflictException('Title with this slug already exists');
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

    // Find title with populated chapters
    const title = await this.titleModel
      .findById(id)
      .populate('chapters')
      .exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    // Delete chapter pages for each chapter
    if (title.chapters && title.chapters.length > 0) {
      for (const chapter of title.chapters) {
        await this.filesService.deleteChapterPages(chapter._id.toString());
      }
    }

    // Delete all chapters associated with the title
    await this.chapterModel.deleteMany({ titleId: id });

    // Delete title cover
    await this.filesService.deleteTitleCover(id);

    // Delete the title
    await this.titleModel.findByIdAndDelete(id).exec();
  }

  async incrementViews(id: string): Promise<TitleDocument> {
    const title = await this.titleModel.findById(id).exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    // Получаем текущую дату
    const now = new Date();

    // Подготавливаем обновления для счетчиков по периодам
    const update: any = { $inc: { views: 1 } };

    // Проверяем, нужно ли сбросить дневной счетчик
    if (
      !title.lastDayReset ||
      now.getDate() !== title.lastDayReset.getDate() ||
      now.getMonth() !== title.lastDayReset.getMonth() ||
      now.getFullYear() !== title.lastDayReset.getFullYear()
    ) {
      update.dayViews = 1;
      update.lastDayReset = now;
    } else {
      update.$inc.dayViews = 1;
    }

    // Проверяем, нужно ли сбросить недельный счетчик
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (!title.lastWeekReset || title.lastWeekReset < oneWeekAgo) {
      update.weekViews = 1;
      update.lastWeekReset = now;
    } else {
      update.$inc.weekViews = 1;
    }

    // Проверяем, нужно ли сбросить месячный счетчик
    if (
      !title.lastMonthReset ||
      now.getMonth() !== title.lastMonthReset.getMonth() ||
      now.getFullYear() !== title.lastMonthReset.getFullYear()
    ) {
      update.monthViews = 1;
      update.lastMonthReset = now;
    } else {
      update.$inc.monthViews = 1;
    }

    const updatedTitle = await this.titleModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();

    if (!updatedTitle) {
      throw new NotFoundException('Title not found');
    }

    return updatedTitle;
  }

  async updateRating(id: string, newRating: number): Promise<TitleDocument> {
    const title = await this.titleModel.findById(id).exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    // Add the new rating to the ratings array
    title.ratings.push(newRating);

    // Update total ratings count
    title.totalRatings = title.ratings.length;

    // Calculate average rating
    title.averageRating =
      title.ratings.reduce((sum, rating) => sum + rating, 0) /
      title.ratings.length;

    await title.save();

    return title;
  }

  async getPopularTitles(limit = 10): Promise<TitleDocument[]> {
    return this.titleModel
      .find()
      .sort({ weekViews: -1, rating: -1 })
      .limit(limit)
      .populate('chapters')
      .exec();
  }

  async getRecentTitles(limit = 10): Promise<TitleDocument[]> {
    return this.titleModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({
        path: 'chapters',
        select: '-pages',
      })
      .exec();
  }

  async getTitlesWithRecentChapters(limit = 15): Promise<any[]> {
    // Получаем недавние главы, отсортированные по дате добавления
    const recentChapters = await this.chapterModel
      .find({ isPublished: true })
      .sort({ releaseDate: -1 })
      .limit(limit * 40) // Получаем значительно больше глав для лучшей фильтрации
      .populate('titleId')
      .exec();

    // Группируем главы по тайтлам и сохраняем информацию о диапазонах глав
    const titleMap = new Map();
    for (const chapter of recentChapters) {
      if (chapter.titleId) {
        const titleId = chapter.titleId._id.toString();
        if (!titleMap.has(titleId)) {
          titleMap.set(titleId, {
            title: chapter.titleId,
            chapters: [chapter],
            minChapter: chapter.chapterNumber,
            maxChapter: chapter.chapterNumber,
          });
        } else {
          const titleInfo = titleMap.get(titleId);
          titleInfo.chapters.push(chapter);
          titleInfo.minChapter = Math.min(
            titleInfo.minChapter,
            chapter.chapterNumber,
          );
          titleInfo.maxChapter = Math.max(
            titleInfo.maxChapter,
            chapter.chapterNumber,
          );
        }
      }

      // Прерываем цикл, если уже набрали нужное количество уникальных тайтлов
      if (titleMap.size >= limit * 2) {
        break;
      }
    }

    // Преобразуем Map в массив и сортируем по дате последней главы
    const titlesWithChapters = Array.from(titleMap.values())
      .sort(
        (a, b) =>
          b.chapters[0].releaseDate.getTime() -
          a.chapters[0].releaseDate.getTime(),
      )
      .slice(0, limit);

    // Возвращаем массив с информацией о тайтлах и диапазонах глав
    return titlesWithChapters.map((item) => ({
      // Явно перечисляем свойства вместо использования toObject()
      _id: item.title._id,
      name: item.title.name,
      slug: item.title.slug,
      altNames: item.title.altNames,
      description: item.title.description,
      genres: item.title.genres,
      tags: item.title.tags,
      artist: item.title.artist,
      coverImage: item.title.coverImage,
      status: item.title.status,
      author: item.title.author,
      views: item.title.views,
      totalChapters: item.title.totalChapters,
      rating: item.title.rating,
      releaseYear: item.title.releaseYear,
      ageLimit: item.title.ageLimit,
      chapters: item.title.chapters,
      isPublished: item.title.isPublished,
      type: item.title.type,
      createdAt: item.title.createdAt,
      updatedAt: item.title.updatedAt,
      latestChapter: item.chapters[0],
      minChapter: item.minChapter,
      maxChapter: item.maxChapter,
    }));
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

  async getTopTitlesForPeriod(
    period: 'day' | 'week' | 'month',
    limit = 10,
  ): Promise<TitleDocument[]> {
    // Определяем поле для сортировки в зависимости от периода
    let sortField: string;
    switch (period) {
      case 'day':
        sortField = 'dayViews';
        break;
      case 'week':
        sortField = 'weekViews';
        break;
      case 'month':
        sortField = 'monthViews';
        break;
      default:
        throw new BadRequestException('Invalid period');
    }

    // Возвращаем тайтлы, отсортированные по просмотрам за период
    return this.titleModel
      .find()
      .sort({ [sortField]: -1 })
      .limit(limit)
      .populate({
        path: 'chapters',
        select: '-pages',
      })
      .exec();
  }

  async getCollections(limit = 10): Promise<CollectionDocument[]> {
    return this.collectionModel.find().limit(limit).exec();
  }

  async getRandomTitles(limit = 10): Promise<TitleDocument[]> {
    // Получаем общее количество тайтлов
    const totalTitles = await this.titleModel.countDocuments();

    // Генерируем случайные смещения
    const randomOffsets: number[] = [];
    const maxAttempts = Math.min(limit * 3, totalTitles); // Ограничиваем количество попыток

    // Генерируем уникальные случайные смещения
    while (randomOffsets.length < Math.min(limit, totalTitles)) {
      const randomOffset = Math.floor(Math.random() * totalTitles);
      if (!randomOffsets.includes(randomOffset)) {
        randomOffsets.push(randomOffset);
      }

      // Защита от бесконечного цикла
      if (randomOffsets.length >= maxAttempts) {
        break;
      }
    }

    // Получаем тайтлы по случайным смещениям
    const promises = randomOffsets.map((offset) =>
      this.titleModel.findOne().skip(offset).exec(),
    );

    const titles = await Promise.all(promises);

    // Фильтруем null значения и ограничиваем количество результатов
    // Преобразуем результаты в правильный тип
    const validTitles = titles.filter(
      (title): title is NonNullable<typeof title> => title !== null,
    );
    return validTitles.slice(0, limit);
  }
}
