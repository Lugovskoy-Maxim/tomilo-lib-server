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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

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
  ) {
    return this.usersService.findAll({ page, limit, search });
  }

  // 👤 Получить текущего пользователя
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return this.usersService.findById(req.user.userId);
  }

  // 👥 Получить пользователя по ID
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getUserById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // ✏️ Обновить профиль пользователя
  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.userId, updateUserDto);
  }

  // 🔧 Админ: обновить пользователя
  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  // 🗑️ Удалить пользователя
  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.delete(id);
  }

  // 📚 Закладки пользователя
  @Get('profile/bookmarks')
  @UseGuards(JwtAuthGuard)
  async getUserBookmarks(@Request() req) {
    return this.usersService.getUserBookmarks(req.user.userId);
  }

  // ➕ Добавить в закладки
  @Post('profile/bookmarks/:titleId')
  @UseGuards(JwtAuthGuard)
  async addBookmark(@Request() req, @Param('titleId') titleId: string) {
    return this.usersService.addBookmark(req.user.userId, titleId);
  }

  // ➖ Удалить из закладок
  @Delete('profile/bookmarks/:titleId')
  @UseGuards(JwtAuthGuard)
  async removeBookmark(@Request() req, @Param('titleId') titleId: string) {
    return this.usersService.removeBookmark(req.user.userId, titleId);
  }

  // 📖 История чтения
  @Get('profile/history')
  @UseGuards(JwtAuthGuard)
  async getReadingHistory(@Request() req) {
    return this.usersService.getReadingHistory(req.user.userId);
  }

  // ➕ Добавить в историю чтения
  @Post('profile/history/:titleId/:chapterId')
  @UseGuards(JwtAuthGuard)
  async addToHistory(
    @Request() req,
    @Param('titleId') titleId: string,
    @Param('chapterId') chapterId: string,
  ) {
    return this.usersService.addToReadingHistory(
      req.user.userId,
      titleId,
      chapterId,
    );
  }

  // 🧹 Очистить историю чтения
  @Delete('profile/history')
  @UseGuards(JwtAuthGuard)
  async clearHistory(@Request() req) {
    return this.usersService.clearReadingHistory(req.user.userId);
  }

  // 📊 Статистика пользователя
  @Get('profile/stats')
  @UseGuards(JwtAuthGuard)
  async getUserStats(@Request() req) {
    return this.usersService.getUserStats(req.user.userId);
  }

  // 🖼 Админ: удалить аватар любого пользователя
  @Post('avatar/admin/:id')
  @UseInterceptors(FileInterceptor('avatar'))
  @Roles('admin')
  async uploadAvatarForAdmin(
    @Param('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = await this.usersService.updateAvatar(userId, file);
    return {
      message: `Аватар пользователя ${user.username} обновлен`,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      },
    };
  }

  // 🖼 Удалить аватар (свой)
  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = await this.usersService.updateAvatar(req.user.userId, file);
    return {
      message: 'Аватар обновлен',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      },
    };
  }
}
