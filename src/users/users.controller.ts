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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileUploadInterceptor } from '../common/interceptors/file-upload.interceptor';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('users')
@UsePipes(new ValidationPipe())
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 📝 Получить всех пользователей (с пагинацией)
  @Get()
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
        path: 'users',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch users',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'users',
      };
    }
  }

  // 👤 Получить текущего пользователя
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.findById(req.user.userId);

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

  // 👥 Получить пользователя по ID
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getUserById(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.findById(id);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `users/${id}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch user',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `users/${id}`,
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
      const data = await this.usersService.update(
        req.user.userId,
        updateUserDto,
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

  // 📚 Закладки пользователя
  @Get('profile/bookmarks')
  @UseGuards(JwtAuthGuard)
  async getUserBookmarks(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getUserBookmarks(req.user.userId);

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

  // ➕ Добавить в закладки
  @Post('profile/bookmarks/:titleId')
  @UseGuards(JwtAuthGuard)
  async addBookmark(
    @Request() req,
    @Param('titleId') titleId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.addBookmark(
        req.user.userId,
        titleId,
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

  // 📖 История чтения
  @Get('profile/history')
  @UseGuards(JwtAuthGuard)
  async getReadingHistory(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.usersService.getReadingHistory(req.user.userId);

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
      console.log(req.user);
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
}
