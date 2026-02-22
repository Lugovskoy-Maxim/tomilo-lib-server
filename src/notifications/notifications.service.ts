import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from '../schemas/notification.schema';
import { CommentEntityType } from '../schemas/comment.schema';

const UNREAD_COUNT_CACHE_PREFIX = 'notifications:unread:';
const UNREAD_COUNT_CACHE_TTL_MS = 30 * 1000; // 30 sec

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @Inject(CACHE_MANAGER)
    private cacheManager: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown, ttl?: number) => Promise<void> },
  ) {}

  private unreadCountCacheKey(userId: string): string {
    return `${UNREAD_COUNT_CACHE_PREFIX}${userId}`;
  }

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

    await this.cacheManager.set(this.unreadCountCacheKey(userId), -1, { ttl: 5 } as any);
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

    await this.cacheManager.set(this.unreadCountCacheKey(userId), -1, { ttl: 5 } as any);
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

    if (!result.isRead) {
      await this.cacheManager.set(this.unreadCountCacheKey(userId), -1, { ttl: 5 } as any);
    }
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid user ID');
    }

    const key = this.unreadCountCacheKey(userId);
    const cached = await this.cacheManager.get(key);
    if (typeof cached === 'number' && cached >= 0) {
      return { count: cached };
    }

    const count = await this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });

    await this.cacheManager.set(key, count, { ttl: UNREAD_COUNT_CACHE_TTL_MS } as any);
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

  /**
   * Уведомление автору комментария о новом ответе.
   * recipientUserId — автор родительского комментария (кому шлём).
   */
  async createCommentReplyNotification(
    recipientUserId: string,
    replierUsername: string,
    commentId: string,
    entityType: CommentEntityType,
    entityId: string,
    options: {
      titleId?: string;
      chapterId?: string;
      entityName?: string;
      parentContentPreview?: string;
    } = {},
  ): Promise<NotificationDocument | null> {
    if (recipientUserId == null || !Types.ObjectId.isValid(recipientUserId)) {
      return null;
    }
    const title = 'Ответ на ваш комментарий';
    const context = options.entityName ? ` (${options.entityName})` : '';
    const preview = options.parentContentPreview
      ? `: «${(options.parentContentPreview || '').slice(0, 60)}${(options.parentContentPreview?.length ?? 0) > 60 ? '…' : ''}»`
      : '';
    const message = `${replierUsername} ответил(а) на ваш комментарий${context}${preview}`;
    return this.create({
      userId: recipientUserId,
      type: NotificationType.COMMENT_REPLY,
      title,
      message,
      titleId: options.titleId,
      chapterId: options.chapterId,
      metadata: {
        commentId,
        entityType,
        entityId,
        replierUsername,
      },
    });
  }

  /**
   * Группировка реакций: одно непрочитанное уведомление на комментарий.
   * При новой реакции — найти существующее непрочитанное COMMENT_REACTIONS для этого комментария и обновить счётчик, иначе создать новое.
   */
  async createOrUpdateReactionsNotification(
    commentOwnerId: string,
    commentId: string,
    reactorUsername: string,
    emoji: string,
    totalReactionsCount: number,
    options: {
      titleId?: string;
      chapterId?: string;
      entityType?: CommentEntityType;
      entityId?: string;
    } = {},
  ): Promise<NotificationDocument | null> {
    if (commentOwnerId == null || !Types.ObjectId.isValid(commentOwnerId)) {
      return null;
    }
    const ownerOid = new Types.ObjectId(commentOwnerId);
    const existing = await this.notificationModel.findOne({
      userId: ownerOid,
      type: NotificationType.COMMENT_REACTIONS,
      isRead: false,
      'metadata.commentId': commentId,
    });

    const title = 'Реакции на ваш комментарий';
    const message =
      totalReactionsCount <= 1
        ? `${reactorUsername} поставил(а) ${emoji} на ваш комментарий`
        : `${totalReactionsCount} человек поставили реакции на ваш комментарий`;

    if (existing) {
      const updated = await this.notificationModel.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            message,
            'metadata.reactionsCount': totalReactionsCount,
            'metadata.lastReactorUsername': reactorUsername,
            'metadata.lastEmoji': emoji,
            ...(options.titleId && { titleId: new Types.ObjectId(options.titleId) }),
            ...(options.chapterId && { chapterId: new Types.ObjectId(options.chapterId) }),
          },
        },
        { new: true },
      );
      return updated;
    }

    return this.create({
      userId: commentOwnerId,
      type: NotificationType.COMMENT_REACTIONS,
      title,
      message,
      titleId: options.titleId,
      chapterId: options.chapterId,
      metadata: {
        commentId,
        reactionsCount: totalReactionsCount,
        lastReactorUsername: reactorUsername,
        lastEmoji: emoji,
        entityType: options.entityType,
        entityId: options.entityId,
      },
    });
  }
}
