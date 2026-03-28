import {
  Injectable,
  Inject,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from '../schemas/notification.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { CommentEntityType } from '../schemas/comment.schema';
import { PushService } from '../push/push.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsGateway } from './notifications.gateway';

const UNREAD_COUNT_CACHE_PREFIX = 'notifications:unread:';
const UNREAD_COUNT_CACHE_TTL_MS = 30 * 1000; // 30 sec
const SITE_URL =
  process.env.SITE_URL || process.env.FRONTEND_URL || 'https://tomilo-lib.ru';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @Inject(CACHE_MANAGER)
    private cacheManager: {
      get: (k: string) => Promise<unknown>;
      set: (k: string, v: unknown, ttl?: number) => Promise<void>;
    },
    private pushService: PushService,
    private subscriptionsService: SubscriptionsService,
    @Optional()
    @Inject(forwardRef(() => NotificationsGateway))
    private notificationsGateway?: NotificationsGateway,
  ) {}

  /** Push unread_count to user over WebSocket (no-op if gateway not available). */
  private async notifyUnreadCount(userId: string): Promise<void> {
    if (!this.notificationsGateway) return;
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        this.notificationsGateway!.emitUnreadCountToUser(userId)
          .catch(() => {})
          .finally(resolve);
      });
    });
  }

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
    const saved = await notification.save();
    await this.notifyUnreadCount(notificationData.userId);
    if (this.notificationsGateway) {
      const id = (saved as any)._id?.toString?.() ?? String((saved as any).id);
      const titleId = (saved as any).titleId?.toString?.();
      const chapterId = (saved as any).chapterId?.toString?.();
      this.notificationsGateway.emitNotificationToUser(
        notificationData.userId,
        {
          _id: id,
          type: (saved as any).type ?? notificationData.type,
          title: (saved as any).title ?? notificationData.title,
          message: (saved as any).message ?? notificationData.message,
          ...(titleId && { titleId }),
          ...(chapterId && { chapterId }),
          ...((saved as any).metadata && { metadata: (saved as any).metadata }),
        },
      );
    }
    return saved;
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

    await this.cacheManager.set(this.unreadCountCacheKey(userId), -1, {
      ttl: 5,
    } as any);
    await this.notifyUnreadCount(userId);
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

    await this.cacheManager.set(this.unreadCountCacheKey(userId), -1, {
      ttl: 5,
    } as any);
    await this.notifyUnreadCount(userId);
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
      await this.cacheManager.set(this.unreadCountCacheKey(userId), -1, {
        ttl: 5,
      } as any);
      await this.notifyUnreadCount(userId);
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

    await this.cacheManager.set(key, count, {
      ttl: UNREAD_COUNT_CACHE_TTL_MS,
    } as any);
    return { count };
  }

  async createNewChapterNotification(
    titleId: string,
    chapterId: string,
    chapterNumber: number,
    titleName: string,
    options?: { titleSlug?: string },
  ): Promise<void> {
    // Пользователи с тайтлом в закладках
    const titleObjectId = Types.ObjectId.isValid(titleId)
      ? new Types.ObjectId(titleId)
      : null;
    const usersWithBookmark = await this.notificationModel.db
      .collection('users')
      .find({
        $or: [
          { bookmarks: titleId },
          ...(titleObjectId ? [{ 'bookmarks.titleId': titleObjectId }] : []),
        ],
      })
      .toArray();

    // Подписчики на тайтл (уведомления о новых главах)
    const subscriberIds =
      await this.subscriptionsService.getSubscriberIdsForNewChapter(titleId);
    const bookmarkUserIds = (usersWithBookmark as any[]).map((u: any) =>
      u._id.toString(),
    );
    const allUserIdsSet = new Set<string>([
      ...bookmarkUserIds,
      ...subscriberIds,
    ]);
    const allUserIds = Array.from(allUserIdsSet);

    const notifications = allUserIds.map((uid) => ({
      userId: new Types.ObjectId(uid),
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
      const inserted = await this.notificationModel.insertMany(notifications);
      for (let i = 0; i < inserted.length; i++) {
        const doc = inserted[i];
        const uid = doc.userId?.toString?.() ?? allUserIds[i];
        await this.notifyUnreadCount(uid);
        if (this.notificationsGateway) {
          const id = (doc as any)._id?.toString?.() ?? String((doc as any).id);
          const titleIdStr = (doc as any).titleId?.toString?.();
          const chapterIdStr = (doc as any).chapterId?.toString?.();
          this.notificationsGateway.emitNotificationToUser(uid, {
            _id: id,
            type: (doc as any).type ?? NotificationType.NEW_CHAPTER,
            title: (doc as any).title ?? '',
            message: (doc as any).message ?? '',
            ...(titleIdStr && { titleId: titleIdStr }),
            ...(chapterIdStr && { chapterId: chapterIdStr }),
            ...((doc as any).metadata && { metadata: (doc as any).metadata }),
          });
        }
      }
    }

    // Web Push: только пользователям с включёнными уведомлениями о новых главах
    const usersWithBookmarkMap = new Map(
      (usersWithBookmark as any[]).map((u: any) => [u._id.toString(), u]),
    );
    const userIdsForPush = allUserIds.filter((uid) => {
      const user = usersWithBookmarkMap.get(uid);
      if (user) return user.notifications?.newChapters !== false;
      return true; // подписчики без закладки — по умолчанию шлём push
    });
    if (userIdsForPush.length > 0 && this.pushService.isConfigured()) {
      const subscriptionMap =
        await this.pushService.getSubscriptionsByUserIds(userIdsForPush);
      if (subscriptionMap.size > 0) {
        const path = options?.titleSlug
          ? `/titles/${options.titleSlug}/chapter/${chapterId}`
          : `/titles/${titleId}/chapter/${chapterId}`;
        const url = `${SITE_URL.replace(/\/$/, '')}${path}`;
        await this.pushService.sendToSubscriptions(subscriptionMap, {
          title: `Новая глава: ${titleName}`,
          body: `Глава ${chapterNumber} доступна для чтения`,
          url,
          tag: `chapter-${chapterId}`,
          data: { titleId, chapterId },
        });
      }
    }
  }

  /**
   * Отправить Web Push всем пользователям с включёнными уведомлениями о новостях.
   * Вызывается при публикации новости/объявления.
   */
  async sendNewsAnnouncementPush(
    announcementTitle: string,
    slug: string,
    announcementId: string,
  ): Promise<{ sent: number; failed: number }> {
    const userIds = await this.userModel
      .find({
        $or: [
          { 'notifications.news': true },
          { 'notifications.news': { $exists: false } },
        ],
      })
      .distinct('_id')
      .exec();
    const userIdStrings = userIds.map((id) => id.toString());
    if (userIdStrings.length === 0 || !this.pushService.isConfigured()) {
      return { sent: 0, failed: 0 };
    }
    const subscriptionMap =
      await this.pushService.getSubscriptionsByUserIds(userIdStrings);
    if (subscriptionMap.size === 0) {
      return { sent: 0, failed: 0 };
    }
    const url = `${SITE_URL.replace(/\/$/, '')}/news/${encodeURIComponent(slug)}`;
    const title =
      announcementTitle.length > 50
        ? `${announcementTitle.slice(0, 47)}…`
        : announcementTitle;
    return this.pushService.sendToSubscriptions(subscriptionMap, {
      title: `Новость: ${title}`,
      body: 'Опубликована новая новость на платформе',
      url,
      tag: `announcement-${announcementId}`,
      data: { announcementId, slug },
    });
  }

  async createSystemNotification(
    userIds: string[],
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const notifications = userIds.map((userId) => ({
      userId: new Types.ObjectId(userId),
      type: NotificationType.SYSTEM,
      title,
      message,
      metadata,
    }));

    if (notifications.length > 0) {
      const inserted = await this.notificationModel.insertMany(notifications);
      for (let i = 0; i < inserted.length; i++) {
        const doc = inserted[i];
        const uid = doc.userId?.toString?.() ?? userIds[i];
        await this.notifyUnreadCount(uid);
        if (this.notificationsGateway) {
          const id = (doc as any)._id?.toString?.() ?? String((doc as any).id);
          this.notificationsGateway.emitNotificationToUser(uid, {
            _id: id,
            type: (doc as any).type ?? NotificationType.SYSTEM,
            title: (doc as any).title ?? title,
            message: (doc as any).message ?? message,
            ...((doc as any).metadata && { metadata: (doc as any).metadata }),
          });
        }
      }
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
      /** Текст нового ответа (для карточки и превью в уведомлениях) */
      replyContentPreview?: string;
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
    const replySnippet = (options.replyContentPreview || '').trim();
    const replyShort =
      replySnippet.length > 0
        ? `${replySnippet.slice(0, 120)}${replySnippet.length > 120 ? '…' : ''}`
        : '';
    const message = replyShort
      ? `${replierUsername} ответил(а): «${replyShort}»${context}${preview}`
      : `${replierUsername} ответил(а) на ваш комментарий${context}${preview}`;
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
        ...(replyShort ? { replyPreview: replyShort } : {}),
        ...(options.titleId ? { titleId: options.titleId } : {}),
        ...(options.chapterId ? { chapterId: options.chapterId } : {}),
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
            ...(options.titleId && {
              titleId: new Types.ObjectId(options.titleId),
            }),
            ...(options.chapterId && {
              chapterId: new Types.ObjectId(options.chapterId),
            }),
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
