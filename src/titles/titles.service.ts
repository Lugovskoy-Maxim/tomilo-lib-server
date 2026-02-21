import { Inject, Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Title, TitleDocument, TitleStatus } from '../schemas/title.schema';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { Collection, CollectionDocument } from '../schemas/collection.schema';
import { CreateTitleDto } from './dto/create-title.dto';
import { UpdateTitleDto } from './dto/update-title.dto';
import { FilesService } from '../files/files.service';
import { UsersService } from '../users/users.service';
import { LoggerService } from '../common/logger/logger.service';

/** Макс. кол-во тайтлов в кеше (покрывает limit до ~20) */
const POPULAR_CACHE_FETCH_LIMIT = 60;
const CACHE_KEY_PREFIX = 'popular_titles';
const CACHE_FILTER_OPTIONS = 'filter_options';
const CACHE_COLLECTIONS_PREFIX = 'collections';
const CACHE_CHAPTERS_COUNT_PREFIX = 'chapters_count';
const CACHE_TITLES_LIST_PREFIX = 'titles_list';
const CACHE_LATEST_UPDATES_PREFIX = 'latest_updates';
const LATEST_UPDATES_CACHE_PAGE = 1;
const LATEST_UPDATES_CACHE_LIMIT = 18;

@Injectable()
export class TitlesService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    @InjectModel(Collection.name)
    private collectionModel: Model<CollectionDocument>,
    private readonly filesService: FilesService,
    private readonly usersService: UsersService,
    @Inject(CACHE_MANAGER) private cacheManager: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void> },
  ) {
    this.logger.setContext(TitlesService.name);
  }

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
    canViewAdult = true,
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
    canViewAdult?: boolean;
  }) {
    const isDefaultFirstPage =
      page === 1 &&
      !search &&
      !genres?.length &&
      !types?.length &&
      !status &&
      !releaseYears?.length &&
      !ageLimits?.length &&
      !tags?.length &&
      sortBy === 'createdAt' &&
      sortOrder === 'desc';
    if (isDefaultFirstPage) {
      const cacheKey = `${CACHE_TITLES_LIST_PREFIX}:${limit}:${canViewAdult}`;
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached as Awaited<ReturnType<typeof this.findAll>>;
    }

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

    // Фильтрация взрослого контента
    // Если пользователь не может видеть взрослый контент, исключаем тайтлы с ageLimit >= 18
    if (!canViewAdult) {
      // Исключаем тайтлы с возрастным ограничением 18+
      // ageLimit < 18 или ageLimit не определен (null/undefined) - это не взрослый контент
      query.$or = [
        { ageLimit: { $lt: 18 } },
        { ageLimit: { $exists: false } },
        { ageLimit: null },
      ];
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

    for (const t of titles) {
      if (t.chaptersRemovedByCopyrightHolder) t.chapters = [];
    }

    const result = {
      titles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
    if (isDefaultFirstPage) {
      const cacheKey = `${CACHE_TITLES_LIST_PREFIX}:${limit}:${canViewAdult}`;
      await this.cacheManager.set(cacheKey, result);
    }
    return result;
  }

  async getFilterOptions() {
    const cached = await this.cacheManager.get(CACHE_FILTER_OPTIONS);
    if (cached) return cached as Awaited<ReturnType<typeof this.getFilterOptions>>;

    // Агрегации без загрузки полных документов — только уникальные значения
    const [genresRes, tagsRes, metaRes] = await Promise.all([
      this.titleModel.aggregate<{ genres: string[] }>([
        { $unwind: { path: '$genres', preserveNullAndEmptyArrays: false } },
        { $group: { _id: null, genres: { $addToSet: '$genres' } } },
        { $project: { _id: 0, genres: 1 } },
      ]),
      this.titleModel.aggregate<{ tags: string[] }>([
        { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
        { $group: { _id: null, tags: { $addToSet: '$tags' } } },
        { $project: { _id: 0, tags: 1 } },
      ]),
      this.titleModel.aggregate<{ types: (string | null)[]; status: (string | null)[]; releaseYears: (number | null)[]; ageLimits: (number | null)[] }>([
        {
          $group: {
            _id: null,
            types: { $addToSet: '$type' },
            status: { $addToSet: '$status' },
            releaseYears: { $addToSet: '$releaseYear' },
            ageLimits: { $addToSet: '$ageLimit' },
          },
        },
        { $project: { _id: 0, types: 1, status: 1, releaseYears: 1, ageLimits: 1 } },
      ]),
    ]);

    const filterNull = <T>(arr: (T | null | undefined)[]): T[] =>
      arr.filter((x): x is T => x != null);
    const meta = metaRes[0] || { types: [], status: [], releaseYears: [], ageLimits: [] };

    const result = {
      genres: (genresRes[0]?.genres || []).sort(),
      types: filterNull(meta.types).sort(),
      status: filterNull(meta.status).sort(),
      tags: (tagsRes[0]?.tags || []).sort(),
      releaseYears: filterNull(meta.releaseYears).sort((a, b) => b - a),
      ageLimits: filterNull(meta.ageLimits).sort((a, b) => a - b),
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
    await this.cacheManager.set(CACHE_FILTER_OPTIONS, result);
    return result;
  }

  async findById(
    id: string,
    populateChapters: boolean = true,
    canViewAdult: boolean = true,
  ): Promise<TitleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid title ID');
    }

    const query: any = { _id: id };

    // Фильтрация взрослого контента
    // Если пользователь не может видеть взрослый контент, тайтл не возвращаем
    if (!canViewAdult) {
      query.$or = [
        { ageLimit: { $lt: 18 } },
        { ageLimit: { $exists: false } },
        { ageLimit: null },
      ];
    }

    let findQuery = this.titleModel.findOne(query);

    // Conditionally populate chapters
    if (populateChapters) {
      findQuery = findQuery.populate({
        path: 'chapters',
        select: '-chapters',
        options: { sort: { chapterNumber: 1 } },
      });
    }

    const title = await findQuery.exec();

    if (!title) {
      throw new NotFoundException('Title not found');
    }

    if (title.chaptersRemovedByCopyrightHolder) title.chapters = [];
    return title;
  }

  async findBySlug(
    slug: string,
    populateChapters: boolean = true,
    canViewAdult: boolean = true,
  ): Promise<TitleDocument | null> {
    const query: any = { slug };

    // Фильтрация взрослого контента
    // Если пользователь не может видеть взрослый контент, тайтл не возвращаем
    if (!canViewAdult) {
      query.$or = [
        { ageLimit: { $lt: 18 } },
        { ageLimit: { $exists: false } },
        { ageLimit: null },
      ];
    }

    let findQuery = this.titleModel.findOne(query);

    // Conditionally populate chapters
    if (populateChapters) {
      findQuery = findQuery.populate({
        path: 'chapters',
        select: '-chapters',
        options: { sort: { chapterNumber: 1 } },
      });
    }

    const title = await findQuery.exec();
    if (title?.chaptersRemovedByCopyrightHolder) title.chapters = [];
    return title;
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

    // Delete chapter pages for each chapter (новая и старая структура папок)
    if (title.chapters && title.chapters.length > 0) {
      for (const chapter of title.chapters) {
        await this.filesService.deleteChapterPages(
          chapter._id.toString(),
          id,
        );
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
    const pipeline = [
      {
        $set: {
          startOfToday: {
            $dateFromParts: {
              year: { $year: '$$NOW' },
              month: { $month: '$$NOW' },
              day: { $dayOfMonth: '$$NOW' },
            },
          },
          oneWeekAgo: { $subtract: ['$$NOW', 7 * 24 * 60 * 60 * 1000] },
          startOfMonth: {
            $dateFromParts: {
              year: { $year: '$$NOW' },
              month: { $month: '$$NOW' },
              day: 1,
            },
          },
        },
      },
      {
        $set: {
          dayReset: {
            $or: [
              { $eq: [{ $ifNull: ['$lastDayReset', null] }, null] },
              { $lt: ['$lastDayReset', '$startOfToday'] },
            ],
          },
          weekReset: {
            $or: [
              { $eq: [{ $ifNull: ['$lastWeekReset', null] }, null] },
              { $lt: ['$lastWeekReset', '$oneWeekAgo'] },
            ],
          },
          monthReset: {
            $or: [
              { $eq: [{ $ifNull: ['$lastMonthReset', null] }, null] },
              { $ne: [{ $year: '$lastMonthReset' }, { $year: '$$NOW' }] },
              { $ne: [{ $month: '$lastMonthReset' }, { $month: '$$NOW' }] },
            ],
          },
        },
      },
      {
        $set: {
          views: { $add: ['$views', 1] },
          dayViews: { $cond: ['$dayReset', 1, { $add: [{ $ifNull: ['$dayViews', 0] }, 1] }] },
          lastDayReset: { $cond: ['$dayReset', '$startOfToday', '$lastDayReset'] },
          weekViews: { $cond: ['$weekReset', 1, { $add: [{ $ifNull: ['$weekViews', 0] }, 1] }] },
          lastWeekReset: { $cond: ['$weekReset', '$$NOW', '$lastWeekReset'] },
          monthViews: { $cond: ['$monthReset', 1, { $add: [{ $ifNull: ['$monthViews', 0] }, 1] }] },
          lastMonthReset: { $cond: ['$monthReset', '$startOfMonth', '$lastMonthReset'] },
        },
      },
      { $unset: ['startOfToday', 'oneWeekAgo', 'startOfMonth', 'dayReset', 'weekReset', 'monthReset'] },
    ];

    const updatedTitle = await this.titleModel
      .findByIdAndUpdate(id, pipeline, { new: true })
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

  async getPopularTitles(
    limit = 10,
    canViewAdult = true,
  ): Promise<TitleDocument[]> {
    const cacheKey = `${CACHE_KEY_PREFIX}:${canViewAdult}`;

    // Пытаемся получить из кеша
    const cached = (await this.cacheManager.get(cacheKey)) as any[] | undefined;
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return this.applyPopularShuffle(cached, limit) as TitleDocument[];
    }

    // Кеш промах — запрос в БД
    const query: any = {};
    if (!canViewAdult) {
      query.$or = [
        { ageLimit: { $lt: 18 } },
        { ageLimit: { $exists: false } },
        { ageLimit: null },
      ];
    }

    const titles = await this.titleModel
      .find(query)
      .sort({ weekViews: -1, averageRating: -1 })
      .limit(POPULAR_CACHE_FETCH_LIMIT)
      .lean()
      .exec();

    if (titles.length > 0) {
      await this.cacheManager.set(cacheKey, titles);
    }

    return this.applyPopularShuffle(titles as any[], limit) as TitleDocument[];
  }

  /** Применяет логику shuffle/limit к списку тайтлов (из кеша или БД). */
  private applyPopularShuffle(
    titles: Array<{ ageLimit?: number | null; [k: string]: any }>,
    limit: number,
  ): Array<{ ageLimit?: number | null; [k: string]: any }> {
    const adultTitles: typeof titles = [];
    const nonAdultTitles: typeof titles = [];

    for (const title of titles) {
      const isAdult = (title.ageLimit ?? 0) >= 18;
      if (isAdult) {
        adultTitles.push(title);
      } else {
        nonAdultTitles.push(title);
      }
    }

    const maxAdultCount = Math.floor(limit * 0.5);
    const adultCount = Math.min(adultTitles.length, maxAdultCount);
    const nonAdultCount = limit - adultCount;

    const selectedAdult = adultTitles.slice(0, adultCount);
    const selectedNonAdult = nonAdultTitles.slice(0, nonAdultCount);

    const result: typeof titles = [];
    result.push(...selectedNonAdult.slice(0, 2));

    const remainingNonAdult = selectedNonAdult.slice(2);
    const remainingTitles = [...remainingNonAdult, ...selectedAdult];

    for (let i = remainingTitles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingTitles[i], remainingTitles[j]] = [
        remainingTitles[j],
        remainingTitles[i],
      ];
    }

    for (const title of remainingTitles) {
      if (result.length < limit) {
        result.push(title);
      }
    }

    return result;
  }

  async getRecentTitles(
    limit = 10,
    canViewAdult = true,
  ): Promise<TitleDocument[]> {
    const query: any = {};

    // Фильтрация взрослого контента
    if (!canViewAdult) {
      query.$or = [
        { ageLimit: { $lt: 18 } },
        { ageLimit: { $exists: false } },
        { ageLimit: null },
      ];
    }

    const titles = await this.titleModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({
        path: 'chapters',
        select: '-pages',
      })
      .exec();
    for (const t of titles) {
      if (t.chaptersRemovedByCopyrightHolder) t.chapters = [];
    }
    return titles;
  }

  async getTitlesWithRecentChapters(
    limit = 18,
    canViewAdult = true,
    page = 1,
  ): Promise<any[]> {
    const skip = (Math.max(1, page) - 1) * limit;
    const needed = skip + limit;

    const cacheKey =
      page === LATEST_UPDATES_CACHE_PAGE && limit === LATEST_UPDATES_CACHE_LIMIT
        ? `${CACHE_LATEST_UPDATES_PREFIX}:${canViewAdult}`
        : null;
    if (cacheKey) {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached && Array.isArray(cached)) return cached as any[];
    }

    const titleSelect =
      'name slug _id altNames description genres tags artist coverImage status author views totalChapters rating releaseYear ageLimit chaptersRemovedByCopyrightHolder isPublished type createdAt updatedAt';
    const recentChapters = await this.chapterModel
      .find({ isPublished: true })
      .sort({ releaseDate: -1 })
      .limit(needed * 40)
      .populate({ path: 'titleId', select: titleSelect })
      .lean()
      .exec();

    // Группируем главы по тайтлам и сохраняем информацию о диапазонах глав
    const titleMap = new Map();
    for (const chapter of recentChapters) {
      if (chapter.titleId) {
        const title = chapter.titleId as any;
        const ageLimit = title.ageLimit;

        // Не показывать тайтлы, у которых главы удалены по просьбе правообладателя
        if (title.chaptersRemovedByCopyrightHolder) {
          continue;
        }

        // Фильтрация взрослого контента на этапе группировки
        // Если пользователь не может видеть взрослый контент, пропускаем взрослые тайтлы
        if (!canViewAdult && ageLimit >= 18) {
          continue;
        }

        const titleId = title._id.toString();
        if (!titleMap.has(titleId)) {
          titleMap.set(titleId, {
            title,
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
      if (titleMap.size >= needed * 2) {
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
      .slice(skip, skip + limit);

    const result = titlesWithChapters.map((item) => {
      const hideChapters = item.title.chaptersRemovedByCopyrightHolder;
      return {
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
        chaptersRemovedByCopyrightHolder: item.title.chaptersRemovedByCopyrightHolder,
        chapters: hideChapters ? [] : item.title.chapters,
        isPublished: item.title.isPublished,
        type: item.title.type,
        createdAt: item.title.createdAt,
        updatedAt: item.title.updatedAt,
        latestChapter: hideChapters ? undefined : item.chapters[0],
        minChapter: hideChapters ? undefined : item.minChapter,
        maxChapter: hideChapters ? undefined : item.maxChapter,
      };
    });

    if (cacheKey) {
      await this.cacheManager.set(cacheKey, result);
    }
    return result;
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
    const title = await this.titleModel
      .findById(titleId)
      .select('chaptersRemovedByCopyrightHolder')
      .lean()
      .exec();
    if (title?.chaptersRemovedByCopyrightHolder) {
      return { count: 0 };
    }
    const cacheKey = `${CACHE_CHAPTERS_COUNT_PREFIX}:${titleId}`;
    const cached = (await this.cacheManager.get(cacheKey)) as { count: number } | undefined;
    if (cached) return cached;
    const count = await this.chapterModel.countDocuments({ titleId });
    const result = { count };
    await this.cacheManager.set(cacheKey, result);
    return result;
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
    canViewAdult = true,
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

    const query: any = {};

    // Фильтрация взрослого контента
    if (!canViewAdult) {
      query.$or = [
        { ageLimit: { $lt: 18 } },
        { ageLimit: { $exists: false } },
        { ageLimit: null },
      ];
    }

    // Получаем больше тайтлов для возможности перемешивания (2x limit)
    const fetchLimit = limit * 2;
    const titles = await this.titleModel
      .find(query)
      .sort({ [sortField]: -1 })
      .limit(fetchLimit)
      .populate({
        path: 'chapters',
        select: '-pages',
      })
      .exec();

    for (const t of titles) {
      if (t.chaptersRemovedByCopyrightHolder) t.chapters = [];
    }

    // Разделяем тайтлы на взрослые (18+) и обычные
    const adultTitles: TitleDocument[] = [];
    const nonAdultTitles: TitleDocument[] = [];

    for (const title of titles) {
      const isAdult = title.ageLimit !== undefined && title.ageLimit >= 18;
      if (isAdult) {
        adultTitles.push(title);
      } else {
        nonAdultTitles.push(title);
      }
    }

    // Максимальное количество взрослых тайтлов (50% от лимита)
    const maxAdultCount = Math.floor(limit * 0.5);
    const adultCount = Math.min(adultTitles.length, maxAdultCount);
    const nonAdultCount = limit - adultCount;

    // Берем нужное количество из каждой группы
    const selectedAdult = adultTitles.slice(0, adultCount);
    const selectedNonAdult = nonAdultTitles.slice(0, nonAdultCount);

    // Первые 2 позиции должны быть НЕ взрослыми тайтлами
    const result: TitleDocument[] = [];

    // Позиции 1-2: самые популярные НЕ взрослые тайтлы
    result.push(...selectedNonAdult.slice(0, 2));

    // Остальные позиции: перемешиваем оставшиеся не-взрослые и взрослые тайтлы
    const remainingNonAdult = selectedNonAdult.slice(2);
    const remainingTitles = [...remainingNonAdult, ...selectedAdult];

    // Перемешиваем оставшиеся тайтлы (Fisher-Yates shuffle)
    for (let i = remainingTitles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingTitles[i], remainingTitles[j]] = [
        remainingTitles[j],
        remainingTitles[i],
      ];
    }

    // Добавляем перемешанные тайтлы, пока не заполним лимит
    for (const title of remainingTitles) {
      if (result.length < limit) {
        result.push(title);
      }
    }

    return result;
  }

  async getCollections(limit = 10): Promise<CollectionDocument[]> {
    const cacheKey = `${CACHE_COLLECTIONS_PREFIX}:${limit}`;
    const cached = (await this.cacheManager.get(cacheKey)) as CollectionDocument[] | undefined;
    if (cached !== undefined && Array.isArray(cached)) return cached;
    const collections = await this.collectionModel.find().limit(limit).exec();
    await this.cacheManager.set(cacheKey, collections);
    return collections;
  }

  async getRandomTitles(
    limit = 10,
    canViewAdult = true,
  ): Promise<TitleDocument[]> {
    // Получаем общее количество тайтлов с учетом фильтрации
    const filterQuery: any = {};
    if (!canViewAdult) {
      filterQuery.$or = [
        { ageLimit: { $lt: 18 } },
        { ageLimit: { $exists: false } },
        { ageLimit: null },
      ];
    }

    const totalTitles = await this.titleModel.countDocuments(filterQuery);

    // Генерируем случайные смещения
    const randomOffsets: number[] = [];
    const maxAttempts = Math.min(limit * 5, totalTitles); // Увеличиваем количество попыток

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

    // Получаем тайтлы по случайным смещениям с фильтрацией
    const promises = randomOffsets.map((offset) =>
      this.titleModel.findOne(filterQuery).skip(offset).exec(),
    );

    const titles = await Promise.all(promises);

    // Фильтруем null значения и ограничиваем количество результатов
    // Преобразуем результаты в правильный тип
    const validTitles = titles.filter(
      (title): title is NonNullable<typeof title> => title !== null,
    );
    return validTitles.slice(0, limit);
  }

  async getRecommendedTitles(
    userId: string,
    limit: number = 10,
    canViewAdult: boolean = true,
  ): Promise<TitleDocument[]> {
    try {
      // Валидируем userId
      if (!Types.ObjectId.isValid(userId)) {
        this.logger.warn(`Invalid user ID: ${userId}`);
        return this.getPopularTitles(limit, canViewAdult);
      }

      // Получаем пользователя
      const user = await this.usersService.findById(userId);
      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
        return this.getPopularTitles(limit, canViewAdult);
      }

      // Собираем ID тайтлов для исключения
      const excludedTitleIds: Types.ObjectId[] = [];

      // Обрабатываем bookmarks (формат: string[] или { titleId, category, addedAt }[])
      if (user.bookmarks && Array.isArray(user.bookmarks)) {
        for (const bookmark of user.bookmarks) {
          let idStr: string | null = null;
          if (typeof bookmark === 'string') {
            idStr = bookmark;
          } else if (bookmark && typeof bookmark === 'object') {
            const obj = bookmark as Record<string, any>;
            idStr =
              obj.titleId?.toString?.() ||
              obj._id?.toString() ||
              obj.id?.toString() ||
              null;
          }
          if (idStr && Types.ObjectId.isValid(idStr)) {
            try {
              excludedTitleIds.push(new Types.ObjectId(idStr));
            } catch {
              // Пропускаем невалидные ID
            }
          }
        }
      }

      // Обрабатываем reading history - собираем только валидные ObjectId
      if (user.readingHistory && Array.isArray(user.readingHistory)) {
        for (const entry of user.readingHistory) {
          let idStr: string | null = null;
          const titleObj = entry.titleId;

          if (typeof titleObj === 'string') {
            idStr = titleObj;
          } else if (titleObj && typeof titleObj === 'object') {
            // Используем Record для доступа к свойствам без ошибок типизации
            const obj = titleObj as Record<string, any>;
            idStr = obj._id?.toString() || obj.id?.toString() || null;
          }

          if (idStr && Types.ObjectId.isValid(idStr)) {
            try {
              const objectId = new Types.ObjectId(idStr);
              // Проверяем, что ещё не добавлен
              if (
                !excludedTitleIds.some((existing) => existing.equals(objectId))
              ) {
                excludedTitleIds.push(objectId);
              }
            } catch {
              // Пропускаем невалидные ID
            }
          }
        }
      }

      // Формируем базовый запрос для поиска рекомендаций
      const baseQuery: any = {};

      // Исключаем уже прочитанные тайтлы
      if (excludedTitleIds.length > 0) {
        baseQuery._id = { $nin: excludedTitleIds };
      }

      // Фильтрация взрослого контента
      if (!canViewAdult) {
        baseQuery.$or = [
          { ageLimit: { $lt: 18 } },
          { ageLimit: { $exists: false } },
          { ageLimit: null },
        ];
      }

      // Если у пользователя нет истории, возвращаем рандомные тайтлы
      const hasHistory =
        user.bookmarks?.length > 0 || user.readingHistory?.length > 0;

      if (!hasHistory) {
        // Если у пользователя нет истории, возвращаем рандомные тайтлы
        return this.getRandomTitles(limit, canViewAdult);
      }

      // Если слишком много исключенных тайтлов, возвращаем рандомные
      if (excludedTitleIds.length >= 50) {
        return this.getRandomTitles(limit, canViewAdult);
      }

      // Получаем тайтлы, исключая уже прочитанные
      const recommendations = await this.titleModel
        .find(baseQuery)
        .sort({ weekViews: -1, averageRating: -1 })
        .limit(limit * 2)
        .exec();

      // Если недостаточно рекомендаций, дополняем популярными
      if (recommendations.length < limit) {
        const popularTitles = await this.getPopularTitles(limit, canViewAdult);
        const recommendedIds = new Set(
          recommendations.map((t) => t._id.toString()),
        );
        const popularFiltered = popularTitles.filter(
          (t) => !recommendedIds.has(t._id.toString()),
        );

        // Объединяем и ограничиваем
        const result = [...recommendations, ...popularFiltered].slice(0, limit);
        return result;
      }

      return recommendations.slice(0, limit);
    } catch (error) {
      // В случае ошибки возвращаем рандомные тайтлы
      this.logger.warn(
        `Error getting recommendations for user ${userId}: ${error.message}`,
      );
      return this.getRandomTitles(limit, canViewAdult);
    }
  }
}
