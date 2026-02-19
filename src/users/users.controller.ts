import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileUploadInterceptor } from '../common/interceptors/file-upload.interceptor';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('users')
@UsePipes(new ValidationPipe())
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 📝 Получить всех пользователей (с пагинацией)
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAllUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.findAll({ page, limit, search });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/admin',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch users',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/admin',
      };
    }
  }

  // 👤 Получить пользователя по ID (для админов)
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getUserByIdAdmin(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.findById(id);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `users/admin/${id}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'User not found',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/admin/${id}`,
      };
    }
  }

  // 👤 Получить текущего пользователя
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.findProfileById(req.user.userId);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch profile',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile',
      };
    }
  }

  // ✏️ Обновить профиль пользователя
  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      // Запрещаем менять баланс и декорации через профиль (только через магазин/админку)
      const { balance, ownedDecorations, equippedDecorations, ...safeUpdate } =
        updateUserDto as UpdateUserDto & {
          balance?: number;
          ownedDecorations?: unknown;
          equippedDecorations?: unknown;
        };
      const data = await this.usersService.update(
        req.user.userId,
        safeUpdate as UpdateUserDto,
      );

      return {
        success: true,
        data,
        message: 'Profile updated successfully',
        timestamp: new Date().toISOString(),
        path: 'users/profile',
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update profile',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile',
        method: 'PUT',
      };
    }
  }

  // 🔧 Админ: обновить пользователя
  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.update(id, updateUserDto);

      return {
        success: true,
        data,
        message: 'User updated successfully',
        timestamp: new Date().toISOString(),
        path: `users/admin/${id}`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update user',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/admin/${id}`,
        method: 'PUT',
      };
    }
  }

  // 🗑️ Удалить пользователя
  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteUser(@Param('id') id: string): Promise<ApiResponseDto<void>> {
    try {
      await this.usersService.delete(id);

      return {
        success: true,
        message: 'User deleted successfully',
        timestamp: new Date().toISOString(),
        path: `users/admin/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete user',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/admin/${id}`,
        method: 'DELETE',
      };
    }
  }

  // 📚 Закладки пользователя (по категориям: reading, planned, completed, favorites, dropped)
  @Get('profile/bookmarks')
  @UseGuards(JwtAuthGuard)
  async getUserBookmarks(
    @Request() req,
    @Query('category') category?: string,
    @Query('grouped') grouped?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const options: { category?: any; grouped?: boolean } = {};
      if (category && ['reading', 'planned', 'completed', 'favorites', 'dropped'].includes(category)) {
        options.category = category;
      }
      if (grouped === 'true' || grouped === '1') options.grouped = true;
      const data = await this.usersService.getUserBookmarks(
        req.user.userId,
        Object.keys(options).length ? options : undefined,
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/bookmarks',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch bookmarks',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/bookmarks',
      };
    }
  }

  // ➕ Добавить в закладки (query: ?category=reading|planned|completed|favorites|dropped)
  @Post('profile/bookmarks/:titleId')
  @UseGuards(JwtAuthGuard)
  async addBookmark(
    @Request() req,
    @Param('titleId') titleId: string,
    @Query('category') category?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const cat = (category && ['reading', 'planned', 'completed', 'favorites', 'dropped'].includes(category))
        ? category
        : 'reading';
      const data = await this.usersService.addBookmark(
        req.user.userId,
        titleId,
        cat as any,
      );

      return {
        success: true,
        data,
        message: 'Bookmark added successfully',
        timestamp: new Date().toISOString(),
        path: `users/profile/bookmarks/${titleId}`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to add bookmark',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/bookmarks/${titleId}`,
        method: 'POST',
      };
    }
  }

  // ✏️ Изменить категорию закладки
  @Put('profile/bookmarks/:titleId')
  @UseGuards(JwtAuthGuard)
  async updateBookmarkCategory(
    @Request() req,
    @Param('titleId') titleId: string,
    @Body('category') category: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!category || !['reading', 'planned', 'completed', 'favorites', 'dropped'].includes(category)) {
        throw new BadRequestException(
          'Invalid category. Use: reading, planned, completed, favorites, dropped',
        );
      }
      const data = await this.usersService.updateBookmarkCategory(
        req.user.userId,
        titleId,
        category as any,
      );
      return {
        success: true,
        data,
        message: 'Bookmark category updated',
        timestamp: new Date().toISOString(),
        path: `users/profile/bookmarks/${titleId}`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update bookmark category',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/bookmarks/${titleId}`,
        method: 'PUT',
      };
    }
  }

  // ➖ Удалить из закладок
  @Delete('profile/bookmarks/:titleId')
  @UseGuards(JwtAuthGuard)
  async removeBookmark(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.removeBookmark(
        req.user.userId,
        titleId,
      );

      return {
        success: true,
        data,
        message: 'Bookmark removed successfully',
        timestamp: new Date().toISOString(),
        path: `users/profile/bookmarks/${titleId}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to remove bookmark',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/bookmarks/${titleId}`,
        method: 'DELETE',
      };
    }
  }

  // 📖 История чтения (query: ?page=1&limit=50&light=true — по умолчанию лёгкий формат с пагинацией)
  @Get('profile/history')
  @UseGuards(JwtAuthGuard)
  async getReadingHistory(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('light') light?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const options: { page?: number; limit?: number; light?: boolean } = {};
      if (page != null) options.page = Math.max(1, parseInt(String(page), 10) || 1);
      if (limit != null) options.limit = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
      if (light !== undefined) options.light = light === 'true' || light === '1';
      const data = await this.usersService.getReadingHistory(
        req.user.userId,
        Object.keys(options).length ? options : undefined,
      );
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/history',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch reading history',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/history',
      };
    }
  }

  // 📖 История чтения (альтернативный эндпоинт, те же query: page, limit, light)
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getReadingHistoryAlt(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('light') light?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const options: { page?: number; limit?: number; light?: boolean } = {};
      if (page != null) options.page = Math.max(1, parseInt(String(page), 10) || 1);
      if (limit != null) options.limit = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
      if (light !== undefined) options.light = light === 'true' || light === '1';
      const data = await this.usersService.getReadingHistory(
        req.user.userId,
        Object.keys(options).length ? options : undefined,
      );
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/history',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch reading history',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/history',
      };
    }
  }

  /** Только ID и номера прочитанных глав по тайтлу — для отображения статуса «прочитано» на фронте (лёгкий ответ). Маршрут объявлен выше :titleId. */
  @Get('profile/history/:titleId/read-ids')
  @UseGuards(JwtAuthGuard)
  async getTitleReadChapterIds(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<{ chapterIds: string[]; chapterNumbers: number[] }>> {
    try {
      const data = await this.usersService.getTitleReadChapterIds(
        req.user.userId,
        titleId,
      );
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}/read-ids`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch read chapter ids',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}/read-ids`,
      };
    }
  }

  // 📖 История чтения для конкретного тайтла (полный список глав с populate)
  @Get('profile/history/:titleId')
  @UseGuards(JwtAuthGuard)
  async getTitleReadingHistory(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getTitleReadingHistory(
        req.user.userId,
        titleId,
      );
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch title reading history',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}`,
      };
    }
  }

  // ➕ Добавить в историю чтения
  @Post('profile/history/:titleId/:chapterId')
  @UseGuards(JwtAuthGuard)
  async addToHistory(
    @Request() req,
    @Param('titleId') titleId: string,
    @Param('chapterId') chapterId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.addToReadingHistory(
        req.user.userId,
        titleId,
        chapterId,
      );

      return {
        success: true,
        data,
        message: 'Added to reading history successfully',
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}/${chapterId}`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to add to reading history',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}/${chapterId}`,
        method: 'POST',
      };
    }
  }

  // 🧹 Очистить историю чтения
  @Delete('profile/history')
  @UseGuards(JwtAuthGuard)
  async clearHistory(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.clearReadingHistory(req.user.userId);

      return {
        success: true,
        data,
        message: 'Reading history cleared successfully',
        timestamp: new Date().toISOString(),
        path: 'users/profile/history',
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to clear reading history',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/history',
        method: 'DELETE',
      };
    }
  }

  // ➖ Удалить одну запись из истории чтения
  @Delete('profile/history/:titleId')
  @UseGuards(JwtAuthGuard)
  async removeFromHistory(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.removeFromReadingHistory(
        req.user.userId,
        titleId,
      );

      return {
        success: true,
        data,
        message: 'Entry removed from reading history successfully',
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to remove entry from reading history',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}`,
        method: 'DELETE',
      };
    }
  }

  // ➖ Удалить одну главу из истории чтения
  @Delete('profile/history/:titleId/:chapterId')
  @UseGuards(JwtAuthGuard)
  async removeChapterFromHistory(
    @Request() req,
    @Param('titleId') titleId: string,
    @Param('chapterId') chapterId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.removeChapterFromReadingHistory(
        req.user.userId,
        titleId,
        chapterId,
      );

      return {
        success: true,
        data,
        message: 'Chapter removed from reading history successfully',
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}/${chapterId}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to remove chapter from reading history',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/history/${titleId}/${chapterId}`,
        method: 'DELETE',
      };
    }
  }

  // 📊 Статистика пользователя
  @Get('profile/stats')
  @UseGuards(JwtAuthGuard)
  async getUserStats(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getUserStats(req.user.userId);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/stats',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch user stats',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/stats',
      };
    }
  }

  @Put('profile/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileUploadInterceptor.create('avatar', {
      destination: './uploads/avatars',
      fileTypes: /\/(jpg|jpeg|png|webp)$/,
      fileSize: 2 * 1024 * 1024, // 2MB limit for avatars
      filenamePrefix: 'avatar',
    }),
  )
  async updateAvatar(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!file) {
        throw new BadRequestException('Avatar file is required');
      }
      const userId = req.user.userId;
      const avatarUrl = `/uploads/avatars/${file.filename}`;
      const data = await this.usersService.update(userId, {
        avatar: avatarUrl,
      });

      return {
        success: true,
        data,
        message: 'Avatar updated successfully',
        timestamp: new Date().toISOString(),
        path: 'users/profile/avatar',
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update avatar',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/avatar',
        method: 'PUT',
      };
    }
  }

  // 🖼 Админ: удалить аватар любого пользователя
  @Post('avatar/admin/:id')
  @UseInterceptors(
    FileUploadInterceptor.create('avatar', {
      destination: './uploads/avatars',
      fileTypes: /\/(jpg|jpeg|png|webp)$/,
      fileSize: 2 * 1024 * 1024, // 2MB limit for avatars
      filenamePrefix: 'avatar',
    }),
  )
  @Roles('admin')
  async uploadAvatarForAdmin(
    @Param('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      const user = await this.usersService.updateAvatar(userId, file);
      const data = {
        message: `Аватар пользователя ${user.username} обновлен`,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
      };

      return {
        success: true,
        data,
        message: 'Avatar updated successfully',
        timestamp: new Date().toISOString(),
        path: `users/avatar/admin/${userId}`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update avatar',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/avatar/admin/${userId}`,
        method: 'POST',
      };
    }
  }

  // 🖼 Удалить аватар (свой)
  @Post('avatar')
  @UseInterceptors(
    FileUploadInterceptor.create('avatar', {
      destination: './uploads/avatars',
      fileTypes: /\/(jpg|jpeg|png|webp)$/,
      fileSize: 2 * 1024 * 1024, // 2MB limit for avatars
      filenamePrefix: 'avatar',
    }),
  )
  async uploadAvatar(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      const user = await this.usersService.updateAvatar(req.user.userId, file);
      const data = {
        message: 'Аватар обновлен',
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
      };

      return {
        success: true,
        data,
        message: 'Avatar updated successfully',
        timestamp: new Date().toISOString(),
        path: 'users/avatar',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update avatar',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/avatar',
        method: 'POST',
      };
    }
  }

  // 🏠 Пользователи для главной страницы (активные за последнюю неделю)
  @Get('homepage/active')
  async getHomepageActiveUsers(
    @Query('limit') limit?: string,
    @Query('days') days?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('verification') verification?: string,
    @Query('requireAvatar') requireAvatar?: string,
    @Query('requireRecentActivity') requireRecentActivity?: string,
    @Query('format') format?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getHomepageActiveUsers({
        limit: limit != null ? parseInt(String(limit), 10) : undefined,
        days: days != null ? parseInt(String(days), 10) : undefined,
        sortBy:
          sortBy === 'level' || sortBy === 'createdAt' || sortBy === 'lastActivityAt'
            ? sortBy
            : undefined,
        sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined,
        verification:
          verification === 'email' ||
          verification === 'oauth' ||
          verification === 'any' ||
          verification === 'none'
            ? verification
            : undefined,
        requireAvatar:
          requireAvatar != null
            ? requireAvatar === 'true' || requireAvatar === '1'
            : undefined,
        requireRecentActivity:
          requireRecentActivity != null
            ? requireRecentActivity === 'true' || requireRecentActivity === '1'
            : undefined,
        responseFormat: format === 'extended' || format === 'compact' ? format : undefined,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/homepage/active',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch active users for homepage',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/homepage/active',
      };
    }
  }

  // 👥 Получить профиль пользователя по ID (с учётом настроек приватности)
  // Авторизация опциональна: без токена доступны только публичные профили
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getUserById(
    @Param('id') id: string,
    @Request() req: { user?: { userId: string } },
  ): Promise<ApiResponseDto<any>> {
    try {
      const viewerId = req.user?.userId;
      const isFriend = false; // TODO: проверка дружбы, когда будет модуль друзей
      const data = await this.usersService.getProfileWithPrivacy(
        id,
        viewerId,
        isFriend,
      );
      return {
        success: true,
        data,
        message: 'Profile loaded',
        timestamp: new Date().toISOString(),
        path: `users/${id}`,
        method: 'GET',
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return {
          success: false,
          message: 'This profile is private',
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: `users/${id}`,
          method: 'GET',
        };
      }
      if (error instanceof BadRequestException) {
        return {
          success: false,
          message: 'Invalid user ID',
          errors: [error.message],
          timestamp: new Date().toISOString(),
          path: `users/${id}`,
          method: 'GET',
        };
      }
      return {
        success: false,
        message: 'Failed to fetch user',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/${id}`,
        method: 'GET',
      };
    }
  }

  @Post('cleanup-orphaned-references')
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async cleanupOrphanedReferences(): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.usersService.cleanupOrphanedReferences();
      const data = {
        cleanedBookmarks: result.cleanedBookmarks,
        cleanedReadingHistoryTitles: result.cleanedReadingHistoryTitles,
        cleanedReadingHistoryChapters: result.cleanedReadingHistoryChapters,
      };

      return {
        success: true,
        data,
        message: 'Orphaned references cleaned successfully',
        timestamp: new Date().toISOString(),
        path: 'users/cleanup-orphaned-references',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to cleanup orphaned references',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/cleanup-orphaned-references',
        method: 'POST',
      };
    }
  }

  // 🛡️ Bot Detection Admin Endpoints

  /**
   * Получить список подозрительных пользователей (ботов)
   */
  @Get('admin/suspicious-users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getSuspiciousUsers(
    @Query('limit') limit: number = 50,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getSuspiciousUsers(Number(limit));

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/admin/suspicious-users',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch suspicious users',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/admin/suspicious-users',
      };
    }
  }

  /**
   * Получить статистику по ботам
   */
  @Get('admin/bot-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getBotStats(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getBotStats();

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/admin/bot-stats',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch bot stats',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/admin/bot-stats',
      };
    }
  }

  /**
   * Сбросить статус бота для пользователя
   */
  @Post('admin/:id/reset-bot-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async resetBotStatus(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      await this.usersService.resetBotStatus(id);

      return {
        success: true,
        message: 'Bot status reset successfully',
        timestamp: new Date().toISOString(),
        path: `users/admin/${id}/reset-bot-status`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to reset bot status',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/admin/${id}/reset-bot-status`,
        method: 'POST',
      };
    }
  }

  // 🔒 Настройки приватности

  /**
   * Получить настройки приватности
   */
  @Get('profile/settings/privacy')
  @UseGuards(JwtAuthGuard)
  async getPrivacySettings(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const user = await this.usersService.findById(req.user.userId);

      return {
        success: true,
        data: {
          profileVisibility: user.privacy?.profileVisibility || 'public',
          readingHistoryVisibility:
            user.privacy?.readingHistoryVisibility || 'private',
        },
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/privacy',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch privacy settings',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/privacy',
      };
    }
  }

  /**
   * Обновить настройки приватности
   */
  @Put('profile/settings/privacy')
  @UseGuards(JwtAuthGuard)
  async updatePrivacySettings(
    @Request() req,
    @Body()
    body: {
      profileVisibility?: 'public' | 'friends' | 'private';
      readingHistoryVisibility?: 'public' | 'friends' | 'private';
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.updatePrivacySettings(
        req.user.userId,
        body,
      );

      return {
        success: true,
        data: data.privacy,
        message: 'Privacy settings updated successfully',
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/privacy',
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update privacy settings',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/privacy',
        method: 'PUT',
      };
    }
  }

  // 🔔 Настройки уведомлений

  /**
   * Получить настройки уведомлений
   */
  @Get('profile/settings/notifications')
  @UseGuards(JwtAuthGuard)
  async getNotificationSettings(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getNotificationSettings(
        req.user.userId,
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/notifications',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch notification settings',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/notifications',
      };
    }
  }

  /**
   * Обновить настройки уведомлений
   */
  @Put('profile/settings/notifications')
  @UseGuards(JwtAuthGuard)
  async updateNotificationSettings(
    @Request() req,
    @Body()
    body: {
      newChapters?: boolean;
      comments?: boolean;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.updateNotificationSettings(
        req.user.userId,
        body,
      );

      return {
        success: true,
        data: data.notifications,
        message: 'Notification settings updated successfully',
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/notifications',
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update notification settings',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/notifications',
        method: 'PUT',
      };
    }
  }

  // 🎨 Настройки отображения

  /**
   * Получить настройки отображения
   */
  @Get('profile/settings/display')
  @UseGuards(JwtAuthGuard)
  async getDisplaySettings(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getDisplaySettings(req.user.userId);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/display',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch display settings',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/display',
      };
    }
  }

  /**
   * Обновить настройки отображения
   */
  @Put('profile/settings/display')
  @UseGuards(JwtAuthGuard)
  async updateDisplaySettings(
    @Request() req,
    @Body()
    body: {
      isAdult?: boolean;
      theme?: 'light' | 'dark' | 'system';
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.updateDisplaySettings(
        req.user.userId,
        body,
      );

      return {
        success: true,
        data: data.displaySettings,
        message: 'Display settings updated successfully',
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/display',
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update display settings',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings/display',
        method: 'PUT',
      };
    }
  }

  /**
   * Получить все настройки пользователя
   */
  @Get('profile/settings')
  @UseGuards(JwtAuthGuard)
  async getAllSettings(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getUserSettings(req.user.userId);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch settings',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/settings',
      };
    }
  }
}
