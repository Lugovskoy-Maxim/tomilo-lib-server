import { Model, Types } from 'mongoose';
import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { Title, TitleDocument } from '../schemas/title.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilesService } from '../files/files.service';
import { ChaptersService } from '../chapters/chapters.service';
import { LoggerService } from '../common/logger/logger.service';
import { BotDetectionService } from '../common/services/bot-detection.service';
import { ReadingProgressResponseDto } from './dto/reading-progress-response.dto';
import { AchievementsService } from '../achievements/achievements.service';
/** Категории закладок: читаю, в планах, прочитано, избранное, брошено */
export const BOOKMARK_CATEGORIES = [
  'reading',
  'planned',
  'completed',
  'favorites',
  'dropped',
] as const;
export type BookmarkCategory = (typeof BOOKMARK_CATEGORIES)[number];

/** Лимиты истории чтения: не более N тайтлов и M глав на тайтл (глав храним много — для отображения статуса «прочитано» на фронте) */
const MAX_READING_HISTORY_TITLES = 500;
const MAX_CHAPTERS_PER_TITLE_IN_HISTORY = 6000;
const HOMEPAGE_ACTIVE_USERS_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const CAN_VIEW_ADULT_CACHE_PREFIX = 'user:canViewAdult:';
const CAN_VIEW_ADULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

type HomepageActiveUsersSortBy = 'lastActivityAt' | 'level' | 'createdAt';
type HomepageActiveUsersSortOrder = 'asc' | 'desc';
type HomepageActiveUsersVerification = 'any' | 'email' | 'oauth' | 'none';
type HomepageActiveUsersResponseFormat = 'compact' | 'extended';

interface HomepageActiveUsersOptions {
  limit?: number;
  days?: number;
  sortBy?: HomepageActiveUsersSortBy;
  sortOrder?: HomepageActiveUsersSortOrder;
  verification?: HomepageActiveUsersVerification;
  requireAvatar?: boolean;
  requireRecentActivity?: boolean;
  responseFormat?: HomepageActiveUsersResponseFormat;
}

// Interfaces for type safety in reading history operations
interface ReadingHistoryEntry {
  titleId: Types.ObjectId;
  chapters: {
    chapterId: Types.ObjectId;
    chapterNumber: number;
    chapterTitle?: string;
    readAt: Date;
  }[];
  readAt: Date;
}

interface PopulatedReadingHistoryEntry extends ReadingHistoryEntry {
  titleId: any; // Populated title object
  chapters: {
    chapterId: any; // Populated chapter object
    chapterNumber: number;
    chapterTitle?: string;
    readAt: Date;
  }[];
}

@Injectable()
export class UsersService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    private filesService: FilesService,
    private chaptersService: ChaptersService,
    private botDetectionService: BotDetectionService,
    private achievementsService: AchievementsService,
    @Inject(CACHE_MANAGER)
    private cacheManager: {
      get: (k: string) => Promise<unknown>;
      set: (k: string, v: unknown, ttl?: number | { ttl: number }) => Promise<void>;
    },
  ) {
    this.logger.setContext(UsersService.name);
  }

  async findAll({
    page,
    limit,
    search,
  }: {
    page: number;
    limit: number;
    search: string;
  }) {
    this.logger.log(
      `Fetching users list with page: ${page}, limit: ${limit}, search: ${search}`,
    );
    const skip = (page - 1) * limit;
    const query = search
      ? {
          $or: [
            { username: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-password')
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(query),
    ]);

    this.logger.log(`Found ${users.length} users out of ${total} total`);
    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getHomepageActiveUsers(
    options: HomepageActiveUsersOptions = {},
  ): Promise<any[]> {
    const safeLimit = Math.min(50, Math.max(1, Number(options.limit) || 10));
    const safeDays = Math.min(30, Math.max(1, Number(options.days) || 7));
    const sortBy: HomepageActiveUsersSortBy = options.sortBy || 'lastActivityAt';
    const sortOrder: HomepageActiveUsersSortOrder =
      options.sortOrder === 'asc' ? 'asc' : 'desc';
    const verification: HomepageActiveUsersVerification =
      options.verification === 'none' ? 'any' : (options.verification || 'any');
    const requireAvatar = options.requireAvatar !== false;
    const responseFormat: HomepageActiveUsersResponseFormat =
      options.responseFormat === 'extended' ? 'extended' : 'compact';

    const cacheKey = [
      'users:homepage:active',
      `limit:${safeLimit}`,
      `days:${safeDays}`,
      `sortBy:${sortBy}`,
      `sortOrder:${sortOrder}`,
      `verification:${verification}`,
      `requireAvatar:${requireAvatar ? 1 : 0}`,
      `format:${responseFormat}`,
    ].join(':');
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached as any[];
    }

    const activitySince = new Date();
    activitySince.setDate(activitySince.getDate() - safeDays);

    const hasOAuth = {
      $or: [
        { 'oauth.providerId': { $exists: true, $nin: ['', null] } },
        { 'oauthProviders.0': { $exists: true } },
      ],
    };
    const verificationFilter =
      verification === 'email'
        ? { emailVerified: true }
        : verification === 'oauth'
          ? hasOAuth
          : { $or: [{ emailVerified: true }, hasOAuth] };

    const avatarFilter = requireAvatar
      ? { avatar: { $exists: true, $nin: ['', null] } }
      : {};

    const projection =
      responseFormat === 'extended'
        ? '_id username avatar level role firstName lastName lastActivityAt createdAt'
        : '_id username avatar lastActivityAt level';

    const users = await this.userModel
      .find({
        lastActivityAt: { $gte: activitySince },
        ...verificationFilter,
        ...avatarFilter,
      })
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: -1 })
      .limit(safeLimit)
      .select(projection)
      .lean();

    await this.cacheManager.set(cacheKey, users, {
      ttl: HOMEPAGE_ACTIVE_USERS_CACHE_TTL_MS,
    });

    return users;
  }

  /**
   * Лёгкий запрос для проверки «показывать ли взрослый контент» (кеш 5 мин).
   */
  async getCanViewAdult(userId: string): Promise<boolean> {
    if (!userId || !Types.ObjectId.isValid(userId)) return true;
    const key = `${CAN_VIEW_ADULT_CACHE_PREFIX}${userId}`;
    const cached = await this.cacheManager.get(key);
    if (cached === true || cached === false) return cached;
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('displaySettings')
      .lean()
      .exec();
    const canViewAdult = user?.displaySettings?.isAdult !== false;
    await this.cacheManager.set(key, canViewAdult, { ttl: CAN_VIEW_ADULT_CACHE_TTL_MS });
    return canViewAdult;
  }

  async findById(id: string): Promise<User> {
    this.logger.log(`Finding user by ID: ${id}`);
    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid user ID format: ${id}`);
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(id))
      .select('-password')
      .populate({
        path: 'bookmarks.titleId',
        select: '_id title slug coverImage type status isAdult',
      })
      .populate({
        path: 'readingHistory.titleId',
        select: '_id title slug coverImage type',
      })
      .populate({
        path: 'readingHistory.chapters.chapterId',
        select: '_id chapterNumber title',
      })
      .populate({
        path: 'equippedDecorations.avatar',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.frame',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.background',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.card',
        select: '_id name imageUrl type rarity',
      });

    this.logger.log(
      `Database query result for user ${id}: ${user ? 'found' : 'not found'}`,
    );

    if (!user) {
      this.logger.warn(`User not found with ID: ${id}`);
      throw new NotFoundException('User not found');
    }
    this.logger.log(`User found with ID: ${id}`);
    return user;
  }

  async findProfileById(id: string): Promise<User> {
    this.logger.log(`Finding user profile by ID: ${id}`);
    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid user ID format: ${id}`);
      throw new BadRequestException('Invalid user ID');
    }

    this.logger.log(`Querying database for user with ID: ${id}`);
    const user = await this.userModel
      .findById(new Types.ObjectId(id))
      .select('-password -readingHistory')
      .populate({
        path: 'bookmarks.titleId',
        select: '_id title slug coverImage type status isAdult',
      })
      .populate({
        path: 'equippedDecorations.avatar',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.frame',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.background',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.card',
        select: '_id name imageUrl type rarity',
      });

    this.logger.log(
      `Database query result: ${user ? 'User found' : 'User not found'}`,
    );

    this.logger.log(
      `Database query result for profile ${id}: ${user ? 'found' : 'not found'}`,
    );
    if (!user) {
      this.logger.warn(`User not found with ID: ${id}`);
      throw new NotFoundException('User not found');
    }
    const didMigrate = this.normalizeBookmarksIfNeeded(user as UserDocument);
    if (didMigrate) await user.save();
    const plain = (user as any).toObject ? (user as any).toObject() : { ...user };
    plain.bookmarks = this.repairBookmarksPlain(plain.bookmarks);
    this.logger.log(`User profile found with ID: ${id}`);
    return plain as User;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { email, username } = createUserDto;
    this.logger.log(
      `Creating new user with email: ${email}, username: ${username}`,
    );

    // Проверка на существующего пользователя
    const existingUser = await this.userModel.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      this.logger.warn(
        `User with email ${email} or username ${username} already exists`,
      );
      throw new ConflictException(
        'User with this email or username already exists',
      );
    }

    const user = new this.userModel(createUserDto);
    const savedUser = await user.save();
    this.logger.log(
      `User created successfully with ID: ${savedUser._id.toString()}`,
    );
    return savedUser;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const sanitized = { ...updateUserDto };
    if (sanitized.bookmarks !== undefined && Array.isArray(sanitized.bookmarks)) {
      sanitized.bookmarks = this.normalizeBookmarksFromInput(
        sanitized.bookmarks as any[],
      ) as any;
    }

    const user = await this.userModel
      .findByIdAndUpdate(new Types.ObjectId(id), sanitized, { new: true })
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Нормализует закладки из входящих данных (string[] или mixed) в формат
   * { titleId: ObjectId, category, addedAt }.
   * Важно: не передавать raw string[] в Mongoose — при касте строка
   * распространяется по символам (Object.assign даёт "0","1",...,"23").
   */
  private normalizeBookmarksFromInput(
    raw: Array<string | { titleId: string; category?: string; addedAt?: Date }>,
  ): Array<{ titleId: Types.ObjectId; category: string; addedAt: Date }> {
    return raw.map((b: any) => {
      if (typeof b === 'string') {
        return {
          titleId: new Types.ObjectId(b),
          category: 'reading',
          addedAt: new Date(),
        };
      }
      const titleId =
        b.titleId instanceof Types.ObjectId
          ? b.titleId
          : new Types.ObjectId(this.extractTitleIdFromBookmark(b));
      return {
        titleId,
        category: BOOKMARK_CATEGORIES.includes(b.category) ? b.category : 'reading',
        addedAt: b.addedAt ? new Date(b.addedAt) : new Date(),
      };
    });
  }

  /**
   * Удаляет закладки без валидного titleId, чтобы сохранение не падало на валидации Mongoose.
   * Вызывать перед user.save(), если у пользователя могли появиться битые закладки.
   */
  private sanitizeBookmarksBeforeSave(user: UserDocument): void {
    const raw = (user as any).bookmarks;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return;
    const valid: Array<{ titleId: Types.ObjectId; category: string; addedAt: Date }> = [];
    for (const b of raw) {
      if (b == null) continue;
      const titleIdStr = this.extractTitleIdFromBookmark(b);
      if (!titleIdStr || !Types.ObjectId.isValid(titleIdStr)) continue;
      valid.push({
        titleId: new Types.ObjectId(titleIdStr),
        category: BOOKMARK_CATEGORIES.includes(b?.category) ? b.category : 'reading',
        addedAt: b?.addedAt ? new Date(b.addedAt) : new Date(),
      });
    }
    user.bookmarks = valid as any;
  }

  /** Безопасно получить titleId закладки как строку (поддержка titleId и title). */
  private getBookmarkTitleIdStr(b: any): string {
    return this.extractTitleIdFromBookmark(b);
  }

  /**
   * Восстанавливает titleId из закладки.
   * Поддерживает: titleId, title (старый ref), string, испорченный spread ("0"-"23"),
   * populated document (titleId как объект с _id после populate).
   */
  private extractTitleIdFromBookmark(b: any): string {
    if (typeof b === 'string') return b;
    const from = b?.titleId ?? b?.title;
    if (from) {
      if (from instanceof Types.ObjectId) return from.toString();
      // Populated document: { _id: ObjectId, ... }
      if (typeof from === 'object' && from._id) {
        return from._id instanceof Types.ObjectId
          ? from._id.toString()
          : String(from._id);
      }
      return String(from);
    }
    const chars: string[] = [];
    for (let i = 0; i < 24; i++) {
      const c = b?.[String(i)];
      if (typeof c === 'string' && /^[0-9a-f]$/i.test(c)) chars.push(c);
    }
    return chars.length === 24 ? chars.join('') : '';
  }

  async delete(id: string): Promise<void> {
    this.logger.log(`Deleting user with ID: ${id}`);
    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid user ID format: ${id}`);
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(new Types.ObjectId(id));
    if (!user) {
      this.logger.warn(`User not found with ID: ${id}`);
      throw new NotFoundException('User not found');
    }

    // Удаляем файлы пользователя (аватар)
    await this.filesService.deleteUserFolder(id);

    const result = await this.userModel.findByIdAndDelete(
      new Types.ObjectId(id),
    );
    if (!result) {
      this.logger.warn(`User not found with ID: ${id} during deletion`);
      throw new NotFoundException('User not found');
    }
    this.logger.log(`User deleted successfully with ID: ${id}`);
  }

  /**
   * Нормализует закладки: string[], испорченный spread ("0"-"23"), title без titleId
   * → всегда { titleId: ObjectId, category, addedAt }.
   * Возвращает true, если документ был изменён (нужно сохранить).
   */
  private normalizeBookmarksIfNeeded(user: UserDocument): boolean {
    const raw = (user as any).bookmarks;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return false;
    const needsNormalize = raw.some((b: any) => this.bookmarkNeedsNormalize(b));
    if (!needsNormalize) return false;
    const normalized = raw
      .map((b: any) => {
        const titleIdStr = this.extractTitleIdFromBookmark(b);
        if (!titleIdStr || !Types.ObjectId.isValid(titleIdStr)) return null;
        return {
          titleId: new Types.ObjectId(titleIdStr),
          category: BOOKMARK_CATEGORIES.includes(b?.category) ? b.category : ('reading' as const),
          addedAt: b?.addedAt ? new Date(b.addedAt) : new Date(),
        };
      })
      .filter(Boolean);
    user.bookmarks = normalized as any;
    return true;
  }

  /** Восстанавливает закладки из plain-объекта (для lean-запросов), исправляя spread-формат. */
  private repairBookmarksPlain(
    bookmarks: any[] | undefined,
  ): Array<{ titleId: any; category: string; addedAt: Date; _id?: any }> {
    if (!bookmarks || !Array.isArray(bookmarks)) return [];
    return bookmarks
      .map((b: any) => {
        const titleIdStr = this.extractTitleIdFromBookmark(b);
        if (!titleIdStr || !Types.ObjectId.isValid(titleIdStr)) return null;
        const titleId = b.titleId && typeof b.titleId === 'object' ? b.titleId : titleIdStr;
        return {
          titleId,
          category: BOOKMARK_CATEGORIES.includes(b?.category) ? b.category : 'reading',
          addedAt: b?.addedAt ? new Date(b.addedAt) : new Date(),
          _id: b._id,
        };
      })
      .filter(Boolean) as any;
  }

  private isCorruptedBookmark(b: any): boolean {
    if (!b || typeof b !== 'object' || typeof b === 'string') return false;
    if (b.titleId || b.title) return false;
    const hasCharKeys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
      .every((i) => typeof b[String(i)] === 'string');
    return hasCharKeys;
  }

  /** Требует нормализации: string, испорченный spread или title без titleId. */
  private bookmarkNeedsNormalize(b: any): boolean {
    if (typeof b === 'string') return true;
    if (!b || typeof b !== 'object') return false;
    if (this.isCorruptedBookmark(b)) return true;
    if (b.title && !b.titleId) return true;
    return false;
  }

  // 🔖 Методы для работы с закладками (по категориям: читаю, в планах, прочитано, избранное, брошено)
  async addBookmark(
    userId: string,
    titleId: string,
    category: BookmarkCategory = 'reading',
  ): Promise<User> {
    this.logger.log(
      `Adding bookmark for user ${userId} to title ${titleId}, category ${category}`,
    );
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      this.logger.warn(`Invalid user ID ${userId} or title ID ${titleId}`);
      throw new BadRequestException('Invalid user ID or title ID');
    }
    if (!BOOKMARK_CATEGORIES.includes(category)) {
      throw new BadRequestException(
        `Invalid category. Allowed: ${BOOKMARK_CATEGORIES.join(', ')}`,
      );
    }

    const titleObjectId = new Types.ObjectId(titleId);
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      this.logger.warn(`User not found with ID: ${userId}`);
      throw new NotFoundException('User not found');
    }

    this.normalizeBookmarksIfNeeded(user as UserDocument);
    const existingIndex = (user.bookmarks as any[]).findIndex(
      (b: any) => this.getBookmarkTitleIdStr(b) === titleId,
    );
    const entry = {
      titleId: titleObjectId,
      category,
      addedAt: new Date(),
    };
    if (existingIndex >= 0) {
      (user.bookmarks as any[])[existingIndex] = entry;
    } else {
      (user.bookmarks as any[]).push(entry);
    }
    this.sanitizeBookmarksBeforeSave(user as UserDocument);
    await user.save();

    this.logger.log(
      `Bookmark added successfully for user ${userId} to title ${titleId}`,
    );
    return (await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('-password')) as User;
  }

  async removeBookmark(userId: string, titleId: string): Promise<User> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    this.normalizeBookmarksIfNeeded(user as UserDocument);

    const before = (user.bookmarks as any[]).length;
    user.bookmarks = (user.bookmarks as any[]).filter(
      (b: any) => this.getBookmarkTitleIdStr(b) !== titleId,
    ) as any;
    if (user.bookmarks.length === before) {
      throw new NotFoundException('Bookmark not found');
    }
    this.sanitizeBookmarksBeforeSave(user as UserDocument);
    await user.save();
    return (await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('-password')) as User;
  }

  async updateBookmarkCategory(
    userId: string,
    titleId: string,
    category: BookmarkCategory,
  ): Promise<User> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }
    if (!BOOKMARK_CATEGORIES.includes(category)) {
      throw new BadRequestException(
        `Invalid category. Allowed: ${BOOKMARK_CATEGORIES.join(', ')}`,
      );
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    this.normalizeBookmarksIfNeeded(user as UserDocument);

    const entry = (user.bookmarks as any[]).find(
      (b: any) => this.getBookmarkTitleIdStr(b) === titleId,
    );
    if (!entry) throw new NotFoundException('Bookmark not found');
    entry.category = category;
    this.sanitizeBookmarksBeforeSave(user as UserDocument);
    await user.save();
    return (await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('-password')) as User;
  }

  /**
   * Проверить, добавлен ли тайтл в закладки и в какой категории
   */
  async getBookmarkStatus(
    userId: string,
    titleId: string,
  ): Promise<{ isBookmarked: boolean; category: string | null }> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('bookmarks');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const bookmark = (user.bookmarks as any[]).find(
      (b: any) => this.getBookmarkTitleIdStr(b) === titleId,
    );

    return {
      isBookmarked: !!bookmark,
      category: bookmark?.category || null,
    };
  }

  /**
   * Получить количество закладок по категориям
   */
  async getBookmarksCounts(
    userId: string,
  ): Promise<{
    reading: number;
    planned: number;
    completed: number;
    favorites: number;
    dropped: number;
    total: number;
  }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('bookmarks');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const counts = {
      reading: 0,
      planned: 0,
      completed: 0,
      favorites: 0,
      dropped: 0,
      total: 0,
    };

    for (const bookmark of user.bookmarks as any[]) {
      const category = bookmark?.category || 'reading';
      if (category in counts) {
        counts[category as keyof typeof counts]++;
      }
      counts.total++;
    }

    return counts;
  }

  /**
   * Получить прогресс чтения для конкретного тайтла
   */
  async getReadingProgressForTitle(
    userId: string,
    titleId: string,
  ): Promise<{
    titleId: string;
    lastChapterId: string | null;
    lastChapterNumber: number | null;
    chaptersRead: number;
    totalChapters: number;
    progressPercent: number;
    readAt: Date | null;
  }> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const [user, title] = await Promise.all([
      this.userModel
        .findById(new Types.ObjectId(userId))
        .select('readingHistory'),
      this.titleModel
        .findById(new Types.ObjectId(titleId))
        .select('totalChapters'),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const totalChapters = title?.totalChapters || 0;

    const historyEntry = user.readingHistory.find(
      (e) => this.getHistoryTitleIdStr(e) === titleId,
    );

    if (!historyEntry || !historyEntry.chapters?.length) {
      return {
        titleId,
        lastChapterId: null,
        lastChapterNumber: null,
        chaptersRead: 0,
        totalChapters,
        progressPercent: 0,
        readAt: null,
      };
    }

    const sortedChapters = [...historyEntry.chapters].sort(
      (a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime(),
    );

    const lastChapter = sortedChapters[0];
    const chaptersRead = historyEntry.chapters.length;
    const progressPercent = totalChapters > 0
      ? Math.round((chaptersRead / totalChapters) * 100)
      : 0;

    return {
      titleId,
      lastChapterId: this.getHistoryChapterIdStr(lastChapter) || null,
      lastChapterNumber: lastChapter.chapterNumber ?? null,
      chaptersRead,
      totalChapters,
      progressPercent: Math.min(100, progressPercent),
      readAt: historyEntry.readAt || null,
    };
  }

  async getUserBookmarks(
    userId: string,
    options?: { category?: BookmarkCategory; grouped?: boolean },
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .populate({
        path: 'bookmarks.titleId',
        select: '_id title slug coverImage type status isAdult chaptersCount latestChapterNumber',
      })
      .select('bookmarks');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const didMigrate = this.normalizeBookmarksIfNeeded(user as UserDocument);
    if (didMigrate) await user.save();

    let list = (user.bookmarks as any[]).slice();
    if (options?.category) {
      list = list.filter((b: any) => b.category === options.category);
    }
    if (options?.grouped) {
      const byCategory: Record<string, any[]> = {};
      for (const cat of BOOKMARK_CATEGORIES) {
        byCategory[cat] = list.filter((b: any) => b.category === cat);
      }
      return byCategory;
    }
    return list;
  }

  /**
   * Подсчитать количество пользователей, добавивших тайтл в закладки
   */
  async countBookmarksForTitle(titleId: string): Promise<number> {
    if (!Types.ObjectId.isValid(titleId)) {
      return 0;
    }

    const count = await this.userModel.countDocuments({
      'bookmarks.titleId': new Types.ObjectId(titleId),
    });

    return count;
  }

  // 🖼 Методы для работы с аватаром
  async updateAvatar(userId: string, file: Express.Multer.File): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    // Сохраняем файл и получаем путь
    const avatarPath = await this.filesService.saveUserAvatar(file, userId);

    // Обновляем пользователя с новым путем к аватару
    const user = await this.userModel
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { avatar: avatarPath },
        { new: true },
      )
      .select('-password');

    if (!user) {
      // Если пользователь не найден, удаляем загруженный файл
      await this.filesService.deleteUserAvatar(userId);
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getAvatar(userId: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('avatar');
    return user?.avatar || null;
  }

  async removeAvatar(userId: string): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    // Удаляем файл аватара
    await this.filesService.deleteUserAvatar(userId);

    // Обновляем пользователя, убирая аватар
    const user = await this.userModel
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { $unset: { avatar: 1 } },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /** Безопасно получить titleId записи истории как строку. */
  private getHistoryTitleIdStr(entry: { titleId?: Types.ObjectId } | null): string {
    if (entry?.titleId == null) return '';
    const t = entry.titleId;
    if (typeof t === 'string') return t;
    if (typeof t.toString === 'function') return t.toString();
    return String(t);
  }

  /** Безопасно получить chapterId как строку. */
  private getHistoryChapterIdStr(ch: { chapterId?: Types.ObjectId } | null): string {
    if (ch?.chapterId == null) return '';
    const t = ch.chapterId;
    if (typeof t === 'string') return t;
    if (typeof t.toString === 'function') return t.toString();
    return String(t);
  }

  // 📖 Методы для работы с историей чтения
  async addToReadingHistory(
    userId: string,
    titleId: string,
    chapterId: string,
  ): Promise<ReadingProgressResponseDto> {
    this.logger.log(
      `Adding to reading history for user ${userId}, title ${titleId}, chapter ${chapterId}`,
    );
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      this.logger.warn(`Invalid user ID ${userId} or title ID ${titleId}`);
      throw new BadRequestException('Invalid user ID or title ID');
    }

    // Проверка на null или undefined titleId
    if (!titleId) {
      this.logger.warn(`Title ID is null or undefined for user ${userId}`);
      throw new BadRequestException('Title ID cannot be null or undefined');
    }

    const titleObjectId = new Types.ObjectId(titleId);
    const titleIdStr = titleObjectId.toString();

    // Получаем информацию о главе
    let chapterObjectId: Types.ObjectId;
    let chapterNumber: number;
    let chapterTitle: string | undefined;

    if (Types.ObjectId.isValid(chapterId)) {
      chapterObjectId = new Types.ObjectId(chapterId);
      const chapter = await this.chaptersService.findById(chapterId);
      if (!chapter) {
        this.logger.warn(`Chapter not found with ID: ${chapterId}`);
        throw new NotFoundException('Chapter not found');
      }
      chapterNumber = chapter.chapterNumber;
      chapterTitle = chapter.name || undefined;
    } else {
      chapterNumber = parseInt(chapterId, 10);
      if (isNaN(chapterNumber)) {
        this.logger.warn(`Invalid chapter ID or number: ${chapterId}`);
        throw new BadRequestException('Invalid chapter ID or number');
      }

      const chapter = await this.chaptersService.findByTitleAndNumber(
        titleId,
        chapterNumber,
      );
      if (!chapter) {
        this.logger.warn(
          `Chapter not found with title ID ${titleId} and number ${chapterNumber}`,
        );
        throw new NotFoundException('Chapter not found');
      }
      chapterObjectId = chapter._id;
      chapterTitle = chapter.name || undefined;
    }

    // Находим пользователя
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      this.logger.warn(`User not found with ID: ${userId}`);
      throw new NotFoundException('User not found');
    }

    // Ищем существующую запись для этого тайтла
    const existingEntryIndex = user.readingHistory.findIndex(
      (entry) => this.getHistoryTitleIdStr(entry) === titleIdStr,
    );

    const currentTime = new Date();

    // Флаг: является ли глава новой (для начисления опыта)
    let isNewChapter = false;

    if (existingEntryIndex !== -1) {
      // Тайтл уже есть в истории - обновляем его
      const existingEntry = user.readingHistory[existingEntryIndex];

      // Ищем, есть ли уже такая глава
      const chapterIdStr = chapterObjectId.toString();
      const existingChapterIndex = existingEntry.chapters.findIndex(
        (chapter) => this.getHistoryChapterIdStr(chapter) === chapterIdStr,
      );

      if (existingChapterIndex !== -1) {
        // Глава уже есть - обновляем время чтения, НЕ начисляем опыт
        existingEntry.chapters[existingChapterIndex].readAt = currentTime;
        isNewChapter = false;
        this.logger.log(
          `Updated read time for existing chapter in user ${userId}'s history (no XP)`,
        );
      } else {
        // Главы нет - добавляем новую, начисляем опыт
        isNewChapter = true;
        existingEntry.chapters.push({
          chapterId: chapterObjectId,
          chapterNumber,
          chapterTitle,
          readAt: currentTime,
        });
        // Инкрементируем счётчик прочитанных глав
        user.chaptersReadCount = (user.chaptersReadCount ?? 0) + 1;
        // Оставляем только последние N глав по тайтлу, чтобы не раздувать историю
        if (existingEntry.chapters.length > MAX_CHAPTERS_PER_TITLE_IN_HISTORY) {
          existingEntry.chapters = existingEntry.chapters
            .sort(
              (a, b) =>
                new Date(b.readAt).getTime() - new Date(a.readAt).getTime(),
            )
            .slice(0, MAX_CHAPTERS_PER_TITLE_IN_HISTORY);
        }
        this.logger.log(
          `Added new chapter to existing title in user ${userId}'s history`,
        );
      }

      // Обновляем время чтения тайтла
      existingEntry.readAt = currentTime;
    } else {
      // Тайтла нет в истории - создаем новую запись, начисляем опыт
      isNewChapter = true;
      const newEntry = {
        titleId: titleObjectId,
        chapters: [
          {
            chapterId: chapterObjectId,
            chapterNumber,
            chapterTitle,
            readAt: currentTime,
          },
        ],
        readAt: currentTime,
      };

      // Инкрементируем счётчик прочитанных глав
      user.chaptersReadCount = (user.chaptersReadCount ?? 0) + 1;
      // Инкрементируем счётчик уникальных тайтлов
      user.titlesReadCount = (user.titlesReadCount ?? 0) + 1;

      // Добавляем в начало и ограничиваем размер (не более N тайтлов)
      user.readingHistory.unshift(newEntry);
      if (user.readingHistory.length > MAX_READING_HISTORY_TITLES) {
        user.readingHistory = user.readingHistory.slice(
          0,
          MAX_READING_HISTORY_TITLES,
        );
      }
      this.logger.log(`Added new title to user ${userId}'s reading history`);
    }

    // Обновляем streak (серию дней активности) — только если глава новая
    let streakBonus = 0;
    if (isNewChapter) {
      streakBonus = this.updateStreak(user);
    }

    // Добавляем примерное время чтения (4 минуты на главу) — только если глава новая
    if (isNewChapter) {
      this.addReadingTime(user, 4);
    }

    // 🛡️ Проверка на ботов перед начислением XP
    const botDetectionResult = await this.botDetectionService.checkActivity(
      userId,
      chapterObjectId.toString(),
      titleIdStr,
    );

    // Если пользователь определен как бот - не начисляем XP и предупреждаем
    if (botDetectionResult.isBot) {
      this.logger.warn(
        `Bot activity detected for user ${userId}: score=${botDetectionResult.botScore}, reasons=${JSON.stringify(botDetectionResult.reasons)}`,
      );
      // Обновляем статус в базе данных
      await this.botDetectionService.updateBotStatus(
        userId,
        botDetectionResult,
      );
    } else if (botDetectionResult.isSuspicious) {
      // Для подозрительных пользователей постепенно увеличиваем score
      await this.botDetectionService.updateBotStatus(
        userId,
        botDetectionResult,
      );
    }

    // Award experience for reading (только если не бот И глава новая)
    let progressEvent: {
      expGained: number;
      reason: string;
      levelUp: boolean;
      newLevel?: number;
      oldLevel?: number;
      bonusCoins?: number;
      streakBonus?: number;
    } | undefined = undefined;
    let oldRankInfo: { rank: number; stars: number; name: string; minLevel: number } | undefined = undefined;
    let newRankInfo: { rank: number; stars: number; name: string; minLevel: number } | undefined = undefined;

    if (!botDetectionResult.isBot && isNewChapter) {
      const oldLevel = user.level;
      const oldRank = this.levelToRank(oldLevel);
      oldRankInfo = oldRank;

      // Базовый опыт за главу + бонус за streak
      const baseExp = 10;
      const totalExp = baseExp + streakBonus;
      user.experience += totalExp;
      let leveledUp = false;
      let totalBonusCoins = 0;

      while (user.experience >= this.calculateNextLevelExp(user.level)) {
        user.level += 1;
        leveledUp = true;
        const coins = user.level * 10;
        user.balance += coins;
        totalBonusCoins += coins;
      }

      const newRank = this.levelToRank(user.level);
      newRankInfo = newRank;

      progressEvent = {
        expGained: totalExp,
        reason: streakBonus > 0 ? `Чтение главы + бонус за серию ${user.currentStreak} дней` : 'Чтение главы',
        levelUp: leveledUp,
        oldLevel: leveledUp ? oldLevel : undefined,
        newLevel: leveledUp ? user.level : undefined,
        bonusCoins: leveledUp ? totalBonusCoins : undefined,
        streakBonus: streakBonus > 0 ? streakBonus : undefined,
      };
    } else if (botDetectionResult.isBot) {
      this.logger.warn(`Skipping XP award for bot user ${userId}`);
    } else if (!isNewChapter) {
      this.logger.log(`Skipping XP award for already read chapter ${chapterId} by user ${userId}`);
    }

    // Проверка достижений
    const totalChaptersRead = user.chaptersReadCount ?? 0;
    const totalBookmarks = user.bookmarks?.length ?? 0;
    const createdAt = (user as any).createdAt as Date | undefined;
    const daysSinceJoined = createdAt
      ? Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const socialConnections =
      (user.emailVerified ? 1 : 0) + (user.oauthProviders?.length ?? 0);

    const { updatedAchievements, newUnlocked, totalExpReward: achievementExp } =
      this.achievementsService.checkAchievements(
        user.achievements ?? [],
        {
          chaptersRead: totalChaptersRead,
          bookmarksCount: totalBookmarks,
          userLevel: user.level,
          daysSinceJoined,
          socialConnections,
        },
      );

    if (newUnlocked.length > 0) {
      user.achievements = updatedAchievements;
      
      // Начисляем опыт за достижения (если не бот)
      if (!botDetectionResult.isBot && achievementExp > 0) {
        user.experience += achievementExp;
        
        // Проверяем level up от достижений
        while (user.experience >= this.calculateNextLevelExp(user.level)) {
          user.level += 1;
          const coins = user.level * 10;
          user.balance += coins;
          if (progressEvent) {
            progressEvent.levelUp = true;
            progressEvent.bonusCoins = (progressEvent.bonusCoins ?? 0) + coins;
          }
        }
        
        if (progressEvent) {
          progressEvent.expGained += achievementExp;
          progressEvent.reason += ` + ${achievementExp} XP за достижения`;
        }
      }
      
      this.logger.log(
        `User ${userId} unlocked ${newUnlocked.length} achievement(s): ${newUnlocked.map((a) => `${a.name} (+${a.expReward} XP)`).join(', ')}`,
      );
    }

    // Убираем битые закладки, чтобы не падать на валидации при save
    this.sanitizeBookmarksBeforeSave(user as UserDocument);
    await user.save();
    this.logger.log(`Reading history updated successfully for user ${userId}`);

    return {
      user: {
        _id: user._id.toString(),
        level: user.level,
        experience: user.experience,
        balance: user.balance,
      },
      progress: progressEvent,
      oldRank: oldRankInfo,
      newRank: newRankInfo,
      newAchievements: newUnlocked.length > 0 ? newUnlocked : undefined,
    };
  }

  async getReadingHistory(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      /** Лёгкий формат: только тайтл + последняя глава + readAt, без полного списка глав */
      light?: boolean;
    },
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
    const light = options?.light ?? true;

    let query = this.userModel
      .findById(new Types.ObjectId(userId))
      .populate({
        path: 'readingHistory.titleId',
        select: '_id title slug coverImage type status isAdult',
      })
      .select('readingHistory');
    if (!light) {
      query = query.populate({
        path: 'readingHistory.chapters.chapterId',
        select: '_id chapterNumber title',
      });
    }
    const user = await query;

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // В обратном порядке (новые сначала)
    const fullList = user.readingHistory.slice().reverse();
    const total = fullList.length;
    const start = (page - 1) * limit;
    const slice = fullList.slice(start, start + limit);

    if (light) {
      const lightList = slice.map((entry: any) => {
        const lastChapter =
          entry.chapters?.length > 0
            ? entry.chapters.sort(
                (a: any, b: any) =>
                  new Date(b.readAt).getTime() - new Date(a.readAt).getTime(),
              )[0]
            : null;
        return {
          titleId: entry.titleId,
          readAt: entry.readAt,
          lastChapter: lastChapter
            ? {
                chapterId: lastChapter.chapterId,
                chapterNumber: lastChapter.chapterNumber,
                chapterTitle: lastChapter.chapterTitle,
                readAt: lastChapter.readAt,
              }
            : null,
          chaptersCount: entry.chapters?.length ?? 0,
        };
      });
      return {
        items: lightList,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    }

    const items = slice;
    return {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getTitleReadingHistory(userId: string, titleId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Находим запись для указанного тайтла
    const titleHistory = user.readingHistory.find(
      (entry) => this.getHistoryTitleIdStr(entry) === titleId,
    );

    if (!titleHistory) {
      // Если истории нет, возвращаем пустой массив
      return [];
    }

    const populatedHistory = (await this.userModel.populate(titleHistory, [
      { path: 'titleId', select: '_id title slug coverImage type' },
      { path: 'chapters.chapterId', select: '_id chapterNumber title' },
    ])) as unknown as PopulatedReadingHistoryEntry;

    // Возвращаем главы в обратном порядке (новые сначала)
    return populatedHistory.chapters.slice().reverse();
  }

  /**
   * Лёгкий метод для фронта: только ID и номера прочитанных глав по тайтлу.
   * Удобно для отображения статуса «прочитано» у каждой главы без загрузки полной истории.
   */
  async getTitleReadChapterIds(
    userId: string,
    titleId: string,
  ): Promise<{ chapterIds: string[]; chapterNumbers: number[] }> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('readingHistory');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const entry = user.readingHistory.find(
      (e) => this.getHistoryTitleIdStr(e) === titleId,
    );
    if (!entry?.chapters?.length) {
      return { chapterIds: [], chapterNumbers: [] };
    }

    const chapterIds: string[] = [];
    const chapterNumbers: number[] = [];
    for (const c of entry.chapters) {
      const idStr = this.getHistoryChapterIdStr(c);
      if (idStr) {
        chapterIds.push(idStr);
        chapterNumbers.push(c.chapterNumber ?? 0);
      }
    }
    return { chapterIds, chapterNumbers };
  }

  async clearReadingHistory(userId: string): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { $set: { readingHistory: [] } },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async removeFromReadingHistory(
    userId: string,
    titleId: string,
  ): Promise<User> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { $pull: { readingHistory: { titleId: new Types.ObjectId(titleId) } } },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async removeChapterFromReadingHistory(
    userId: string,
    titleId: string,
    chapterId: string,
  ): Promise<User> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    let chapterObjectId: Types.ObjectId;
    if (Types.ObjectId.isValid(chapterId)) {
      chapterObjectId = new Types.ObjectId(chapterId);
    } else {
      const chapterNumber = parseInt(chapterId, 10);
      if (isNaN(chapterNumber)) {
        throw new BadRequestException('Invalid chapter ID or number');
      }

      const chapter = await this.chaptersService.findByTitleAndNumber(
        titleId,
        chapterNumber,
      );
      if (!chapter) {
        throw new NotFoundException('Chapter not found');
      }
      chapterObjectId = chapter._id;
    }

    // Находим пользователя
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingEntryIndex = user.readingHistory.findIndex(
      (entry) => this.getHistoryTitleIdStr(entry) === titleId,
    );

    if (existingEntryIndex === -1) {
      throw new NotFoundException('Title not found in reading history');
    }

    const existingEntry = user.readingHistory[existingEntryIndex];
    const targetChapterIdStr = chapterObjectId.toString();
    const chapterIndex = existingEntry.chapters.findIndex(
      (chapter) => this.getHistoryChapterIdStr(chapter) === targetChapterIdStr,
    );

    if (chapterIndex === -1) {
      throw new NotFoundException('Chapter not found in reading history');
    }

    // Удаляем главу из массива
    existingEntry.chapters.splice(chapterIndex, 1);

    // Если массив пустой, удаляем всю запись о тайтле
    if (existingEntry.chapters.length === 0) {
      user.readingHistory.splice(existingEntryIndex, 1);
    }

    await user.save();
    return (await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('-password')) as User;
  }

  // 📊 Статистика пользователя
  async getUserStats(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      totalBookmarks: user.bookmarks.length,
      totalRead: user.readingHistory.length,
      lastRead: user.readingHistory[user.readingHistory.length - 1] || null,
      level: user.level,
      experience: user.experience,
      balance: user.balance,
      nextLevelExp: this.calculateNextLevelExp(user.level),
    };
  }

  // 🎯 Leveling system methods
  private calculateNextLevelExp(level: number): number {
    // Simple exponential growth: 100 * level^1.5
    return Math.floor(100 * Math.pow(level, 1.5));
  }

  private static readonly RANK_NAMES = [
    '',
    'Ученик боевых искусств',
    'Царство единого начала - Воин',
    'Царство двойственности - Мастер',
    'Царство трёх начал - Великий мастер',
    'Царство четырёх стихий - Лорд',
    'Царство пяти стихий - Король',
    'Царство шести направлений - Предок',
    'Царство семи созвездий - Повелитель',
    'Царство восьми пустынь - Почётный воин',
    'Царство девяти небес - Боевой император',
  ];

  private levelToRank(level: number): {
    rank: number;
    stars: number;
    name: string;
    minLevel: number;
  } {
    const clampedLevel = Math.max(0, Math.min(90, level));
    let rank = Math.floor(clampedLevel / 10) + 1;
    let stars = (clampedLevel % 10) + 1;

    if (clampedLevel >= 90) {
      rank = 9;
      stars = 9;
    } else if (clampedLevel === 0) {
      rank = 1;
      stars = 1;
    }

    rank = Math.min(9, Math.max(1, rank));
    stars = Math.min(9, Math.max(1, stars));

    return {
      rank,
      stars,
      name: UsersService.RANK_NAMES[rank] || 'Неизвестный ранг',
      minLevel: clampedLevel,
    };
  }

  /** Бонусы за достижение определённых milestone streak */
  private static readonly STREAK_BONUSES: Record<number, number> = {
    7: 50,   // 50 XP за 7 дней подряд
    14: 100, // 100 XP за 14 дней подряд
    21: 150, // 150 XP за 21 день подряд
    30: 250, // 250 XP за 30 дней подряд
  };

  /**
   * Обновляет streak (серию дней активности) пользователя.
   * Возвращает бонус XP за достижение milestone (7, 14, 21, 30 дней).
   */
  private updateStreak(user: UserDocument): number {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastStreakDate = user.lastStreakDate
      ? new Date(user.lastStreakDate)
      : null;

    let streakBonus = 0;

    if (!lastStreakDate) {
      user.currentStreak = 1;
      user.longestStreak = Math.max(user.longestStreak ?? 0, 1);
      user.lastStreakDate = today;
      return 0;
    }

    const lastDate = new Date(
      lastStreakDate.getFullYear(),
      lastStreakDate.getMonth(),
      lastStreakDate.getDate(),
    );
    const diffDays = Math.floor(
      (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      // Уже была активность сегодня — ничего не меняем
      return 0;
    } else if (diffDays === 1) {
      // Активность вчера — продолжаем streak
      user.currentStreak = (user.currentStreak ?? 0) + 1;
      user.longestStreak = Math.max(
        user.longestStreak ?? 0,
        user.currentStreak,
      );
      user.lastStreakDate = today;

      // Проверяем бонус за milestone
      if (UsersService.STREAK_BONUSES[user.currentStreak]) {
        streakBonus = UsersService.STREAK_BONUSES[user.currentStreak];
        this.logger.log(
          `User reached ${user.currentStreak} days streak! Bonus: ${streakBonus} XP`,
        );
      }
    } else {
      // Пропуск более 1 дня — сбрасываем streak
      user.currentStreak = 1;
      user.lastStreakDate = today;
    }

    return streakBonus;
  }

  /**
   * Добавляет время чтения (вызывается при прочтении главы)
   */
  private addReadingTime(user: UserDocument, minutes: number): void {
    user.readingTimeMinutes = (user.readingTimeMinutes ?? 0) + minutes;
  }

  async addExperience(userId: string, expAmount: number): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.experience += expAmount;

    // Check for level up
    let leveledUp = false;
    while (user.experience >= this.calculateNextLevelExp(user.level)) {
      user.level += 1;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      leveledUp = true;
      // Award some balance for leveling up
      user.balance += user.level * 10; // 10 coins per level
    }

    await user.save();
    this.logger.log(
      `User ${userId} gained ${expAmount} XP. Current level: ${user.level}, XP: ${user.experience}`,
    );

    return user;
  }

  /** Опыт за ежедневный вход (раз в день) */
  private static readonly DAILY_LOGIN_EXP = 5;

  /**
   * Начисляет опыт за ежедневный вход (раз в день).
   * Возвращает объект с информацией о начислении или null если уже был вход сегодня.
   */
  async awardDailyLoginExp(
    userId: string,
  ): Promise<{
    expGained: number;
    experience: number;
    level: number;
    levelUp: boolean;
    newLevel?: number;
    oldLevel?: number;
    bonusCoins?: number;
  } | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      return null;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastLoginExpDate = user.lastLoginExpDate
      ? new Date(user.lastLoginExpDate)
      : null;

    // Проверяем, был ли уже вход сегодня
    if (lastLoginExpDate) {
      const lastDate = new Date(
        lastLoginExpDate.getFullYear(),
        lastLoginExpDate.getMonth(),
        lastLoginExpDate.getDate(),
      );
      if (lastDate.getTime() === today.getTime()) {
        // Уже был вход сегодня — не начисляем
        return null;
      }
    }

    // Начисляем опыт за вход
    const oldLevel = user.level;
    user.experience += UsersService.DAILY_LOGIN_EXP;
    user.lastLoginExpDate = today;

    let leveledUp = false;
    let totalBonusCoins = 0;

    while (user.experience >= this.calculateNextLevelExp(user.level)) {
      user.level += 1;
      leveledUp = true;
      const coins = user.level * 10;
      user.balance += coins;
      totalBonusCoins += coins;
    }

    await user.save();

    this.logger.log(
      `User ${userId} awarded ${UsersService.DAILY_LOGIN_EXP} XP for daily login. Current level: ${user.level}, XP: ${user.experience}`,
    );

    return {
      expGained: UsersService.DAILY_LOGIN_EXP,
      experience: user.experience,
      level: user.level,
      levelUp: leveledUp,
      oldLevel: leveledUp ? oldLevel : undefined,
      newLevel: leveledUp ? user.level : undefined,
      bonusCoins: leveledUp ? totalBonusCoins : undefined,
    };
  }

  // 💰 Balance management
  async addBalance(userId: string, amount: number): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    if (amount < 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { $inc: { balance: amount } },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Added ${amount} balance to user ${userId}. New balance: ${user.balance}`,
    );
    return user;
  }

  async deductBalance(userId: string, amount: number): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    if (amount < 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.balance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    user.balance -= amount;
    await user.save();

    this.logger.log(
      `Deducted ${amount} balance from user ${userId}. New balance: ${user.balance}`,
    );
    return user;
  }

  async cleanupOrphanedReferences(): Promise<{
    cleanedBookmarks: number;
    cleanedReadingHistoryTitles: number;
    cleanedReadingHistoryChapters: number;
  }> {
    this.logger.log('Starting cleanup of orphaned references in user data');

    let cleanedBookmarks = 0;
    let cleanedReadingHistoryTitles = 0;
    let cleanedReadingHistoryChapters = 0;

    // Get all users
    const users = await this.userModel.find({}).exec();

    for (const user of users) {
      let userModified = false;

      // Clean bookmarks - remove references to non-existent titles
      if (user.bookmarks && (user.bookmarks as any[]).length > 0) {
        this.normalizeBookmarksIfNeeded(user as UserDocument);
        const currentBookmarks = (user.bookmarks as any[]).slice();
        const validBookmarks: any[] = [];
        for (const bookmark of currentBookmarks) {
          const idStr =
            typeof bookmark === 'string'
              ? bookmark
              : bookmark?.titleId?.toString?.() ?? (bookmark?.titleId as Types.ObjectId)?.toString?.();
          if (!idStr) continue;
          try {
            const titleExists = await this.checkTitleExists(idStr);
            if (titleExists) {
              validBookmarks.push(
                typeof bookmark === 'string'
                  ? { titleId: new Types.ObjectId(bookmark), category: 'reading', addedAt: new Date() }
                  : bookmark,
              );
            } else {
              cleanedBookmarks++;
              this.logger.log(
                `Removed orphaned bookmark ${idStr} from user ${user._id.toString()}`,
              );
            }
          } catch {
            validBookmarks.push(
              typeof bookmark === 'string'
                ? { titleId: new Types.ObjectId(bookmark), category: 'reading', addedAt: new Date() }
                : bookmark,
            );
          }
        }
        if (validBookmarks.length !== currentBookmarks.length) {
          user.bookmarks = validBookmarks as any;
          userModified = true;
        }
      }

      // Clean reading history
      if (user.readingHistory && user.readingHistory.length > 0) {
        const validReadingHistory: typeof user.readingHistory = [];

        for (const historyEntry of user.readingHistory) {
          try {
            // Check if title exists
            const titleExists = await this.checkTitleExists(
              historyEntry.titleId.toString(),
            );
            if (!titleExists) {
              cleanedReadingHistoryTitles++;
              this.logger.log(
                `Removed orphaned reading history entry for title ${historyEntry.titleId.toString()} from user ${user._id.toString()}`,
              );
              continue;
            }

            // Clean chapters within this title's history
            const validChapters: typeof historyEntry.chapters = [];
            for (const chapterEntry of historyEntry.chapters) {
              try {
                const chapterExists = await this.checkChapterExists(
                  chapterEntry.chapterId.toString(),
                );
                if (chapterExists) {
                  validChapters.push(chapterEntry);
                } else {
                  cleanedReadingHistoryChapters++;
                  this.logger.log(
                    `Removed orphaned chapter ${chapterEntry.chapterId.toString()} from reading history of user ${user._id.toString()}`,
                  );
                }
              } catch {
                // If we can't check, keep the chapter
                validChapters.push(chapterEntry);
              }
            }

            // Only keep the title entry if it has valid chapters
            if (validChapters.length > 0) {
              validReadingHistory.push({
                ...historyEntry,
                chapters: validChapters,
              });
            } else {
              cleanedReadingHistoryTitles++;
              this.logger.log(
                `Removed reading history entry with no valid chapters for title ${historyEntry.titleId.toString()} from user ${user._id.toString()}`,
              );
            }
          } catch {
            // If we can't check the title, keep the entry
            validReadingHistory.push(historyEntry);
          }
        }

        if (validReadingHistory.length !== user.readingHistory.length) {
          user.readingHistory = validReadingHistory;
          userModified = true;
        }
      }

      // Save user if modified
      if (userModified) {
        await user.save();
      }
    }

    this.logger.log(
      `Cleanup completed. Removed ${cleanedBookmarks} orphaned bookmarks, ${cleanedReadingHistoryTitles} orphaned reading history titles, and ${cleanedReadingHistoryChapters} orphaned reading history chapters`,
    );

    return {
      cleanedBookmarks,
      cleanedReadingHistoryTitles,
      cleanedReadingHistoryChapters,
    };
  }

  private async checkTitleExists(titleId: string): Promise<boolean> {
    try {
      if (!Types.ObjectId.isValid(titleId)) {
        return false;
      }
      const title = await this.titleModel.findById(titleId).exec();
      return !!title;
    } catch {
      return false;
    }
  }

  private async checkChapterExists(chapterId: string): Promise<boolean> {
    try {
      const chapter = await this.chaptersService.findById(chapterId);
      return !!chapter;
    } catch {
      return false;
    }
  }

  // 🛡️ Bot Detection Methods
  /**
   * Получить подозрительных пользователей (для админов)
   */
  async getSuspiciousUsers(limit: number = 50) {
    return this.botDetectionService.getSuspiciousUsers(limit);
  }

  /**
   * Сбросить статус бота для пользователя (для админов)
   */
  async resetBotStatus(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    await this.botDetectionService.resetBotStatus(userId);
  }

  /**
   * Получить статистику по ботам (для админов)
   */
  async getBotStats(): Promise<{
    totalUsers: number;
    suspectedBots: number;
    confirmedBots: number;
    recentSuspiciousActivities: number;
  }> {
    return this.botDetectionService.getBotStats();
  }

  // 🔒 Privacy Settings Methods

  /**
   * Обновить настройки приватности
   */
  async updatePrivacySettings(
    userId: string,
    privacySettings: {
      profileVisibility?: 'public' | 'friends' | 'private';
      readingHistoryVisibility?: 'public' | 'friends' | 'private';
    },
  ): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const updateFields: Record<string, any> = {};
    if (privacySettings.profileVisibility !== undefined) {
      updateFields['privacy.profileVisibility'] =
        privacySettings.profileVisibility;
    }
    if (privacySettings.readingHistoryVisibility !== undefined) {
      updateFields['privacy.readingHistoryVisibility'] =
        privacySettings.readingHistoryVisibility;
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { $set: updateFields },
        { new: true },
      )
      .select('-password');

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Privacy settings updated for user ${userId}: ${JSON.stringify(privacySettings)}`,
    );
    return updatedUser;
  }

  /**
   * Проверить, может ли указанный пользователь видеть профиль.
   * @param targetUserId — id владельца профиля (для private = только владелец)
   */
  canViewProfile(
    targetUserPrivacy: {
      profileVisibility?: 'public' | 'friends' | 'private';
    } | null,
    viewerId: string | undefined,
    isFriend: boolean,
    targetUserId: string,
  ): boolean {
    if (!targetUserPrivacy) return true;
    const visibility = targetUserPrivacy.profileVisibility ?? 'public';

    switch (visibility) {
      case 'public':
        return true;
      case 'friends':
        return !!viewerId && isFriend;
      case 'private':
        return viewerId === targetUserId;
      default:
        return true;
    }
  }

  /**
   * Проверить, может ли указанный пользователь видеть историю чтения.
   * @param targetUserId — id владельца профиля (для private = только владелец)
   */
  canViewReadingHistory(
    targetUserPrivacy: {
      readingHistoryVisibility?: 'public' | 'friends' | 'private';
    } | null,
    viewerId: string | undefined,
    isFriend: boolean,
    targetUserId: string,
  ): boolean {
    if (!targetUserPrivacy) return false;
    const visibility =
      targetUserPrivacy.readingHistoryVisibility ?? 'private';

    switch (visibility) {
      case 'public':
        return true;
      case 'friends':
        return !!viewerId && isFriend;
      case 'private':
        return viewerId === targetUserId;
      default:
        return false;
    }
  }

  /**
   * Получить профиль пользователя с учётом настроек приватности.
   * @param userId — id пользователя, чей профиль запрашивают
   * @param viewerId — id смотрящего (если авторизован)
   * @param isFriend — является ли смотрящий другом (для friends-only)
   * @returns объект профиля без чувствительных данных; кидает ForbiddenException если профиль скрыт
   */
  async getProfileWithPrivacy(
    userId: string,
    viewerId?: string,
    isFriend: boolean = false,
  ): Promise<Record<string, unknown>> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const targetUser = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('-password')
      .populate({
        path: 'bookmarks.titleId',
        select: '_id title slug coverImage type status isAdult',
      })
      .populate({
        path: 'readingHistory.titleId',
        select: '_id title slug coverImage type',
      })
      .populate({
        path: 'readingHistory.chapters.chapterId',
        select: '_id chapterNumber title',
      })
      .populate({
        path: 'equippedDecorations.avatar',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.frame',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.background',
        select: '_id name imageUrl type rarity',
      })
      .populate({
        path: 'equippedDecorations.card',
        select: '_id name imageUrl type rarity',
      })
      .lean()
      .exec();

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const targetUserId = (targetUser._id as Types.ObjectId).toString();
    const canViewProfile = this.canViewProfile(
      targetUser.privacy ?? null,
      viewerId,
      isFriend,
      targetUserId,
    );

    if (!canViewProfile) {
      throw new ForbiddenException('This profile is private');
    }

    const isOwnProfile = viewerId === targetUserId;
    const showExtendedProfile =
      (targetUser.privacy?.profileVisibility === 'public' || isOwnProfile || isFriend);

    const canViewHistory = this.canViewReadingHistory(
      targetUser.privacy ?? null,
      viewerId,
      isFriend,
      targetUserId,
    );

    const profile: Record<string, unknown> = {
      _id: targetUser._id,
      username: targetUser.username,
      avatar: targetUser.avatar,
      level: targetUser.level ?? 1,
      experience: targetUser.experience ?? 0,
      role: targetUser.role ?? 'user',
      privacy: {
        profileVisibility: targetUser.privacy?.profileVisibility ?? 'public',
        readingHistoryVisibility:
          targetUser.privacy?.readingHistoryVisibility ?? 'private',
      },
    };

    if (showExtendedProfile) {
      profile.firstName = targetUser.firstName;
      profile.lastName = targetUser.lastName;
      profile.bookmarks = this.repairBookmarksPlain(targetUser.bookmarks);
      profile.equippedDecorations = targetUser.equippedDecorations;
      if (isOwnProfile) {
        profile.email = targetUser.email;
      }
    }

    if (canViewHistory) {
      profile.readingHistory = targetUser.readingHistory;
    }

    return profile;
  }

  // 🔔 Notification Settings Methods

  /**
   * Обновить настройки уведомлений
   */
  async updateNotificationSettings(
    userId: string,
    notificationSettings: {
      newChapters?: boolean;
      comments?: boolean;
    },
  ): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const updateFields: Record<string, any> = {};
    if (notificationSettings.newChapters !== undefined) {
      updateFields['notifications.newChapters'] =
        notificationSettings.newChapters;
    }
    if (notificationSettings.comments !== undefined) {
      updateFields['notifications.comments'] = notificationSettings.comments;
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { $set: updateFields },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Notification settings updated for user ${userId}: ${JSON.stringify(notificationSettings)}`,
    );
    return user;
  }

  /**
   * Получить настройки уведомлений пользователя
   */
  async getNotificationSettings(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('notifications');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.notifications;
  }

  // 🎨 Display Settings Methods

  /**
   * Обновить настройки отображения
   */
  async updateDisplaySettings(
    userId: string,
    displaySettings: {
      isAdult?: boolean;
      theme?: 'light' | 'dark' | 'system';
    },
  ): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const updateFields: Record<string, any> = {};
    if (displaySettings.isAdult !== undefined) {
      updateFields['displaySettings.isAdult'] = displaySettings.isAdult;
    }
    if (displaySettings.theme !== undefined) {
      updateFields['displaySettings.theme'] = displaySettings.theme;
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        new Types.ObjectId(userId),
        { $set: updateFields },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (displaySettings.isAdult !== undefined) {
      const key = `${CAN_VIEW_ADULT_CACHE_PREFIX}${userId}`;
      await this.cacheManager.set(key, displaySettings.isAdult !== false, { ttl: CAN_VIEW_ADULT_CACHE_TTL_MS });
    }

    this.logger.log(
      `Display settings updated for user ${userId}: ${JSON.stringify(displaySettings)}`,
    );
    return user;
  }

  /**
   * Получить настройки отображения пользователя
   */
  async getDisplaySettings(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('displaySettings');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.displaySettings;
  }

  /**
   * Получить все настройки пользователя
   */
  async getUserSettings(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('privacy notifications displaySettings');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      privacy: user.privacy,
      notifications: user.notifications,
      displaySettings: user.displaySettings,
    };
  }
}
