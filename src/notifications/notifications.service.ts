import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from '../schemas/notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  async create(notificationData: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    titleId?: string;
    chapterId?: string;
    metadata?: Record<string, any>;
  }): Promise<NotificationDocument> {
    const notification = new this.notificationModel(notificationData);
    return notification.save();
  }

  async findByUserId(
    userId: string,
    {
      page = 1,
      limit = 20,
      isRead,
    }: {
      page?: number;
      limit?: number;
      isRead?: boolean;
    } = {},
  ): Promise<{
    notifications: NotificationDocument[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const skip = (page - 1) * limit;
    const query: any = { userId: new Types.ObjectId(userId) };

    if (isRead !== undefined) {
      query.isRead = isRead;
    }

    const [notifications, total] = await Promise.all([
      this.notificationModel
        .find(query)
        .populate('titleId')
        .populate('chapterId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments(query),
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationDocument> {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(notificationId)
    ) {
      throw new NotFoundException('Invalid user ID or notification ID');
    }

    const notification = await this.notificationModel
      .findOneAndUpdate(
        { _id: notificationId, userId: new Types.ObjectId(userId) },
        { isRead: true },
        { new: true },
      )
      .populate('titleId')
      .populate('chapterId')
      .exec();

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const result = await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { isRead: true },
    );

    return { modifiedCount: result.modifiedCount };
  }

  async delete(userId: string, notificationId: string): Promise<void> {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(notificationId)
    ) {
      throw new NotFoundException('Invalid user ID or notification ID');
    }

    const result = await this.notificationModel.findOneAndDelete({
      _id: notificationId,
      userId: new Types.ObjectId(userId),
    });

    if (!result) {
      throw new NotFoundException('Notification not found');
    }
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const count = await this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });

    return { count };
  }

  async createNewChapterNotification(
    titleId: string,
    chapterId: string,
    chapterNumber: number,
    titleName: string,
  ): Promise<void> {
    // Находим всех пользователей, у которых этот тайтл в закладках
    // Поддержка старого формата (bookmarks: [id]) и нового (bookmarks: [{ titleId }])
    const titleObjectId = Types.ObjectId.isValid(titleId) ? new Types.ObjectId(titleId) : null;
    const usersWithBookmark = await this.notificationModel.db
      .collection('users')
      .find({
        $or: [
          { bookmarks: titleId },
          ...(titleObjectId ? [{ 'bookmarks.titleId': titleObjectId }] : []),
        ],
      })
      .toArray();

    const notifications = usersWithBookmark.map((user) => ({
      userId: user._id,
      type: NotificationType.NEW_CHAPTER,
      title: `Новая глава в "${titleName}"`,
      message: `Глава ${chapterNumber} теперь доступна для чтения`,
      titleId,
      chapterId,
      metadata: {
        chapterNumber,
        titleName,
      },
    }));

    if (notifications.length > 0) {
      await this.notificationModel.insertMany(notifications);
    }
  }

  async createSystemNotification(
    userIds: string[],
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const notifications = userIds.map((userId) => ({
      userId,
      type: NotificationType.SYSTEM,
      title,
      message,
      metadata,
    }));

    if (notifications.length > 0) {
      await this.notificationModel.insertMany(notifications);
    }
  }
}
