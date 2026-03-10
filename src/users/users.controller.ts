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
import { ReadingProgressResponseDto } from './dto/reading-progress-response.dto';

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

  // 🏆 Достижения текущего пользователя (для вкладки профиля)
  @Get('profile/achievements')
  @UseGuards(JwtAuthGuard)
  async getProfileAchievements(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getProfileAchievementsForUser(
        req.user.userId,
      );
      return {
        success: true,
        data: { achievements: data },
        timestamp: new Date().toISOString(),
        path: 'users/profile/achievements',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch profile achievements',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/achievements',
      };
    }
  }

  // 🎁 Ежедневный бонус (опыт за вход раз в день)
  @Post('daily-bonus')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async claimDailyBonus(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.usersService.awardDailyLoginExp(
        req.user.userId,
      );
      const path = 'users/daily-bonus';
      if (!result) {
        // Бонус уже получен сегодня (например, при логине через auth) — всё равно обновляем квест «Ежедневный вход»
        void this.usersService
          .getOrCreateDailyQuests(req.user.userId)
          .then(() =>
            this.usersService.incrementDailyQuestProgress(
              req.user.userId,
              'daily_login',
              1,
            ),
          );
        const profile = await this.usersService.findProfileById(
          req.user.userId,
        );
        return {
          success: true,
          data: {
            success: true,
            message: 'Бонус уже получен сегодня',
            currentStreak: profile?.currentStreak ?? 0,
            experienceGained: 0,
          },
          timestamp: new Date().toISOString(),
          path,
          method: 'POST',
        };
      }
      return {
        success: true,
        data: {
          success: true,
          message: 'Ежедневный бонус получен!',
          currentStreak: result.currentStreak,
          experienceGained: result.expGained,
          coinsGained: result.bonusCoins,
        },
        timestamp: new Date().toISOString(),
        path,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'An error occurred',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/daily-bonus',
        method: 'POST',
      };
    }
  }

  // 📋 Ежедневные задания
  @Get('daily-quests')
  @UseGuards(JwtAuthGuard)
  async getDailyQuests(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getOrCreateDailyQuests(
        req.user.userId,
      );
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/daily-quests',
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'An error occurred',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/daily-quests',
        method: 'GET',
      };
    }
  }

  @Post('daily-quests/claim')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async claimDailyQuest(
    @Request() req,
    @Body() body: { questId: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.usersService.claimDailyQuest(
        req.user.userId,
        body?.questId ?? '',
      );
      if (!result.success) {
        return {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
          path: 'users/daily-quests/claim',
          method: 'POST',
        };
      }
      return {
        success: true,
        data: {
          success: true,
          expGained: result.expGained,
          coinsGained: result.coinsGained,
        },
        timestamp: new Date().toISOString(),
        path: 'users/daily-quests/claim',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'An error occurred',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/daily-quests/claim',
        method: 'POST',
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

  // 🗑️ Запланировать удаление профиля (scheduledDeletionAt = now + 7 дней)
  @Post('profile/schedule-deletion')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async scheduleDeletion(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.scheduleDeletion(req.user.userId);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/schedule-deletion',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to schedule deletion',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/schedule-deletion',
        method: 'POST',
      };
    }
  }

  // ↩️ Отменить запланированное удаление профиля
  @Post('profile/cancel-deletion')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelDeletion(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.cancelDeletion(req.user.userId);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/cancel-deletion',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to cancel deletion',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/cancel-deletion',
        method: 'POST',
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

  // 🔍 Проверить статус закладки для тайтла (есть ли в закладках и в какой категории)
  @Get('profile/bookmarks/:titleId/status')
  @UseGuards(JwtAuthGuard)
  async getBookmarkStatus(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<{ isBookmarked: boolean; category: string | null }>> {
    try {
      const data = await this.usersService.getBookmarkStatus(
        req.user.userId,
        titleId,
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `users/profile/bookmarks/${titleId}/status`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch bookmark status',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/bookmarks/${titleId}/status`,
      };
    }
  }

  // 📊 Получить количество закладок по категориям
  @Get('profile/bookmarks/counts')
  @UseGuards(JwtAuthGuard)
  async getBookmarksCounts(
    @Request() req,
  ): Promise<ApiResponseDto<{ reading: number; planned: number; completed: number; favorites: number; dropped: number; total: number }>> {
    try {
      const data = await this.usersService.getBookmarksCounts(req.user.userId);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/bookmarks/counts',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch bookmark counts',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/bookmarks/counts',
      };
    }
  }

  // 📖 Получить прогресс чтения для тайтла (последняя глава, процент)
  @Get('profile/progress/:titleId')
  @UseGuards(JwtAuthGuard)
  async getReadingProgress(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<{
    titleId: string;
    lastChapterId: string | null;
    lastChapterNumber: number | null;
    chaptersRead: number;
    totalChapters: number;
    progressPercent: number;
    readAt: Date | null;
  }>> {
    try {
      const data = await this.usersService.getReadingProgressForTitle(
        req.user.userId,
        titleId,
      );

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `users/profile/progress/${titleId}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch reading progress',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/profile/progress/${titleId}`,
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

  // 📊 История прогресса (XP, уровни, достижения) для вкладки «Прогресс»
  @Get('profile/progress-history')
  @UseGuards(JwtAuthGuard)
  async getProgressHistory(
    @Request() req,
    @Query('limit') limit?: string,
  ): Promise<ApiResponseDto<{ events: unknown[] }>> {
    try {
      const options = limit != null ? { limit: Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50)) } : undefined;
      const data = await this.usersService.getProgressHistory(req.user.userId, options);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/profile/progress-history',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch progress history',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/progress-history',
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
  ): Promise<ApiResponseDto<ReadingProgressResponseDto>> {
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
      // Сохраняем файл через FilesService (S3/локально) и получаем корректный URL; file.filename при memoryStorage() не задаётся
      const data = await this.usersService.updateAvatar(userId, file);

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

  // 🖼 Админ: обновить аватар любого пользователя
  @Post('avatar/admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UseInterceptors(
    FileUploadInterceptor.create('avatar', {
      destination: './uploads/avatars',
      fileTypes: /\/(jpg|jpeg|png|webp)$/,
      fileSize: 2 * 1024 * 1024, // 2MB limit for avatars
      filenamePrefix: 'avatar',
    }),
  )
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

  // 🏆 Лидерборд пользователей
  @Get('leaderboard')
  async getLeaderboard(
    @Query('category') category?: string,
    @Query('period') period?: string,
    @Query('allPeriods') allPeriods?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const validCategories = ['level', 'readingTime', 'ratings', 'comments', 'streak', 'chaptersRead'];
      const safeCategory = validCategories.includes(category || '')
        ? (category as 'level' | 'readingTime' | 'ratings' | 'comments' | 'streak' | 'chaptersRead')
        : 'level';

      const wantAllPeriods =
        allPeriods === '1' ||
        allPeriods === 'true' ||
        allPeriods === 'yes';
      const periodCategories = ['ratings', 'comments', 'chaptersRead'];

      if (wantAllPeriods && periodCategories.includes(safeCategory)) {
        const data = await this.usersService.getLeaderboardAllPeriods({
          category: safeCategory as 'ratings' | 'comments' | 'chaptersRead',
          limit: limit != null ? parseInt(String(limit), 10) : undefined,
          page: page != null ? parseInt(String(page), 10) : undefined,
        });
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
          path: 'users/leaderboard',
        };
      }

      const validPeriods = ['all', 'month', 'week'];
      const safePeriod = validPeriods.includes(period || '')
        ? (period as 'all' | 'month' | 'week')
        : 'all';

      const data = await this.usersService.getLeaderboard({
        category: safeCategory,
        period: safePeriod,
        limit: limit != null ? parseInt(String(limit), 10) : undefined,
        page: page != null ? parseInt(String(page), 10) : undefined,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'users/leaderboard',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch leaderboard',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/leaderboard',
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
      news?: boolean;
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

  /**
   * Сохранить подписку на Web Push (для уведомлений в браузере)
   */
  @Post('profile/push-subscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async pushSubscribe(
    @Request() req,
    @Body()
    body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      expirationTime?: number | null;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const userAgent = typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
      await this.usersService.savePushSubscription(
        req.user.userId,
        body,
        userAgent,
      );
      return {
        success: true,
        data: null,
        message: 'Push subscription saved',
        timestamp: new Date().toISOString(),
        path: 'users/profile/push-subscribe',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to save push subscription',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/push-subscribe',
        method: 'POST',
      };
    }
  }

  /**
   * Удалить подписку на Web Push по endpoint
   */
  @Delete('profile/push-subscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async pushUnsubscribe(
    @Request() req,
    @Body() body: { endpoint: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.usersService.removePushSubscription(
        req.user.userId,
        body?.endpoint ?? '',
      );
      return {
        success: true,
        data: result,
        message: 'Push subscription removed',
        timestamp: new Date().toISOString(),
        path: 'users/profile/push-subscribe',
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to remove push subscription',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users/profile/push-subscribe',
        method: 'DELETE',
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
