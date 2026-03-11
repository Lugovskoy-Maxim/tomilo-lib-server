import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Comment,
  CommentDocument,
  CommentEntityType,
  ALLOWED_REACTION_EMOJIS,
} from '../schemas/comment.schema';
import { Title, TitleDocument } from '../schemas/title.schema';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    private notificationsService: NotificationsService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
  ) {}

  async create(
    createCommentDto: CreateCommentDto,
    userId: string,
  ): Promise<CommentDocument> {
    // Validate that the entity exists
    await this.validateEntity(
      createCommentDto.entityType,
      createCommentDto.entityId,
    );

    // If parentId is provided, validate it exists and belongs to the same entity
    let parentComment: CommentDocument | null = null;
    if (createCommentDto.parentId) {
      parentComment = await this.commentModel.findById(
        createCommentDto.parentId,
      );
      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }
      if (
        parentComment.entityType !== createCommentDto.entityType ||
        parentComment.entityId.toString() !== createCommentDto.entityId
      ) {
        throw new BadRequestException(
          'Parent comment must belong to the same entity',
        );
      }
    }

    const comment = new this.commentModel({
      ...createCommentDto,
      userId: new Types.ObjectId(userId),
      entityId: new Types.ObjectId(createCommentDto.entityId),
      parentId: createCommentDto.parentId
        ? new Types.ObjectId(createCommentDto.parentId)
        : null,
    });

    const saved = await comment.save();

    // Инкрементируем счётчик комментариев пользователя
    try {
      await this.usersService.incrementCommentsCount(userId);
    } catch (error) {
      // Не блокируем создание комментария при ошибке инкремента
      console.warn(
        `Failed to increment commentsCount for user ${userId}:`,
        error.message,
      );
    }

    // Уведомление автору родительского комментария об ответе (не себе)
    if (createCommentDto.parentId && parentComment) {
      const parentAuthorId = parentComment.userId.toString();
      if (parentAuthorId !== userId) {
        const replier = await this.commentModel.db
          .collection('users')
          .findOne(
            { _id: new Types.ObjectId(userId) },
            { projection: { username: 1 } },
          );
        const replierUsername = (replier as any)?.username ?? 'Пользователь';
        const ctx = await this.getEntityContext(
          parentComment.entityType,
          parentComment.entityId.toString(),
        );
        await this.notificationsService.createCommentReplyNotification(
          parentAuthorId,
          replierUsername,
          parentComment._id.toString(),
          parentComment.entityType,
          parentComment.entityId.toString(),
          {
            titleId: ctx?.titleId,
            chapterId: ctx?.chapterId,
            entityName: ctx?.entityName,
            parentContentPreview: parentComment.content,
          },
        );
      }
    }

    return saved;
  }

  async findAll(
    entityType: CommentEntityType,
    entityId: string,
    page = 1,
    limit = 20,
    includeReplies = false,
    sortOrder: 'newest' | 'oldest' | 'popular' = 'newest',
  ) {
    const skip = (page - 1) * limit;
    // Всегда получаем только родительские комментарии (без ответов)
    const query: any = {
      entityType,
      isVisible: true,
      parentId: null, // Всегда фильтруем только родительские комментарии
    };

    // Если entityId равен "all", то не фильтруем по конкретному entityId
    if (entityId !== 'all') {
      query.entityId = new Types.ObjectId(entityId);
    }

    const authorPopulate = {
      path: 'userId',
      select: 'username avatar role equippedDecorations',
      populate: [
        { path: 'equippedDecorations.frame', select: 'imageUrl' },
        { path: 'equippedDecorations.avatar', select: 'imageUrl' },
      ],
    };

    let comments: any[];
    const total = await this.commentModel.countDocuments(query);

    if (sortOrder === 'popular') {
      // Сортировка по популярности (сумма реакций): агрегация для порядка, затем find+populate
      const pipeline: any[] = [
        { $match: query },
        {
          $addFields: {
            reactionsTotal: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$reactions', []] },
                  as: 'r',
                  in: { $size: { $ifNull: ['$$r.userIds', []] } },
                },
              },
            },
          },
        },
        { $sort: { reactionsTotal: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { _id: 1 } },
      ];
      const orderedIds = await this.commentModel
        .aggregate(pipeline)
        .exec()
        .then((rows) => rows.map((r) => r._id));
      if (orderedIds.length === 0) {
        comments = [];
      } else {
        const byId = new Map<string, any>();
        const found = await this.commentModel
          .find({ _id: { $in: orderedIds } })
          .populate(authorPopulate)
          .lean();
        found.forEach((c: any) => byId.set(c._id.toString(), c));
        comments = orderedIds
          .map((id) => byId.get(id.toString()))
          .filter(Boolean);
      }
    } else {
      const sortCrit: { createdAt: 1 | -1 } =
        sortOrder === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
      comments = await this.commentModel
        .find(query)
        .populate(authorPopulate)
        .sort(sortCrit)
        .skip(skip)
        .limit(limit)
        .lean();
    }

    // Get replies for each comment if includeReplies is true (recursively)
    if (includeReplies && comments.length > 0) {
      // Рекурсивная функция для загрузки всех ответов
      const loadRepliesRecursively = async (
        parentIds: Types.ObjectId[],
      ): Promise<Map<string, any[]>> => {
        if (parentIds.length === 0) {
          return new Map();
        }

        const replies = await this.commentModel
          .find({
            parentId: { $in: parentIds },
            isVisible: true,
          })
          .populate(authorPopulate)
          .sort({ createdAt: 1 })
          .lean();

        const repliesMap = new Map<string, any[]>();
        replies.forEach((reply) => {
          const parentId = reply.parentId?.toString();
          if (!parentId) return; // Пропускаем, если parentId отсутствует
          if (!repliesMap.has(parentId)) {
            repliesMap.set(parentId, []);
          }
          repliesMap.get(parentId)!.push(reply);
        });

        // Рекурсивно загружаем ответы на ответы
        if (replies.length > 0) {
          const replyIds = replies.map((r) => r._id);
          const nestedRepliesMap = await loadRepliesRecursively(replyIds);

          // Объединяем вложенные ответы с текущими
          replies.forEach((reply: any) => {
            const replyId = reply._id.toString();
            reply.replies = nestedRepliesMap.get(replyId) || [];
          });
        }

        return repliesMap;
      };

      const commentIds = comments.map((c) => c._id);
      const repliesMap = await loadRepliesRecursively(commentIds);

      comments.forEach((comment: any) => {
        comment.replies = repliesMap.get(comment._id.toString()) || [];
      });
    } else {
      comments.forEach((comment: any) => {
        comment.replies = [];
      });
    }

    const mapReactionsRecursive = (c: any) => {
      this.mapCommentReactions(c);
      (c.replies || []).forEach(mapReactionsRecursive);
    };
    comments.forEach(mapReactionsRecursive);

    return {
      comments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  async findOne(id: string): Promise<CommentDocument> {
    const comment = await this.commentModel
      .findById(id)
      .populate({
        path: 'userId',
        select: 'username avatar role equippedDecorations',
        populate: [
          { path: 'equippedDecorations.frame', select: 'imageUrl' },
          { path: 'equippedDecorations.avatar', select: 'imageUrl' },
        ],
      })
      .populate('parentId')
      .exec();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const lean = comment.toObject ? comment.toObject() : comment;
    this.mapCommentReactions(lean);
    return lean as CommentDocument;
  }

  async update(
    id: string,
    updateCommentDto: UpdateCommentDto,
    userId: string,
  ): Promise<CommentDocument> {
    const comment = await this.commentModel.findById(id);

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.userId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    comment.content = updateCommentDto.content;
    comment.isEdited = true;

    return comment.save();
  }

  async remove(id: string, userId: string, userRole?: string): Promise<void> {
    const comment = await this.commentModel.findById(id);

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Allow deletion if user is the owner or admin
    if (comment.userId.toString() !== userId && userRole !== 'admin') {
      throw new ForbiddenException('You can only delete your own comments');
    }

    const commentOwnerId = comment.userId.toString();
    const wasVisible = comment.isVisible;

    // Soft delete: mark as not visible instead of actually deleting
    comment.isVisible = false;
    await comment.save();

    // Декрементируем счётчик комментариев владельца, только если комментарий был видимым
    if (wasVisible) {
      try {
        await this.usersService.decrementCommentsCount(commentOwnerId);
      } catch (error) {
        console.warn(
          `Failed to decrement commentsCount for user ${commentOwnerId}:`,
          error.message,
        );
      }
    }
  }

  /**
   * Реакции как в Telegram: один пользователь может поставить несколько эмодзи.
   * Переключение: если уже поставил этот эмодзи — снимаем, иначе — добавляем.
   * Сохраняем через findOneAndUpdate + $set, чтобы массив реакций гарантированно записывался в MongoDB.
   */
  async toggleReaction(
    id: string,
    userId: string,
    emoji: string,
  ): Promise<CommentDocument> {
    if (!ALLOWED_REACTION_EMOJIS.includes(emoji as any)) {
      throw new BadRequestException(
        `Invalid emoji. Allowed: ${ALLOWED_REACTION_EMOJIS.join(', ')}`,
      );
    }

    const comment = await this.commentModel.findById(id).lean();
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const userIdObj = new Types.ObjectId(userId);
    const existing = (comment as any).reactions || [];
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
    const addedReaction = idx < 0;
    if (idx >= 0) {
      entry.userIds.splice(idx, 1);
    } else {
      entry.userIds.push(userIdObj);
    }

    const newReactions = reactions
      .filter((r) => r.userIds.length > 0)
      .map((r) => ({ emoji: r.emoji, userIds: r.userIds }));

    const updated = await this.commentModel.findByIdAndUpdate(
      id,
      { $set: { reactions: newReactions } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Comment not found');
    }

    const commentOwnerId = (comment as any).userId?.toString();
    // Счётчик лайков автора комментария для достижения «Популярный» (только 👍, не себе)
    if (emoji === '👍' && commentOwnerId && commentOwnerId !== userId) {
      try {
        if (addedReaction) {
          await this.usersService.incrementLikesReceivedCount(commentOwnerId);
        } else {
          await this.usersService.decrementLikesReceivedCount(commentOwnerId);
        }
      } catch (error) {
        console.warn(
          `Failed to update likesReceivedCount for comment author ${commentOwnerId}:`,
          (error as Error).message,
        );
      }
    }

    // Уведомление автору комментария о новой реакции (не себе), с группировкой
    if (addedReaction && commentOwnerId && commentOwnerId !== userId) {
      const totalCount = newReactions.reduce(
        (sum, r) => sum + r.userIds.length,
        0,
      );
      const reactor = await this.commentModel.db
        .collection('users')
        .findOne(
          { _id: new Types.ObjectId(userId) },
          { projection: { username: 1 } },
        );
      const reactorUsername = (reactor as any)?.username ?? 'Пользователь';
      const ctx = await this.getEntityContext(
        (comment as any).entityType,
        (comment as any).entityId?.toString(),
      );
      await this.notificationsService.createOrUpdateReactionsNotification(
        commentOwnerId,
        id,
        reactorUsername,
        emoji,
        totalCount,
        {
          titleId: ctx?.titleId,
          chapterId: ctx?.chapterId,
          entityType: (comment as any).entityType,
          entityId: (comment as any).entityId?.toString(),
        },
      );
    }

    return updated;
  }

  async getReactionsCount(
    id: string,
  ): Promise<{ reactions: { emoji: string; count: number }[] }> {
    const comment = await this.commentModel.findById(id).lean();
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    const list = this.normalizeReactions(comment as any);
    return {
      reactions: list.map((r) => ({ emoji: r.emoji, count: r.count })),
    };
  }

  /**
   * Собирает реакции из нового поля и из legacy likedBy/dislikedBy для обратной совместимости.
   */
  normalizeReactions(comment: {
    reactions?: { emoji: string; userIds?: Types.ObjectId[] }[];
    likedBy?: Types.ObjectId[];
    dislikedBy?: Types.ObjectId[];
    likes?: number;
    dislikes?: number;
  }): { emoji: string; count: number; userIds: Types.ObjectId[] }[] {
    const out: { emoji: string; count: number; userIds: Types.ObjectId[] }[] =
      [];
    const seen = new Set<string>();

    for (const r of comment.reactions || []) {
      const userIds = r.userIds || [];
      if (userIds.length > 0) {
        out.push({ emoji: r.emoji, count: userIds.length, userIds });
        seen.add(r.emoji);
      }
    }
    if ((comment.likedBy?.length ?? 0) > 0 && !seen.has('👍')) {
      out.push({
        emoji: '👍',
        count: comment.likes ?? comment.likedBy!.length,
        userIds: comment.likedBy!,
      });
    }
    if ((comment.dislikedBy?.length ?? 0) > 0 && !seen.has('👎')) {
      out.push({
        emoji: '👎',
        count: comment.dislikes ?? comment.dislikedBy!.length,
        userIds: comment.dislikedBy!,
      });
    }
    return out;
  }

  /** Добавляет к комментарию поле reactions и опционально myReactions для текущего пользователя */
  mapCommentReactions(comment: any, currentUserId?: string): void {
    const list = this.normalizeReactions(comment);
    comment.reactions = list.map((r) => ({
      emoji: r.emoji,
      count: r.count,
    }));
    if (currentUserId && list.length > 0) {
      comment.myReactions = list
        .filter((r) => r.userIds.some((id) => id.toString() === currentUserId))
        .map((r) => r.emoji);
    }
  }

  async likeComment(id: string, userId: string): Promise<CommentDocument> {
    return this.toggleReaction(id, userId, '👍');
  }

  async dislikeComment(id: string, userId: string): Promise<CommentDocument> {
    return this.toggleReaction(id, userId, '👎');
  }

  private async validateEntity(
    entityType: CommentEntityType,
    entityId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(entityId)) {
      throw new BadRequestException('Invalid entity ID');
    }

    const entityObjectId = new Types.ObjectId(entityId);
    let entity;

    if (entityType === CommentEntityType.TITLE) {
      entity = await this.titleModel.findById(entityObjectId);
      if (!entity) {
        throw new NotFoundException('Title not found');
      }
    } else if (entityType === CommentEntityType.CHAPTER) {
      entity = await this.chapterModel.findById(entityObjectId);
      if (!entity) {
        throw new NotFoundException('Chapter not found');
      }
    } else {
      throw new BadRequestException('Invalid entity type');
    }
  }

  /** Контекст сущности для уведомлений: titleId, chapterId, название для отображения */
  private async getEntityContext(
    entityType: CommentEntityType,
    entityId: string,
  ): Promise<{
    titleId?: string;
    chapterId?: string;
    entityName?: string;
  } | null> {
    if (!Types.ObjectId.isValid(entityId)) return null;
    const oid = new Types.ObjectId(entityId);
    if (entityType === CommentEntityType.TITLE) {
      const title = await this.titleModel.findById(oid).select('name').lean();
      if (!title) return null;
      return {
        titleId: entityId,
        entityName: (title as any).name
          ? `«${(title as any).name}»`
          : undefined,
      };
    }
    if (entityType === CommentEntityType.CHAPTER) {
      const chapter = await this.chapterModel
        .findById(oid)
        .select('titleId chapterNumber name')
        .populate('titleId', 'name')
        .lean();
      if (!chapter) return null;
      const ch = chapter as any;
      const titleName = ch.titleId?.name ?? '';
      const chapterLabel = ch.name || `Глава ${ch.chapterNumber}`;
      return {
        titleId: ch.titleId?._id?.toString(),
        chapterId: entityId,
        entityName: titleName
          ? `«${titleName}» — ${chapterLabel}`
          : chapterLabel,
      };
    }
    return null;
  }
}
