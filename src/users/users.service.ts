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

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private filesService: FilesService,
    private chaptersService: ChaptersService,
  ) {}

  async findAll({
    page,
    limit,
    search,
  }: {
    page: number;
    limit: number;
    search: string;
  }) {
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
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(id).select('-password');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email });
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { email, username } = createUserDto;

    // Проверка на существующего пользователя
    const existingUser = await this.userModel.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this email or username already exists',
      );
    }

    const user = new this.userModel(createUserDto);
    return user.save();
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
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Удаляем файлы пользователя (аватар)
    await this.filesService.deleteUserFolder(id);

    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('User not found');
    }
  }

  // 🔖 Методы для работы с закладками
  async addBookmark(userId: string, titleId: string): Promise<User> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
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
      throw new NotFoundException('User not found');
    }

    return user;
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

  // 📖 Методы для работы с историей чтения
  async addToReadingHistory(
    userId: string,
    titleId: string,
    chapterId: string, // Может быть ObjectId или номером главы
  ): Promise<User> {
    // Проверка валидности ID пользователя и titleId
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid user ID or title ID');
    }

    // Проверяем, является ли chapterId ObjectId или номером главы
    let chapterObjectId: Types.ObjectId;
    let chapterNumber: number;
    let chapterTitle: string | undefined;
    if (Types.ObjectId.isValid(chapterId)) {
      // Это ObjectId главы
      chapterObjectId = new Types.ObjectId(chapterId);
      const chapter = await this.chaptersService.findById(chapterId);
      if (!chapter) {
        throw new NotFoundException('Chapter not found');
      }
      chapterNumber = chapter.chapterNumber;
      chapterTitle = chapter.name || undefined;
    } else {
      // Это номер главы, нужно найти ObjectId
      chapterNumber = parseInt(chapterId, 10);
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
      chapterTitle = chapter.name || undefined;
    }

    // Ищем существующую запись в истории чтения по titleId
    const user = await this.userModel.findById(userId).select('readingHistory');
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingEntryIndex = user.readingHistory.findIndex(
      (entry) => entry.titleId.toString() === titleId,
    );

    if (existingEntryIndex !== -1) {
      // Если тайтл уже есть в истории, проверяем, есть ли такая глава
      const existingEntry = user.readingHistory[existingEntryIndex];
      // Нормализуем chapters в массив объектов (для совместимости со старыми данными)
      let chapters = existingEntry.chapters || [];
      if (existingEntry.chapterId) {
        // Старые данные: chapterId - массив или одиночный
        const chapterIds = Array.isArray(existingEntry.chapterId)
          ? existingEntry.chapterId
          : [existingEntry.chapterId];
        chapters = chapterIds.map((id) => ({
          chapterId: id instanceof Types.ObjectId ? id : new Types.ObjectId(id),
          chapterNumber: 0, // Заглушка, можно обновить позже
          chapterTitle: undefined,
        }));
      }
      const chapterExists = chapters.some((c) =>
        c.chapterId.equals(chapterObjectId),
      );

      if (!chapterExists) {
        // Если главы нет, добавляем её к существующей записи
        const chapterData = {
          chapterId: chapterObjectId,
          chapterNumber,
          chapterTitle,
        };

        await this.userModel.findOneAndUpdate(
          {
            _id: userId,
            'readingHistory.titleId': new Types.ObjectId(titleId),
          },
          {
            $push: {
              'readingHistory.$.chapters': chapterData,
            },
            $set: {
              'readingHistory.$.readAt': new Date(),
            },
          },
          { new: true },
        );

        // Также обновляем старые данные, если они есть
        if (existingEntry.chapterId) {
          await this.userModel.findOneAndUpdate(
            {
              _id: userId,
              'readingHistory.titleId': new Types.ObjectId(titleId),
            },
            {
              $unset: { 'readingHistory.$.chapterId': 1 },
            },
            { new: true },
          );
        }

        const user = await this.userModel.findById(userId).select('-password');
        if (!user) {
          throw new NotFoundException('User not found');
        }
        return user;
      } else {
        // Если глава уже есть, ничего не делаем
        const user = await this.userModel.findById(userId).select('-password');
        if (!user) {
          throw new NotFoundException('User not found');
        }
        return user;
      }
    } else {
      // Если тайтла нет в истории, создаем новую запись
      const historyEntry = {
        titleId: new Types.ObjectId(titleId),
        chapters: [
          {
            chapterId: chapterObjectId,
            chapterNumber,
            chapterTitle,
          },
        ],
        readAt: new Date(),
      };

      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            $push: {
              readingHistory: {
                $each: [historyEntry],
                $position: 0, // Добавляем в начало
                $slice: 100, // Храним только последние 100 записей
              },
            },
          },
          { new: true },
        )
        .select('-password');

      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      return updatedUser;
    }
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

    return user.readingHistory.reverse(); // Новые сначала
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

    // Проверяем, является ли chapterId ObjectId или номером главы
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

    // Ищем запись в истории чтения по titleId
    const user = await this.userModel.findById(userId).select('readingHistory');
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
    // Нормализуем chapters в массив объектов
    let chapters = existingEntry.chapters || [];
    if (existingEntry.chapterId) {
      // Старые данные: chapterId - массив или одиночный
      const chapterIds = Array.isArray(existingEntry.chapterId)
        ? existingEntry.chapterId
        : [existingEntry.chapterId];
      chapters = chapterIds.map((id) => ({
        chapterId: id instanceof Types.ObjectId ? id : new Types.ObjectId(id),
        chapterNumber: 0, // Заглушка
        chapterTitle: undefined,
      }));
    }
    const chapterIndex = chapters.findIndex((c) =>
      c.chapterId.equals(chapterObjectId),
    );

    if (chapterIndex === -1) {
      throw new NotFoundException('Chapter not found in reading history');
    }

    // Удаляем главу из массива
    chapters.splice(chapterIndex, 1);

    // Если массив пустой, удаляем всю запись о тайтле
    if (chapters.length === 0) {
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            $pull: { readingHistory: { titleId: new Types.ObjectId(titleId) } },
          },
          { new: true },
        )
        .select('-password');

      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      return updatedUser;
    } else {
      // Иначе обновляем запись
      await this.userModel.findOneAndUpdate(
        { _id: userId, 'readingHistory.titleId': new Types.ObjectId(titleId) },
        {
          $set: {
            'readingHistory.$.chapters': chapters,
          },
        },
        { new: true },
      );

      // Удаляем старые данные, если они есть
      if (existingEntry.chapterId) {
        await this.userModel.findOneAndUpdate(
          {
            _id: userId,
            'readingHistory.titleId': new Types.ObjectId(titleId),
          },
          {
            $unset: { 'readingHistory.$.chapterId': 1 },
          },
          { new: true },
        );
      }

      const user = await this.userModel.findById(userId).select('-password');
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    }
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
    };
  }
}
