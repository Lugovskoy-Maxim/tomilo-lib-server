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
    if (Types.ObjectId.isValid(chapterId)) {
      // Это ObjectId главы
      chapterObjectId = new Types.ObjectId(chapterId);
    } else {
      // Это номер главы, нужно найти ObjectId
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

    // Создаем запись о прочитанной главе
    const chapterEntry = {
      chapterId: chapterObjectId,
      readAt: new Date(),
    };

    // Используем атомарную операцию MongoDB для обновления/добавления записи
    // Если запись с таким titleId уже существует, добавляем главу к существующей записи
    // Если нет - добавляем новую запись тайтла с этой главой
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $pull: { readingHistory: { titleId: new Types.ObjectId(titleId) } }, // Удаляем существующую запись тайтла
        },
        { new: false }, // Не возвращаем обновленный документ
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Проверяем, есть ли уже записи в истории чтения для получения существующих глав
    const existingHistoryEntry = user.readingHistory?.find(
      (entry) => entry.titleId.toString() === titleId,
    );

    // Формируем массив глав, добавляя новую главу к существующим (если есть)
    let chaptersArray = [chapterEntry];
    if (existingHistoryEntry && existingHistoryEntry.chapters) {
      // Добавляем существующие главы, но проверяем, чтобы не было дубликатов
      const existingChapters = existingHistoryEntry.chapters.filter(
        (chapter) => chapter.chapterId.toString() !== chapterId,
      );
      chaptersArray = [...existingChapters, chapterEntry];
    }

    // Создаем новую запись тайтла с массивом глав
    const titleHistoryEntry = {
      titleId: new Types.ObjectId(titleId),
      chapters: chaptersArray,
    };

    // Добавляем обновленную запись тайтла в начало массива истории чтения
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $push: {
            readingHistory: {
              $each: [titleHistoryEntry],
              $position: 0, // Добавляем в начало
              $slice: 100, // Храним только последние 100 записей тайтлов
            },
          },
        },
        { new: true }, // Возвращаем обновленный документ
      )
      .select('-password');

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }

  async getReadingHistory(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(userId)
      .populate('readingHistory.titleId')
      // Для новой структуры populate для chapterId не нужен, так как он теперь вложенный
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
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(titleId) ||
      !Types.ObjectId.isValid(chapterId)
    ) {
      throw new BadRequestException('Invalid user ID, title ID or chapter ID');
    }

    // Удаляем конкретную главу из записи тайтла в истории чтения
    const user = await this.userModel
      .findOneAndUpdate(
        {
          _id: userId,
          'readingHistory.titleId': new Types.ObjectId(titleId),
        },
        {
          $pull: {
            'readingHistory.$.chapters': {
              chapterId: new Types.ObjectId(chapterId),
            },
          },
        },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User or title not found');
    }

    // Если после удаления главы массив chapters стал пустым, удаляем всю запись тайтла
    const titleEntry = user.readingHistory.find(
      (entry) => entry.titleId.toString() === titleId,
    );
    if (
      titleEntry &&
      (!titleEntry.chapters || titleEntry.chapters.length === 0)
    ) {
      // Удаляем всю запись тайтла, если в ней нет глав
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            $pull: {
              readingHistory: { titleId: new Types.ObjectId(titleId) },
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

    return user;
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

    // Для новой структуры подсчитываем общее количество прочитанных глав
    let totalReadChapters = 0;
    if (user.readingHistory) {
      totalReadChapters = user.readingHistory.reduce(
        (total, entry) => total + (entry.chapters ? entry.chapters.length : 0),
        0,
      );
    }

    return {
      totalBookmarks: user.bookmarks.length,
      totalRead: totalReadChapters,
      lastRead: user.readingHistory[user.readingHistory.length - 1] || null,
    };
  }
}
