import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import * as os from 'os';
import { User, UserDocument } from '../schemas/user.schema';
import { Title, TitleDocument } from '../schemas/title.schema';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { Comment, CommentDocument } from '../schemas/comment.schema';
import { AdminLog, AdminLogDocument } from '../schemas/admin-log.schema';
import { LoggerService } from '../common/logger/logger.service';
import { escapeRegex } from '../common/utils/regex.util';

type CacheStore = {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<void>;
  del: (k: string) => Promise<void>;
  reset?: () => Promise<void>;
};

@Injectable()
export class AdminService {
  private readonly logger = new LoggerService();
  private startTime = Date.now();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(AdminLog.name) private adminLogModel: Model<AdminLogDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: CacheStore,
    @InjectConnection() private connection: Connection,
  ) {
    this.logger.setContext(AdminService.name);
  }

  private async logAction(
    adminId: string,
    action: string,
    details?: Record<string, any>,
    targetType?: string,
    targetId?: string,
  ): Promise<void> {
    try {
      await this.adminLogModel.create({
        adminId: new Types.ObjectId(adminId),
        action,
        details,
        targetType,
        targetId: targetId ? new Types.ObjectId(targetId) : undefined,
      });
    } catch (error) {
      this.logger.error('Failed to log admin action', error);
    }
  }

  async getDashboardStats(): Promise<{
    users: { total: number; newToday: number; newThisWeek: number };
    titles: {
      total: number;
      byType: Record<string, number>;
      byStatus: Record<string, number>;
    };
    chapters: { total: number; newToday: number };
    comments: { total: number; newToday: number; pendingReports: number };
    activity: { activeUsersToday: number; activeUsersWeek: number };
  }> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      totalTitles,
      titlesByType,
      titlesByStatus,
      totalChapters,
      newChaptersToday,
      totalComments,
      newCommentsToday,
      activeUsersToday,
      activeUsersWeek,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.titleModel.countDocuments(),
      this.titleModel.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      this.titleModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.chapterModel.countDocuments(),
      this.chapterModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      this.commentModel.countDocuments(),
      this.commentModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      this.userModel.countDocuments({ lastActivityAt: { $gte: startOfDay } }),
      this.userModel.countDocuments({ lastActivityAt: { $gte: startOfWeek } }),
    ]);

    const byType: Record<string, number> = {};
    for (const item of titlesByType) {
      byType[item._id || 'unknown'] = item.count;
    }

    const byStatus: Record<string, number> = {};
    for (const item of titlesByStatus) {
      byStatus[item._id || 'unknown'] = item.count;
    }

    return {
      users: {
        total: totalUsers,
        newToday: newUsersToday,
        newThisWeek: newUsersThisWeek,
      },
      titles: {
        total: totalTitles,
        byType,
        byStatus,
      },
      chapters: {
        total: totalChapters,
        newToday: newChaptersToday,
      },
      comments: {
        total: totalComments,
        newToday: newCommentsToday,
        pendingReports: 0,
      },
      activity: {
        activeUsersToday,
        activeUsersWeek,
      },
    };
  }

  async getDashboardChartData(days: number): Promise<{
    dates: string[];
    users: number[];
    chapters: number[];
    comments: number[];
  }> {
    const now = new Date();
    const dates: string[] = [];
    const usersData: number[] = [];
    const chaptersData: number[] = [];
    const commentsData: number[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      dates.push(startOfDay.toISOString().split('T')[0]);

      const [usersCount, chaptersCount, commentsCount] = await Promise.all([
        this.userModel.countDocuments({
          createdAt: { $gte: startOfDay, $lt: endOfDay },
        }),
        this.chapterModel.countDocuments({
          createdAt: { $gte: startOfDay, $lt: endOfDay },
        }),
        this.commentModel.countDocuments({
          createdAt: { $gte: startOfDay, $lt: endOfDay },
        }),
      ]);

      usersData.push(usersCount);
      chaptersData.push(chaptersCount);
      commentsData.push(commentsCount);
    }

    return {
      dates,
      users: usersData,
      chapters: chaptersData,
      comments: commentsData,
    };
  }

  async getRecentActivity(limit: number): Promise<any[]> {
    const [recentUsers, recentChapters, recentComments] = await Promise.all([
      this.userModel
        .find()
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 20))
        .select('username email createdAt avatar')
        .lean(),
      this.chapterModel
        .find()
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 20))
        .select('chapterNumber titleId createdAt')
        .populate('titleId', 'name slug')
        .lean(),
      this.commentModel
        .find()
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 20))
        .select('content userId entityType entityId createdAt')
        .populate('userId', 'username avatar')
        .lean(),
    ]);

    const activities: any[] = [];

    for (const user of recentUsers) {
      activities.push({
        type: 'user_registered',
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
        timestamp: (user as any).createdAt,
      });
    }

    for (const chapter of recentChapters) {
      const title = chapter.titleId as any;
      activities.push({
        type: 'chapter_added',
        data: {
          id: chapter._id,
          chapterNumber: chapter.chapterNumber,
          titleName: title?.name,
          titleSlug: title?.slug,
        },
        timestamp: (chapter as any).createdAt,
      });
    }

    for (const comment of recentComments) {
      const user = comment.userId as any;
      activities.push({
        type: 'comment_added',
        data: {
          id: comment._id,
          content: comment.content?.substring(0, 100),
          username: user?.username,
          entityType: comment.entityType,
        },
        timestamp: (comment as any).createdAt,
      });
    }

    activities.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return activities.slice(0, limit);
  }

  async banUser(
    userId: string,
    adminId: string,
    reason?: string,
    durationHours?: number,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'admin') {
      throw new BadRequestException('Cannot ban an admin user');
    }

    user.role = 'banned';
    await user.save();

    await this.logAction(
      adminId,
      'ban_user',
      { reason, durationHours },
      'user',
      userId,
    );

    return user;
  }

  async unbanUser(userId: string, adminId: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== 'banned') {
      throw new BadRequestException('User is not banned');
    }

    user.role = 'user';
    await user.save();

    await this.logAction(adminId, 'unban_user', {}, 'user', userId);

    return user;
  }

  async changeUserRole(
    userId: string,
    newRole: string,
    adminId: string,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const validRoles = ['user', 'moderator', 'admin'];
    if (!validRoles.includes(newRole)) {
      throw new BadRequestException(
        `Invalid role. Valid roles: ${validRoles.join(', ')}`,
      );
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldRole = user.role;
    user.role = newRole;
    await user.save();

    await this.logAction(
      adminId,
      'change_role',
      { oldRole, newRole },
      'user',
      userId,
    );

    return user;
  }

  /**
   * Список тайтлов для админки с фильтром по публикации.
   * @param isPublished true — только опубликованные, false — только неопубликованные, undefined — все
   */
  async getTitles(options: {
    page?: number;
    limit?: number;
    isPublished?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    titles: TitleDocument[];
    pagination: { total: number; page: number; limit: number; pages: number };
  }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const sortBy = options.sortBy ?? 'createdAt';
    const sortOrder = options.sortOrder ?? 'desc';

    const query: Record<string, unknown> = {};
    if (options.isPublished === true) query.isPublished = true;
    if (options.isPublished === false) query.isPublished = false;

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'desc' ? -1 : 1,
    };

    const [titles, total] = await Promise.all([
      this.titleModel
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select(
          'name slug _id status type isPublished totalChapters createdAt updatedAt chaptersRemovedByCopyrightHolder',
        )
        .lean()
        .exec(),
      this.titleModel.countDocuments(query),
    ]);

    return {
      titles: titles as TitleDocument[],
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async bulkDeleteTitles(
    ids: string[],
    adminId: string,
  ): Promise<{ deletedCount: number }> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No title IDs provided');
    }

    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      throw new BadRequestException('No valid title IDs provided');
    }

    const objectIds = validIds.map((id) => new Types.ObjectId(id));

    await this.chapterModel.deleteMany({ titleId: { $in: objectIds } });

    const result = await this.titleModel.deleteMany({
      _id: { $in: objectIds },
    });

    await this.logAction(adminId, 'bulk_delete_titles', {
      count: result.deletedCount,
      ids: validIds,
    });

    return { deletedCount: result.deletedCount };
  }

  async bulkUpdateTitles(
    ids: string[],
    update: Record<string, any>,
    adminId: string,
  ): Promise<{ modifiedCount: number }> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No title IDs provided');
    }

    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      throw new BadRequestException('No valid title IDs provided');
    }

    const allowedFields = [
      'status',
      'type',
      'genres',
      'tags',
      'ageLimit',
      'isHidden',
    ];
    const sanitizedUpdate: Record<string, any> = {};

    for (const key of Object.keys(update)) {
      if (allowedFields.includes(key)) {
        sanitizedUpdate[key] = update[key];
      }
    }

    if (Object.keys(sanitizedUpdate).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    const objectIds = validIds.map((id) => new Types.ObjectId(id));

    const result = await this.titleModel.updateMany(
      { _id: { $in: objectIds } },
      { $set: sanitizedUpdate },
    );

    await this.logAction(adminId, 'bulk_update_titles', {
      count: result.modifiedCount,
      ids: validIds,
      update: sanitizedUpdate,
    });

    return { modifiedCount: result.modifiedCount };
  }

  async getCommentsStats(): Promise<{
    total: number;
    byEntityType: Record<string, number>;
    topCommenters: { userId: string; username: string; count: number }[];
    hiddenCount: number;
  }> {
    const [total, byEntityType, topCommenters, hiddenCount] = await Promise.all(
      [
        this.commentModel.countDocuments(),
        this.commentModel.aggregate([
          { $group: { _id: '$entityType', count: { $sum: 1 } } },
        ]),
        this.commentModel.aggregate([
          { $group: { _id: '$userId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          {
            $project: {
              userId: '$_id',
              username: '$user.username',
              count: 1,
            },
          },
        ]),
        this.commentModel.countDocuments({ isVisible: false }),
      ],
    );

    const byType: Record<string, number> = {};
    for (const item of byEntityType) {
      byType[item._id || 'unknown'] = item.count;
    }

    return {
      total,
      byEntityType: byType,
      topCommenters: topCommenters.map((c) => ({
        userId: c.userId.toString(),
        username: c.username,
        count: c.count,
      })),
      hiddenCount,
    };
  }

  async deleteUserComments(
    userId: string,
    adminId: string,
  ): Promise<{ deletedCount: number }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const result = await this.commentModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });

    await this.logAction(
      adminId,
      'delete_user_comments',
      {
        deletedCount: result.deletedCount,
      },
      'user',
      userId,
    );

    return { deletedCount: result.deletedCount };
  }

  async getAdminLogs(params: {
    page: number;
    limit: number;
    action?: string;
    adminId?: string;
  }): Promise<{
    logs: AdminLogDocument[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const { page, limit, action, adminId } = params;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (action) {
      query.action = action;
    }
    if (adminId && Types.ObjectId.isValid(adminId)) {
      query.adminId = new Types.ObjectId(adminId);
    }

    const [logs, total] = await Promise.all([
      this.adminLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('adminId', 'username email avatar')
        .lean(),
      this.adminLogModel.countDocuments(query),
    ]);

    return {
      logs: logs as unknown as AdminLogDocument[],
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async exportUsers(format: 'csv' | 'json'): Promise<any> {
    const users = await this.userModel
      .find()
      .select(
        'username email role level experience balance createdAt lastActivityAt',
      )
      .lean();

    if (format === 'json') {
      return users;
    }

    const headers = [
      'id',
      'username',
      'email',
      'role',
      'level',
      'experience',
      'balance',
      'createdAt',
      'lastActivityAt',
    ];

    let csv = '\uFEFF' + headers.join(',') + '\n';

    for (const user of users) {
      const row = [
        user._id.toString(),
        `"${(user.username || '').replace(/"/g, '""')}"`,
        `"${(user.email || '').replace(/"/g, '""')}"`,
        user.role || '',
        user.level || 0,
        user.experience || 0,
        user.balance || 0,
        (user as any).createdAt
          ? new Date((user as any).createdAt).toISOString()
          : '',
        user.lastActivityAt ? new Date(user.lastActivityAt).toISOString() : '',
      ];
      csv += row.join(',') + '\n';
    }

    return csv;
  }

  async exportTitles(format: 'csv' | 'json'): Promise<any> {
    const titles = await this.titleModel
      .find()
      .select(
        'name slug type status genres totalChapters averageRating totalViews createdAt',
      )
      .lean();

    if (format === 'json') {
      return titles;
    }

    const headers = [
      'id',
      'name',
      'slug',
      'type',
      'status',
      'genres',
      'totalChapters',
      'averageRating',
      'totalViews',
      'createdAt',
    ];

    let csv = '\uFEFF' + headers.join(',') + '\n';

    for (const title of titles) {
      const row = [
        title._id.toString(),
        `"${(title.name || '').replace(/"/g, '""')}"`,
        `"${(title.slug || '').replace(/"/g, '""')}"`,
        title.type || '',
        title.status || '',
        `"${(title.genres || []).join(';')}"`,
        title.totalChapters || 0,
        title.averageRating || 0,
        (title as any).totalViews || 0,
        (title as any).createdAt
          ? new Date((title as any).createdAt).toISOString()
          : '',
      ];
      csv += row.join(',') + '\n';
    }

    return csv;
  }

  /** Health check for admin panel: status, uptime, memory, cpu, db, cache. */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'down';
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    dbStatus: 'connected' | 'disconnected';
    cacheStatus: 'connected' | 'disconnected';
  }> {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const memUsedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const loadAvg = os.loadavg();
    const cpuUsage = Math.min(100, Math.round((loadAvg[0] ?? 0) * 100));

    /** Mongoose connection state: 1 = connected */
    const CONNECTED_STATE = 1;
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    if (Number(this.connection?.readyState) === CONNECTED_STATE) {
      dbStatus = 'connected';
    }

    let cacheStatus: 'connected' | 'disconnected' = 'disconnected';
    try {
      await this.cacheManager.set('health:ping', 1);
      const v = await this.cacheManager.get('health:ping');
      if (v !== undefined) cacheStatus = 'connected';
    } catch {
      // leave disconnected
    }

    const status: 'healthy' | 'degraded' | 'down' =
      dbStatus === 'connected'
        ? cacheStatus === 'connected'
          ? 'healthy'
          : 'degraded'
        : 'down';

    return {
      status,
      uptime: uptimeSeconds,
      memoryUsage: memUsedMb,
      cpuUsage,
      dbStatus,
      cacheStatus,
    };
  }

  async getSystemInfo(): Promise<{
    uptime: number;
    uptimeFormatted: string;
    memory: { used: number; total: number; usedPercent: number };
    cpu: { model: string; cores: number; loadAvg: number[] };
    nodeVersion: string;
    platform: string;
  }> {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    const memUsed = process.memoryUsage().heapUsed;
    const memTotal = os.totalmem();

    return {
      uptime: uptimeMs,
      uptimeFormatted: `${days}d ${hours}h ${minutes}m`,
      memory: {
        used: Math.round(memUsed / 1024 / 1024),
        total: Math.round(memTotal / 1024 / 1024),
        usedPercent: Math.round((memUsed / memTotal) * 100),
      },
      cpu: {
        model: os.cpus()[0]?.model || 'Unknown',
        cores: os.cpus().length,
        loadAvg: os.loadavg(),
      },
      nodeVersion: process.version,
      platform: os.platform(),
    };
  }

  async clearCache(
    keys?: string[],
    adminId?: string,
  ): Promise<{ cleared: boolean }> {
    if (keys && keys.length > 0) {
      for (const key of keys) {
        await this.cacheManager.del(key);
      }
    } else if (this.cacheManager.reset) {
      await this.cacheManager.reset();
    }

    if (adminId) {
      await this.logAction(adminId, 'clear_cache', { keys });
    }

    return { cleared: true };
  }

  async getUsers(params: {
    page: number;
    limit: number;
    search?: string;
    role?: string;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }): Promise<{
    users: any[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const { page, limit, search, role, sortBy, sortOrder } = params;
    const skip = (page - 1) * limit;

    const query: any = {};

    if (search) {
      const escaped = escapeRegex(search);
      query.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = role;
    }

    const sortObj: Record<string, 1 | -1> = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .select(
          'username email avatar role level experience balance createdAt lastActivityAt isBot suspicious',
        )
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    return {
      users: users.map((user) => ({
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        level: user.level,
        experience: user.experience,
        balance: user.balance,
        createdAt: (user as any).createdAt,
        lastActivityAt: user.lastActivityAt,
        isBot: user.isBot,
        suspicious: user.suspicious,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(userId: string): Promise<any> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(userId)
      .select('-password -passwordResetToken -emailVerificationToken')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [commentsCount, bookmarksCount] = await Promise.all([
      this.commentModel.countDocuments({ userId: new Types.ObjectId(userId) }),
      Promise.resolve(user.bookmarks?.length || 0),
    ]);

    return {
      ...user,
      id: user._id.toString(),
      commentsCount,
      bookmarksCount,
    };
  }

  async getComments(params: {
    page: number;
    limit: number;
    entityType?: string;
    isVisible?: boolean;
    userId?: string;
  }): Promise<{
    comments: any[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const { page, limit, entityType, isVisible, userId } = params;
    const skip = (page - 1) * limit;

    const query: any = {};

    if (entityType) {
      query.entityType = entityType;
    }

    if (isVisible !== undefined) {
      query.isVisible = isVisible;
    }

    if (userId && Types.ObjectId.isValid(userId)) {
      query.userId = new Types.ObjectId(userId);
    }

    const [comments, total] = await Promise.all([
      this.commentModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username email avatar')
        .lean(),
      this.commentModel.countDocuments(query),
    ]);

    return {
      comments: comments.map((comment) => {
        const user = comment.userId as any;
        return {
          id: comment._id.toString(),
          content: comment.content,
          entityType: comment.entityType,
          entityId: comment.entityId?.toString(),
          isVisible: comment.isVisible,
          isEdited: comment.isEdited,
          createdAt: (comment as any).createdAt,
          user: user
            ? {
                id: user._id?.toString(),
                username: user.username,
                email: user.email,
                avatar: user.avatar,
              }
            : null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async toggleCommentVisibility(
    commentId: string,
    isVisible: boolean,
    adminId: string,
  ): Promise<CommentDocument> {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new BadRequestException('Invalid comment ID');
    }

    const comment = await this.commentModel.findByIdAndUpdate(
      commentId,
      { isVisible },
      { new: true },
    );

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.logAction(
      adminId,
      isVisible ? 'show_comment' : 'hide_comment',
      { commentId },
      'comment',
      commentId,
    );

    return comment;
  }

  async deleteComment(commentId: string, adminId: string): Promise<void> {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new BadRequestException('Invalid comment ID');
    }

    const comment = await this.commentModel.findByIdAndDelete(commentId);

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.logAction(
      adminId,
      'delete_comment',
      { content: comment.content?.substring(0, 100) },
      'comment',
      commentId,
    );
  }

  async bulkDeleteComments(
    ids: string[],
    adminId: string,
  ): Promise<{ deletedCount: number }> {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No comment IDs provided');
    }

    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      throw new BadRequestException('No valid comment IDs provided');
    }

    const objectIds = validIds.map((id) => new Types.ObjectId(id));

    const result = await this.commentModel.deleteMany({
      _id: { $in: objectIds },
    });

    await this.logAction(adminId, 'bulk_delete_comments', {
      count: result.deletedCount,
      ids: validIds,
    });

    return { deletedCount: result.deletedCount };
  }

  /**
   * Get spam comments
   */
  async getSpamComments(skip: number, limit: number): Promise<any[]> {
    const comments = await this.commentModel
      .find({ isSpam: true })
      .sort({ spamDetectedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'username avatar')
      .lean();

    return comments;
  }

  /**
   * Count spam comments
   */
  async countSpamComments(): Promise<number> {
    return this.commentModel.countDocuments({ isSpam: true });
  }

  /**
   * Get users with comment restrictions
   */
  async getRestrictedUsers(skip: number, limit: number): Promise<any[]> {
    const users = await this.userModel
      .find({
        isCommentRestricted: true,
        commentRestrictedUntil: { $gt: new Date() },
      })
      .sort({ commentRestrictedUntil: 1 })
      .skip(skip)
      .limit(limit)
      .select(
        'username email avatar spamWarnings lastSpamWarningAt commentRestrictedUntil',
      )
      .lean();

    return users;
  }

  /**
   * Count restricted users
   */
  async countRestrictedUsers(): Promise<number> {
    return this.userModel.countDocuments({
      isCommentRestricted: true,
      commentRestrictedUntil: { $gt: new Date() },
    });
  }

  /**
   * Remove comment restriction from user
   */
  async removeCommentRestriction(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      {
        $set: {
          isCommentRestricted: false,
          commentRestrictedUntil: null,
        },
      },
    );
  }

  /**
   * Cleanup spam comments (delete all marked as spam)
   */
  async cleanupSpamComments(): Promise<{ deletedCount: number }> {
    const result = await this.commentModel.deleteMany({ isSpam: true });
    return { deletedCount: result.deletedCount };
  }
}
