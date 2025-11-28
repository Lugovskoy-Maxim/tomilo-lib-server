import { Model, Types } from 'mongoose';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilesService } from '../files/files.service';
import { ChaptersService } from '../chapters/chapters.service';
import { LoggerService } from '../common/logger/logger.service';
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
    private filesService: FilesService,
    private chaptersService: ChaptersService,
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

  async findById(id: string): Promise<User> {
    this.logger.log(`Finding user by ID: ${id}`);
    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid user ID format: ${id}`);
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(id)
      .select('-password')
      .populate('bookmarks')
      .populate('readingHistory.titleId')
      .populate('readingHistory.chapters.chapterId');

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

    const user = await this.userModel
      .findById(id)
      .select('-password -readingHistory')
      .populate('bookmarks');

    if (!user) {
      this.logger.warn(`User not found with ID: ${id}`);
      throw new NotFoundException('User not found');
    }
    this.logger.log(`User profile found with ID: ${id}`);
    return user;
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

    const user = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async delete(id: string): Promise<void> {
    this.logger.log(`Deleting user with ID: ${id}`);
    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid user ID format: ${id}`);
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(id);
    if (!user) {
      this.logger.warn(`User not found with ID: ${id}`);
      throw new NotFoundException('User not found');
    }

    // Удаляем файлы пользователя (аватар)
    await this.filesService.deleteUserFolder(id);

    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) {
      this.logger.warn(`User not found with ID: ${id} during deletion`);
      throw new NotFoundException('User not found');
    }
    this.logger.log(`User deleted successfully with ID: ${id}`);
  }

  // 🔖 Методы для работы с закладками
  async addBookmark(userId: string, titleId: string): Promise<User> {
    this.logger.log(`Adding bookmark for user ${userId} to title ${titleId}`);
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      this.logger.warn(`Invalid user ID ${userId} or title ID ${titleId}`);
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $addToSet: { bookmarks: titleId } },
        { new: true },
      )
      .select('-password');

    if (!user) {
      this.logger.warn(`User not found with ID: ${userId}`);
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Bookmark added successfully for user ${userId} to title ${titleId}`,
    );
    return user;
  }

  async removeBookmark(userId: string, titleId: string): Promise<User> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $pull: { bookmarks: titleId } },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getUserBookmarks(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(userId)
      .populate('bookmarks')
      .select('bookmarks');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.bookmarks;
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
      .findByIdAndUpdate(userId, { avatar: avatarPath }, { new: true })
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

    const user = await this.userModel.findById(userId).select('avatar');
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
      .findByIdAndUpdate(userId, { $unset: { avatar: 1 } }, { new: true })
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // 📖 Методы для работы с историей чтения
  async addToReadingHistory(
    userId: string,
    titleId: string,
    chapterId: string,
  ): Promise<User> {
    this.logger.log(
      `Adding to reading history for user ${userId}, title ${titleId}, chapter ${chapterId}`,
    );
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      this.logger.warn(`Invalid user ID ${userId} or title ID ${titleId}`);
      throw new BadRequestException('Invalid user ID or title ID');
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
    const user = await this.userModel.findById(userId);
    if (!user) {
      this.logger.warn(`User not found with ID: ${userId}`);
      throw new NotFoundException('User not found');
    }

    // Ищем существующую запись для этого тайтла
    const existingEntryIndex = user.readingHistory.findIndex(
      (entry) => entry.titleId.toString() === titleIdStr,
    );

    const currentTime = new Date();

    if (existingEntryIndex !== -1) {
      // Тайтл уже есть в истории - обновляем его
      const existingEntry = user.readingHistory[existingEntryIndex];

      // Ищем, есть ли уже такая глава
      const existingChapterIndex = existingEntry.chapters.findIndex(
        (chapter) =>
          chapter.chapterId.toString() === chapterObjectId.toString(),
      );

      if (existingChapterIndex !== -1) {
        // Глава уже есть - обновляем время чтения
        existingEntry.chapters[existingChapterIndex].readAt = currentTime;
        this.logger.log(
          `Updated read time for existing chapter in user ${userId}'s history`,
        );
      } else {
        // Главы нет - добавляем новую
        existingEntry.chapters.push({
          chapterId: chapterObjectId,
          chapterNumber,
          chapterTitle,
          readAt: currentTime,
        });
        this.logger.log(
          `Added new chapter to existing title in user ${userId}'s history`,
        );
      }

      // Обновляем время чтения тайтла
      existingEntry.readAt = currentTime;
    } else {
      // Тайтла нет в истории - создаем новую запись
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

      // Добавляем в начало и ограничиваем размер
      user.readingHistory.unshift(newEntry);
      if (user.readingHistory.length > 10000) {
        user.readingHistory = user.readingHistory.slice(0, 10000);
      }
      this.logger.log(`Added new title to user ${userId}'s reading history`);
    } // <- Добавлена закрывающая скобка для блока else

    // Award experience for reading
    await this.addExperience(userId, 10); // 10 XP per chapter read

    // Сохраняем изменения
    await user.save();
    this.logger.log(`Reading history updated successfully for user ${userId}`);
    return (await this.userModel.findById(userId).select('-password')) as User;
  }

  async getReadingHistory(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(userId)
      .populate('readingHistory.titleId')
      .populate('readingHistory.chapters.chapterId')
      .select('readingHistory');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Возвращаем в обратном порядке (новые сначала)
    return user.readingHistory.slice().reverse();
  }

  async getTitleReadingHistory(userId: string, titleId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Находим запись для указанного тайтла
    const titleHistory = user.readingHistory.find(
      (entry) => entry.titleId.toString() === titleId,
    );

    if (!titleHistory) {
      // Если истории нет, возвращаем пустой массив
      return [];
    }

    // Популируем информацию о тайтле и главах
    const populatedHistory = (await this.userModel.populate(titleHistory, [
      { path: 'titleId' },
      { path: 'chapters.chapterId' },
    ])) as unknown as PopulatedReadingHistoryEntry;

    // Возвращаем главы в обратном порядке (новые сначала)
    return populatedHistory.chapters.slice().reverse();
  }

  async clearReadingHistory(userId: string): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
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
        userId,
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
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingEntryIndex = user.readingHistory.findIndex(
      (entry) => entry.titleId.toString() === titleId,
    );

    if (existingEntryIndex === -1) {
      throw new NotFoundException('Title not found in reading history');
    }

    const existingEntry = user.readingHistory[existingEntryIndex];
    const chapterIndex = existingEntry.chapters.findIndex(
      (chapter) => chapter.chapterId.toString() === chapterObjectId.toString(),
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
    return (await this.userModel.findById(userId).select('-password')) as User;
  }

  // 📊 Статистика пользователя
  async getUserStats(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
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

  async addExperience(userId: string, expAmount: number): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
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

  // 💰 Balance management
  async addBalance(userId: string, amount: number): Promise<User> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    if (amount < 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $inc: { balance: amount } }, { new: true })
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

    const user = await this.userModel.findById(userId);
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
}
