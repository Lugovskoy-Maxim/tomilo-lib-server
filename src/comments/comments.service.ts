import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Comment,
  CommentDocument,
  CommentEntityType,
} from '../schemas/comment.schema';
import { Title, TitleDocument } from '../schemas/title.schema';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
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
    if (createCommentDto.parentId) {
      const parentComment = await this.commentModel.findById(
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

    return comment.save();
  }

  async findAll(
    entityType: CommentEntityType,
    entityId: string,
    page = 1,
    limit = 20,
    includeReplies = false,
  ) {
    const skip = (page - 1) * limit;
    // Всегда получаем только родительские комментарии (без ответов)
    const query: any = {
      entityType,
      isVisible: true,
      parentId: null, // Всегда фильтруем только родительские комментарии
    };

    // Если entityId равен "all", то не фильтруем по конкретному entityId
    // Иначе фильтруем по конкретному entityId
    if (entityId !== 'all') {
      query.entityId = new Types.ObjectId(entityId);
    }

    const [comments, total] = await Promise.all([
      this.commentModel
        .find(query)
        .populate('userId', 'username avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.commentModel.countDocuments(query),
    ]);

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
          .populate('userId', 'username avatar')
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
      // Если replies не запрашиваются, инициализируем пустой массив
      comments.forEach((comment: any) => {
        comment.replies = [];
      });
    }

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
      .populate('userId', 'username avatar')
      .populate('parentId')
      .exec();

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return comment;
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

    // Soft delete: mark as not visible instead of actually deleting
    comment.isVisible = false;
    await comment.save();
  }

  async likeComment(id: string, userId: string): Promise<CommentDocument> {
    const comment = await this.commentModel.findById(id);

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const userIdObj = new Types.ObjectId(userId);
    const hasLiked = comment.likedBy.some((id) => id.toString() === userId);
    const hasDisliked = comment.dislikedBy.some(
      (id) => id.toString() === userId,
    );

    if (hasLiked) {
      // Unlike
      comment.likedBy = comment.likedBy.filter(
        (id) => id.toString() !== userId,
      );
      comment.likes = Math.max(0, comment.likes - 1);
    } else {
      // Like
      comment.likedBy.push(userIdObj);
      comment.likes += 1;

      // Remove dislike if exists
      if (hasDisliked) {
        comment.dislikedBy = comment.dislikedBy.filter(
          (id) => id.toString() !== userId,
        );
        comment.dislikes = Math.max(0, comment.dislikes - 1);
      }
    }

    return comment.save();
  }

  async dislikeComment(id: string, userId: string): Promise<CommentDocument> {
    const comment = await this.commentModel.findById(id);

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const userIdObj = new Types.ObjectId(userId);
    const hasDisliked = comment.dislikedBy.some(
      (id) => id.toString() === userId,
    );
    const hasLiked = comment.likedBy.some((id) => id.toString() === userId);

    if (hasDisliked) {
      // Remove dislike
      comment.dislikedBy = comment.dislikedBy.filter(
        (id) => id.toString() !== userId,
      );
      comment.dislikes = Math.max(0, comment.dislikes - 1);
    } else {
      // Dislike
      comment.dislikedBy.push(userIdObj);
      comment.dislikes += 1;

      // Remove like if exists
      if (hasLiked) {
        comment.likedBy = comment.likedBy.filter(
          (id) => id.toString() !== userId,
        );
        comment.likes = Math.max(0, comment.likes - 1);
      }
    }

    return comment.save();
  }

  async getReactionsCount(
    id: string,
  ): Promise<{ likes: number; dislikes: number }> {
    const comment = await this.commentModel.findById(id);

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return {
      likes: comment.likes,
      dislikes: comment.dislikes,
    };
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
}
