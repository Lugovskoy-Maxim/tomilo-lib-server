import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { Title, TitleDocument } from '../schemas/title.schema';
import { ALLOWED_REACTION_EMOJIS } from '../schemas/comment.schema';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';

const CHAPTERS_COUNT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min
const CHAPTERS_COUNT_CACHE_PREFIX = 'chapters_count';
const CACHE_RECENT_UPDATES_PREFIX = 'recent_updates';

@Injectable()
export class ChaptersService {
  private readonly logger = new Logger(ChaptersService.name);

  constructor(
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    private filesService: FilesService,
    private notificationsService: NotificationsService,
    @Inject(CACHE_MANAGER)
    private cacheManager: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown, ttl?: number) => Promise<void>; del?: (k: string) => Promise<void> },
  ) {}

  private async invalidateRecentUpdatesCache(): Promise<void> {
    const pagesToClear = [1, 2, 3, 4, 5];
    const limits = [10, 18, 20, 24, 36, 48, 100];
    const adultFlags = [true, false];

    for (const page of pagesToClear) {
      for (const limit of limits) {
        for (const canViewAdult of adultFlags) {
          const cacheKey = `${CACHE_RECENT_UPDATES_PREFIX}:${page}:${limit}:${canViewAdult}`;
          try {
            if (typeof this.cacheManager.del === 'function') {
              await this.cacheManager.del(cacheKey);
            }
          } catch {
            // ignore cache deletion errors
          }
        }
      }
    }
  }

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
    // Если запрашивают главы по тайтлу — не возвращать главы, если они удалены по просьбе правообладателя
    if (titleId && Types.ObjectId.isValid(titleId)) {
      const title = await this.titleModel
        .findById(titleId)
        .select('chaptersRemovedByCopyrightHolder')
        .lean()
        .exec();
      if (title?.chaptersRemovedByCopyrightHolder) {
        return {
          chapters: [],
          pagination: { page, limit, total: 0, pages: 0 },
        };
      }
    }

    const skip = (page - 1) * limit;
    const query: any = {};

    if (titleId) {
      if (Types.ObjectId.isValid(titleId)) {
        // Be tolerant to legacy data that might store string ids
        query.$or = [
          { titleId: new Types.ObjectId(titleId) },
          { titleId: titleId as unknown as Types.ObjectId },
        ];
      } else {
        // if not a valid ObjectId, try matching raw string just in case
        query.titleId = titleId as unknown as Types.ObjectId;
      }
    }

    const sortOptions: any = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [chapters, total] = await Promise.all([
      this.chapterModel
        .find(query)
        .populate({ path: 'titleId', select: 'name slug _id chaptersRemovedByCopyrightHolder' })
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.getCountCached(query),
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

  private async getCountCached(query: any): Promise<number> {
    const raw = query.$or?.[0]?.titleId ?? query.titleId;
    const titleId = raw?.toString?.() ?? raw;
    if (!titleId) {
      return this.chapterModel.countDocuments(query);
    }
    const key = `${CHAPTERS_COUNT_CACHE_PREFIX}:${titleId}`;
    const cached = await this.cacheManager.get(key);
    if (typeof cached === 'number') return cached;
    const total = await this.chapterModel.countDocuments(query);
    await this.cacheManager.set(key, total, { ttl: CHAPTERS_COUNT_CACHE_TTL_MS } as any);
    return total;
  }

  async findById(id: string): Promise<ChapterDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid chapter ID');
    }

    const chapter = await this.chapterModel
      .findById(id)
      .populate({ path: 'titleId', select: 'name slug _id chaptersRemovedByCopyrightHolder' })
      .lean()
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const title = chapter.titleId as { chaptersRemovedByCopyrightHolder?: boolean } | null;
    if (title?.chaptersRemovedByCopyrightHolder) {
      throw new NotFoundException('Chapter not found');
    }

    return chapter as unknown as ChapterDocument;
  }

  async findByTitleAndNumber(
    titleId: string,
    chapterNumber: number,
  ): Promise<ChapterDocument | null> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }

    const title = await this.titleModel
      .findById(titleId)
      .select('chaptersRemovedByCopyrightHolder')
      .lean()
      .exec();
    if (title?.chaptersRemovedByCopyrightHolder) {
      return null;
    }

    const query: any = {};
    query.$or = [
      { titleId: new Types.ObjectId(titleId) },
      { titleId: titleId as unknown as Types.ObjectId },
    ];
    query.chapterNumber = chapterNumber;

    return this.chapterModel.findOne(query).populate('titleId').exec();
  }

  async count({ titleId }: { titleId?: string }): Promise<number> {
    const query: any = {};
    if (titleId) {
      if (Types.ObjectId.isValid(titleId)) {
        query.$or = [
          { titleId: new Types.ObjectId(titleId) },
          { titleId: titleId as unknown as Types.ObjectId },
        ];
      } else {
        query.titleId = titleId as unknown as Types.ObjectId;
      }
    }
    return this.chapterModel.countDocuments(query);
  }

  async getLatestChapter(titleId: string): Promise<ChapterDocument | null> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }

    const title = await this.titleModel
      .findById(titleId)
      .select('chaptersRemovedByCopyrightHolder')
      .lean()
      .exec();
    if (title?.chaptersRemovedByCopyrightHolder) {
      return null;
    }

    const query: any = {};
    query.$or = [
      { titleId: new Types.ObjectId(titleId) },
      { titleId: titleId as unknown as Types.ObjectId },
    ];

    return this.chapterModel
      .findOne(query)
      .sort({ chapterNumber: -1 })
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

    // Создаем уведомления для пользователей, у которых этот тайтл в закладках
    try {
      await this.notificationsService.createNewChapterNotification(
        titleId,
        savedChapter._id.toString(),
        chapterNumber,
        title.name,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create notifications for new chapter: ${(error as Error).message}`,
      );
    }

    // Инвалидируем кеш последних обновлений, чтобы новая глава сразу появилась
    await this.invalidateRecentUpdatesCache();

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

    // Инвалидируем кеш последних обновлений при любом изменении главы
    await this.invalidateRecentUpdatesCache();

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

    // Удаляем файлы главы (новая и старая структура папок)
    await this.filesService.deleteChapterPages(
      id,
      chapter.titleId?.toString(),
    );

    // Удаляем главу из тайтла
    await this.titleModel.findByIdAndUpdate(chapter.titleId, {
      $pull: { chapters: chapter._id },
      $inc: { totalChapters: -1 },
    });

    await this.chapterModel.findByIdAndDelete(id).exec();

    // Инвалидируем кеш последних обновлений
    await this.invalidateRecentUpdatesCache();
  }

  async bulkDelete(ids: string[]): Promise<{ deletedCount: number }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { deletedCount: 0 };
    }

    let deletedCount = 0;
    for (const id of ids) {
      try {
        await this.delete(id);
        deletedCount += 1;
      } catch (e) {
        // skip invalid/non-existing, continue
        this.logger.warn(
          `Skip deleting chapter ${id}: ${(e as Error).message}`,
        );
      }
    }
    return { deletedCount };
  }

  async incrementViews(
    id: string,
    userId: string | null = null,
  ): Promise<ChapterDocument> {
    // Validate chapter ID
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid chapter ID');
    }

    // Log view info for debugging
    if (userId) {
      this.logger.log(
        `Incrementing views for chapter ${id} by authenticated user ${userId}`,
      );
    } else {
      this.logger.log(`Incrementing views for chapter ${id} by anonymous user`);
    }

    const chapter = await this.chapterModel
      .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
      .populate('titleId')
      .exec();

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    // Также увеличиваем просмотры тайтла
    const title = await this.titleModel.findById(chapter.titleId);
    if (!title) {
      throw new NotFoundException('Title not found');
    }

    // Получаем текущую дату
    const now = new Date();

    // Подготавливаем обновления для счетчиков по периодам
    const update: any = { $inc: { views: 1 } };

    // Проверяем, нужно ли сбросить месячный счетчик (проверяем первым!)
    const needMonthReset =
      !title.lastMonthReset ||
      now.getMonth() !== title.lastMonthReset.getMonth() ||
      now.getFullYear() !== title.lastMonthReset.getFullYear();

    if (needMonthReset) {
      update.monthViews = 1;
      update.lastMonthReset = now;
      // При сбросе месяца также сбрасываем неделю и день
      update.weekViews = 1;
      update.lastWeekReset = now;
      update.dayViews = 1;
      update.lastDayReset = now;
    } else {
      // Месяц не сбрасывается, инкрементируем
      update.$inc.monthViews = 1;

      // Проверяем, нужно ли сбросить недельный счетчик
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const needWeekReset = !title.lastWeekReset || title.lastWeekReset < oneWeekAgo;

      if (needWeekReset) {
        update.weekViews = 1;
        update.lastWeekReset = now;
        // При сбросе недели также сбрасываем день
        update.dayViews = 1;
        update.lastDayReset = now;
      } else {
        // Неделя не сбрасывается, инкрементируем
        update.$inc.weekViews = 1;

        // Проверяем, нужно ли сбросить дневной счетчик
        const needDayReset =
          !title.lastDayReset ||
          now.getDate() !== title.lastDayReset.getDate() ||
          now.getMonth() !== title.lastDayReset.getMonth() ||
          now.getFullYear() !== title.lastDayReset.getFullYear();

        if (needDayReset) {
          update.dayViews = 1;
          update.lastDayReset = now;
        } else {
          update.$inc.dayViews = 1;
        }
      }
    }

    await this.titleModel.findByIdAndUpdate(title._id, update);

    return chapter;
  }

  // Paid chapter unlocking
  async unlockPaidChapter(
    userId: string,
    chapterId: string,
  ): Promise<ChapterDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const chapter = await this.findById(chapterId);
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    if (!chapter.isPaid) {
      throw new BadRequestException('This chapter is not paid');
    }

    if (chapter.unlockPrice <= 0) {
      throw new BadRequestException('Invalid unlock price');
    }

    // Balance checking and deduction will be handled in the controller
    // to avoid circular dependency issues

    this.logger.log(
      `User ${userId} unlocked paid chapter ${chapterId} for ${chapter.unlockPrice} coins`,
    );

    return chapter;
  }

  async checkChapterAccess(
    userId: string,
    chapterId: string,
  ): Promise<boolean> {
    const chapter = await this.findById(chapterId);
    if (!chapter) {
      return false;
    }

    // Free chapters are always accessible
    if (!chapter.isPaid) {
      return true;
    }

    // For paid chapters, check if user has unlocked it
    // This could be implemented with a separate collection tracking unlocks
    // For now, we'll assume paid chapters require unlocking each time
    // In a real implementation, you'd want to cache unlocks or use a separate table
    return false; // Paid chapters not accessible without explicit unlock
  }

  async getNextChapter(
    titleId: string,
    currentChapterNumber: number,
  ): Promise<ChapterDocument | null> {
    const query: any = {};
    query.$or = [
      { titleId: new Types.ObjectId(titleId) },
      { titleId: titleId as unknown as Types.ObjectId },
    ];
    query.chapterNumber = { $gt: currentChapterNumber };

    return this.chapterModel
      .findOne(query)
      .sort({ chapterNumber: 1 })
      .populate('titleId')
      .exec();
  }

  async getPrevChapter(
    titleId: string,
    currentChapterNumber: number,
  ): Promise<ChapterDocument | null> {
    const query: any = {};
    query.$or = [
      { titleId: new Types.ObjectId(titleId) },
      { titleId: titleId as unknown as Types.ObjectId },
    ];
    query.chapterNumber = { $lt: currentChapterNumber };

    return this.chapterModel
      .findOne(query)
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

    const query: any = {};
    query.$or = [
      { titleId: new Types.ObjectId(titleId) },
      { titleId: titleId as unknown as Types.ObjectId },
    ];

    const chapters = await this.chapterModel
      .find(query)
      .sort({ chapterNumber: sortOrder === 'asc' ? 1 : -1 })
      .populate('titleId')
      .exec();

    // Убедимся, что все номера глав являются числами
    const chaptersWithNumbers = chapters.map((ch) => {
      if (typeof ch.chapterNumber === 'string') {
        // Преобразуем строку в число
        const num = parseFloat(ch.chapterNumber);
        return {
          ...ch.toObject(),
          chapterNumber: isNaN(num) ? ch.chapterNumber : num,
        };
      }
      return ch;
    }) as ChapterDocument[];

    return chaptersWithNumbers;
  }

  async createWithPages(
    createChapterDto: CreateChapterDto,
    files: Express.Multer.File[],
  ): Promise<ChapterDocument> {
    this.logger.log(`=== НАЧАЛО createWithPages ===`);
    this.logger.log(`CreateChapterDto: ${JSON.stringify(createChapterDto)}`);
    this.logger.log(`Получено файлов: ${files?.length || 0}`);

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

    // Создаем главу сначала без страниц
    const chapter = new this.chapterModel(createChapterDto);
    const savedChapter = await chapter.save();

    try {
      // Сохраняем файлы и получаем пути
      // Using savedChapter.id (virtual getter) instead of savedChapter._id.toString()
      this.logger.log(
        `Сохраняем ${files.length} страниц для главы ${savedChapter.id.toString()}`,
      );
      const pagePaths = await this.filesService.saveChapterPages(
        files,
        savedChapter.id.toString(),
        String(titleId),
      );
      this.logger.log(
        `Сохранено ${pagePaths.length} страниц для главы ${savedChapter.id.toString()}`,
      );

      // Обновляем главу с путями к страницам
      savedChapter.pages = pagePaths;
      await savedChapter.save();

      // Добавляем главу в тайтл
      await this.titleModel.findByIdAndUpdate(titleId, {
        $push: { chapters: savedChapter._id },
        $inc: { totalChapters: 1 },
      });

      // Создаем уведомления для пользователей, у которых этот тайтл в закладках
      try {
        await this.notificationsService.createNewChapterNotification(
          titleId,
          savedChapter.id.toString(),
          chapterNumber,
          title.name,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create notifications for new chapter: ${error}`,
        );
      }

      // Инвалидируем кеш последних обновлений, чтобы новая глава сразу появилась
      await this.invalidateRecentUpdatesCache();

      return savedChapter.populate('titleId');
    } catch (error) {
      // Если ошибка при загрузке файлов, удаляем созданную главу
      await this.chapterModel.findByIdAndDelete(savedChapter._id);
      this.logger.error(
        `Failed to upload chapter pages: ${(error as Error).message}`,
      );
      throw new BadRequestException('Failed to upload chapter pages');
    }
  }

  async addPagesToChapter(
    chapterId: string,
    files: Express.Multer.File[],
  ): Promise<ChapterDocument> {
    if (!Types.ObjectId.isValid(chapterId)) {
      throw new BadRequestException('Invalid chapter ID');
    }
    const chapter = await this.chapterModel.findById(chapterId).exec();
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    this.logger.log(`Добавляем ${files.length} страниц к главе ${chapterId}`);
    const pagePaths = await this.filesService.saveChapterPages(
      files,
      chapterId,
      String(chapter.titleId),
    );
    this.logger.log(
      `Добавлено ${pagePaths.length} страниц к главе ${chapterId}`,
    );

    // Добавляем новые страницы к существующим
    chapter.pages = [...chapter.pages, ...pagePaths];
    return chapter.save();
  }

  async deleteChaptersWithoutTitleId(): Promise<{ deletedCount: number }> {
    // Find chapters where titleId is null or doesn't exist
    const chaptersWithoutTitleId = await this.chapterModel
      .find({
        $or: [{ titleId: null }, { titleId: { $exists: false } }],
      })
      .exec();

    let deletedCount = 0;
    for (const chapter of chaptersWithoutTitleId) {
      try {
        // Delete chapter files
        await this.filesService.deleteChapterPages(chapter._id.toString());

        // Delete the chapter document
        await this.chapterModel.findByIdAndDelete(chapter._id).exec();

        deletedCount++;
        this.logger.log(
          `Deleted chapter ${chapter._id.toString()} without titleId`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to delete chapter ${chapter._id.toString()}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(`Deleted ${deletedCount} chapters without titleId`);
    return { deletedCount };
  }

  /** Рейтинг главы: один пользователь — одна оценка 1–5, можно изменить */
  async setRating(
    chapterId: string,
    userId: string,
    value: number,
  ): Promise<{
    ratingSum: number;
    ratingCount: number;
    averageRating?: number;
    userRating: number;
  }> {
    if (!Types.ObjectId.isValid(chapterId)) {
      throw new BadRequestException('Invalid chapter ID');
    }
    if (value < 1 || value > 5 || !Number.isInteger(value)) {
      throw new BadRequestException('Rating must be an integer from 1 to 5');
    }

    const chapter = await this.chapterModel.findById(chapterId).lean();
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const userIdObj = new Types.ObjectId(userId);
    const ratingByUser = Array.isArray((chapter as any).ratingByUser)
      ? (chapter as any).ratingByUser.map((r: any) => ({
          userId: new Types.ObjectId(r.userId),
          value: Number(r.value),
        }))
      : [];
    const existingIdx = ratingByUser.findIndex(
      (r) => r.userId.toString() === userId,
    );
    const oldValue = existingIdx >= 0 ? ratingByUser[existingIdx].value : null;
    if (existingIdx >= 0) {
      ratingByUser[existingIdx].value = value;
    } else {
      ratingByUser.push({ userId: userIdObj, value });
    }

    const ratingSum =
      (Number((chapter as any).ratingSum) || 0) - (oldValue ?? 0) + value;
    const ratingCount = ratingByUser.length;

    await this.chapterModel.findByIdAndUpdate(chapterId, {
      $set: {
        ratingSum,
        ratingCount,
        ratingByUser,
      },
    });

    const averageRating =
      ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : undefined;
    return {
      ratingSum,
      ratingCount,
      averageRating,
      userRating: value,
    };
  }

  async getRating(
    chapterId: string,
    userId?: string,
  ): Promise<{
    ratingSum: number;
    ratingCount: number;
    averageRating?: number;
    userRating?: number | null;
  }> {
    if (!Types.ObjectId.isValid(chapterId)) {
      throw new BadRequestException('Invalid chapter ID');
    }
    const chapter = await this.chapterModel.findById(chapterId).lean();
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }
    const ratingSum = Number((chapter as any).ratingSum) || 0;
    const ratingCount = Number((chapter as any).ratingCount) || 0;
    const averageRating =
      ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : undefined;
    let userRating: number | null | undefined;
    if (userId) {
      const ratingByUser = (chapter as any).ratingByUser || [];
      const entry = ratingByUser.find(
        (r: any) => r.userId?.toString() === userId,
      );
      userRating = entry != null ? Number(entry.value) : null;
    }
    return {
      ratingSum,
      ratingCount,
      averageRating,
      userRating,
    };
  }

  /** Реакции как в комментариях: переключение эмодзи */
  async toggleReaction(
    chapterId: string,
    userId: string,
    emoji: string,
  ): Promise<ChapterDocument> {
    if (!ALLOWED_REACTION_EMOJIS.includes(emoji as any)) {
      throw new BadRequestException(
        `Invalid emoji. Allowed: ${ALLOWED_REACTION_EMOJIS.join(', ')}`,
      );
    }
    if (!Types.ObjectId.isValid(chapterId)) {
      throw new BadRequestException('Invalid chapter ID');
    }

    const chapter = await this.chapterModel.findById(chapterId).lean();
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const userIdObj = new Types.ObjectId(userId);
    const existing = (chapter as any).reactions || [];
    const reactions = existing.map((r: any) => ({
      emoji: r.emoji,
      userIds: Array.isArray(r.userIds)
        ? r.userIds.map((oid: any) => new Types.ObjectId(oid.toString()))
        : [],
    }));

    let entry = reactions.find((r) => r.emoji === emoji);
    if (!entry) {
      entry = { emoji, userIds: [] };
      reactions.push(entry);
    }

    const idx = entry.userIds.findIndex((oid) => oid.toString() === userId);
    if (idx >= 0) {
      entry.userIds.splice(idx, 1);
    } else {
      entry.userIds.push(userIdObj);
    }

    const newReactions = reactions
      .filter((r) => r.userIds.length > 0)
      .map((r) => ({ emoji: r.emoji, userIds: r.userIds }));

    const updated = await this.chapterModel.findByIdAndUpdate(
      chapterId,
      { $set: { reactions: newReactions } },
      { new: true },
    )
      .populate({ path: 'titleId', select: 'name slug _id' })
      .exec();

    if (!updated) {
      throw new NotFoundException('Chapter not found');
    }
    return updated;
  }

  async getReactionsCount(
    chapterId: string,
  ): Promise<{ reactions: { emoji: string; count: number }[] }> {
    if (!Types.ObjectId.isValid(chapterId)) {
      throw new BadRequestException('Invalid chapter ID');
    }
    const chapter = await this.chapterModel.findById(chapterId).lean();
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }
    const list = (chapter as any).reactions || [];
    return {
      reactions: list
        .filter((r: any) => (r.userIds?.length ?? 0) > 0)
        .map((r: any) => ({
          emoji: r.emoji,
          count: r.userIds.length,
        })),
    };
  }

  /**
   * Обогащает массив глав полями рейтинга и реакций (для списков глав по спецификации).
   */
  async enrichChaptersWithRatingAndReactions(
    chapters: any[],
    userId?: string,
  ): Promise<any[]> {
    if (!chapters?.length) return chapters;
    const enriched = await Promise.all(
      chapters.map(async (ch) => {
        const id = ch._id?.toString?.() ?? ch.id;
        if (!id) return ch;
        try {
          const [rating, { reactions }] = await Promise.all([
            this.getRating(id, userId),
            this.getReactionsCount(id),
          ]);
          return { ...ch, ...rating, reactions };
        } catch {
          return ch;
        }
      }),
    );
    return enriched;
  }
}
