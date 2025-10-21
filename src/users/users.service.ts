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

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private filesService: FilesService,
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
    chapterId: string,
  ): Promise<User> {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(titleId) ||
      !Types.ObjectId.isValid(chapterId)
    ) {
      throw new BadRequestException('Invalid user ID, title ID or chapter ID');
    }

    const historyEntry = {
      titleId: new Types.ObjectId(titleId),
      chapterId: new Types.ObjectId(chapterId),
      readAt: new Date(),
    };

    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $push: {
            readingHistory: {
              $each: [historyEntry],
              $slice: -100, // Храним только последние 100 записей
            },
          },
        },
        { new: true },
      )
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getReadingHistory(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(userId)
      .populate('readingHistory.titleId')
      .populate('readingHistory.chapterId')
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
