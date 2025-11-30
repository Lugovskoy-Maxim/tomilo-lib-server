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
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { CommentEntityType } from '../schemas/comment.schema';

@Controller('comments')
@UsePipes(new ValidationPipe({ transform: true }))
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

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async likeComment(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.commentsService.likeComment(id, req.user.userId);

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
      const data = await this.commentsService.dislikeComment(
        id,
        req.user.userId,
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
}
