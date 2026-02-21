import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import {
  CommentEntityType,
  ALLOWED_REACTION_EMOJIS,
} from '../schemas/comment.schema';

@Controller('comments')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createCommentDto: CreateCommentDto,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.commentsService.create(
        createCommentDto,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: 'Comment created successfully',
        timestamp: new Date().toISOString(),
        path: 'comments',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create comment',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'comments',
        method: 'POST',
      };
    }
  }

  @Get()
  async findAll(
    @Query('entityType') entityType: CommentEntityType,
    @Query('entityId') entityId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('includeReplies') includeReplies: string | boolean = false,
  ): Promise<ApiResponseDto<any>> {
    try {
      // Validate entityType
      if (!Object.values(CommentEntityType).includes(entityType)) {
        throw new BadRequestException('Invalid entity type');
      }

      // Validate entityId - allow "all" as a special value or valid ObjectId
      if (entityId !== 'all' && !Types.ObjectId.isValid(entityId)) {
        throw new BadRequestException('Invalid entity ID');
      }

      const includeRepliesBool =
        includeReplies === 'true' || includeReplies === true;
      const data = await this.commentsService.findAll(
        entityType,
        entityId,
        Number(page),
        Number(limit),
        includeRepliesBool,
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'comments',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch comments',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'comments',
      };
    }
  }

  @Get('reactions/emojis')
  async getReactionEmojis(): Promise<ApiResponseDto<{ emojis: string[] }>> {
    return {
      success: true,
      data: { emojis: [...ALLOWED_REACTION_EMOJIS] },
      timestamp: new Date().toISOString(),
      path: 'comments/reactions/emojis',
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.commentsService.findOne(id);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `comments/${id}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch comment',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `comments/${id}`,
      };
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.commentsService.update(
        id,
        updateCommentDto,
        req.user.userId,
      );

      return {
        success: true,
        data,
        message: 'Comment updated successfully',
        timestamp: new Date().toISOString(),
        path: `comments/${id}`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update comment',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `comments/${id}`,
        method: 'PUT',
      };
    }
  }

  @Delete(':id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ApiResponseDto<void>> {
    try {
      await this.commentsService.remove(id, req.user.userId, req.user.role);

      return {
        success: true,
        message: 'Comment deleted successfully',
        timestamp: new Date().toISOString(),
        path: `comments/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete comment',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `comments/${id}`,
        method: 'DELETE',
      };
    }
  }

  /** Реакция как в Telegram: передайте { "emoji": "👍" }. Повторный запрос снимает реакцию. */
  @Post(':id/reactions')
  @UseGuards(JwtAuthGuard)
  async toggleReaction(
    @Param('id') id: string,
    @Body() dto: ToggleReactionDto,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.commentsService.toggleReaction(
        id,
        req.user.userId,
        dto.emoji,
      );

      return {
        success: true,
        data,
        message: 'Reaction toggled',
        timestamp: new Date().toISOString(),
        path: `comments/${id}/reactions`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to toggle reaction',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `comments/${id}/reactions`,
        method: 'POST',
      };
    }
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async likeComment(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.commentsService.toggleReaction(
        id,
        req.user.userId,
        '👍',
      );

      return {
        success: true,
        data,
        message: 'Comment liked successfully',
        timestamp: new Date().toISOString(),
        path: `comments/${id}/like`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to like comment',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `comments/${id}/like`,
        method: 'POST',
      };
    }
  }

  @Post(':id/dislike')
  @UseGuards(JwtAuthGuard)
  async dislikeComment(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.commentsService.toggleReaction(
        id,
        req.user.userId,
        '👎',
      );

      return {
        success: true,
        data,
        message: 'Comment disliked successfully',
        timestamp: new Date().toISOString(),
        path: `comments/${id}/dislike`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to dislike comment',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `comments/${id}/dislike`,
        method: 'POST',
      };
    }
  }

  @Get(':id/reactions/count')
  async getReactionsCount(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.commentsService.getReactionsCount(id);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `comments/${id}/reactions/count`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch reactions count',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `comments/${id}/reactions/count`,
      };
    }
  }
}
