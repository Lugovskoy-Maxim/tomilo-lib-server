import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { UploadedFile } from '@nestjs/common';
import { UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { FileUploadInterceptor } from '../common/interceptors/file-upload.interceptor';
import { GameItemsService } from './game-items.service';
import { GameItemsAdminService } from './game-items-admin.service';
import { FilesService } from '../files/files.service';
import { CardsService } from './cards.service';

@Controller('game-items/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class GameItemsAdminController {
  constructor(
    private readonly gameItemsService: GameItemsService,
    private readonly gameItemsAdminService: GameItemsAdminService,
    private readonly filesService: FilesService,
    private readonly cardsService: CardsService,
  ) {}

  // ——— GameItem CRUD ———
  @Get()
  async listItems(
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('rarity') rarity?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsService.adminFindAll({
        search,
        type,
        rarity,
        isActive:
          isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        page: Number(page),
        limit: Number(limit),
      });
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin',
        method: 'GET',
      };
    }
  }

  @Post('upload-icon')
  @UseInterceptors(
    FileUploadInterceptor.create('file', {
      fileTypes: /\/(jpg|jpeg|png|webp|gif)$/,
      fileSize: 2 * 1024 * 1024, // 2MB
    }),
  )
  async uploadIcon(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<{ url: string }>> {
    try {
      if (!file) {
        throw new BadRequestException('Файл изображения обязателен');
      }
      const url = await this.filesService.saveGameItemIcon(file);
      return {
        success: true,
        data: { url },
        message: 'Иконка загружена',
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/upload-icon',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/upload-icon',
        method: 'POST',
      };
    }
  }

  @Post()
  async createItem(@Body() body: any): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsService.adminCreate(body);
      return {
        success: true,
        data,
        message: 'Game item created',
        timestamp: new Date().toISOString(),
        path: 'game-items/admin',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin',
        method: 'POST',
      };
    }
  }

  @Get('users/:userId/game-data')
  async getUserGameData(
    @Param('userId') userId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.getUserGameData(userId);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/users/${userId}/game-data`,
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/users/${userId}/game-data`,
        method: 'GET',
      };
    }
  }

  @Put('users/:userId/inventory')
  async setUserInventory(
    @Param('userId') userId: string,
    @Body() body: { items: { itemId: string; count: number }[] },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.setUserInventory(
        userId,
        body?.items ?? [],
      );
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/users/${userId}/inventory`,
        method: 'PUT',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/users/${userId}/inventory`,
        method: 'PUT',
      };
    }
  }

  @Post('grant')
  async grantItem(
    @Request() req: any,
    @Body() body: { userId: string; itemId: string; count: number },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.grantItem(
        body.userId,
        body.itemId,
        body.count ?? 1,
        req.user?.userId,
      );
      return {
        success: true,
        data,
        message: 'Item granted',
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/grant',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/grant',
        method: 'POST',
      };
    }
  }

  // ——— Reading drops ———
  @Get('drops/reading')
  async listReadingDrops(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.findAllReadingDrops();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/drops/reading',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/drops/reading',
        method: 'GET',
      };
    }
  }

  @Post('drops/reading')
  async createReadingDrop(@Body() body: any): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.createReadingDrop(body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/drops/reading',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/drops/reading',
        method: 'POST',
      };
    }
  }

  @Patch('drops/reading/:id')
  async updateReadingDrop(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.updateReadingDrop(id, body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/drops/reading/${id}`,
        method: 'PATCH',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/drops/reading/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete('drops/reading/:id')
  async deleteReadingDrop(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.deleteReadingDrop(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/drops/reading/${id}`,
        method: 'DELETE',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/drops/reading/${id}`,
        method: 'DELETE',
      };
    }
  }

  // ——— Daily quest rewards ———
  @Get('drops/daily-quest')
  async listDailyQuestRewards(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.findAllDailyQuestRewards();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/drops/daily-quest',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/drops/daily-quest',
        method: 'GET',
      };
    }
  }

  @Post('drops/daily-quest')
  async createDailyQuestReward(
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data =
        await this.gameItemsAdminService.createDailyQuestReward(body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/drops/daily-quest',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/drops/daily-quest',
        method: 'POST',
      };
    }
  }

  @Patch('drops/daily-quest/:id')
  async updateDailyQuestReward(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.updateDailyQuestReward(
        id,
        body,
      );
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/drops/daily-quest/${id}`,
        method: 'PATCH',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/drops/daily-quest/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete('drops/daily-quest/:id')
  async deleteDailyQuestReward(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.deleteDailyQuestReward(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/drops/daily-quest/${id}`,
        method: 'DELETE',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/drops/daily-quest/${id}`,
        method: 'DELETE',
      };
    }
  }

  // ——— Leaderboard rewards ———
  @Get('rewards/leaderboard')
  async listLeaderboardRewards(
    @Query('category') category?: string,
    @Query('period') period?: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.findAllLeaderboardRewards({
        category,
        period,
      });
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/rewards/leaderboard',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/rewards/leaderboard',
        method: 'GET',
      };
    }
  }

  @Post('rewards/leaderboard')
  async createLeaderboardReward(
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data =
        await this.gameItemsAdminService.createLeaderboardReward(body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/rewards/leaderboard',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/rewards/leaderboard',
        method: 'POST',
      };
    }
  }

  @Patch('rewards/leaderboard/:id')
  async updateLeaderboardReward(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.updateLeaderboardReward(
        id,
        body,
      );
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/rewards/leaderboard/${id}`,
        method: 'PATCH',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/rewards/leaderboard/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete('rewards/leaderboard/:id')
  async deleteLeaderboardReward(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.deleteLeaderboardReward(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/rewards/leaderboard/${id}`,
        method: 'DELETE',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/rewards/leaderboard/${id}`,
        method: 'DELETE',
      };
    }
  }

  // ——— Disciples config ———
  @Get('config/disciples')
  async getDisciplesConfig(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.getDisciplesConfig();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/config/disciples',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/config/disciples',
        method: 'GET',
      };
    }
  }

  @Put('config/disciples')
  async updateDisciplesConfig(@Body() body: any): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.updateDisciplesConfig(body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/config/disciples',
        method: 'PUT',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/config/disciples',
        method: 'PUT',
      };
    }
  }

  // ——— Alchemy recipes ———
  @Get('recipes')
  async listRecipes(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.findAllRecipes();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/recipes',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/recipes',
        method: 'GET',
      };
    }
  }

  @Get('recipes/:id')
  async getRecipe(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.getRecipe(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/recipes/${id}`,
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/recipes/${id}`,
        method: 'GET',
      };
    }
  }

  @Post('recipes')
  async createRecipe(@Body() body: any): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.createRecipe(body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/recipes',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/recipes',
        method: 'POST',
      };
    }
  }

  @Patch('recipes/:id')
  async updateRecipe(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.updateRecipe(id, body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/recipes/${id}`,
        method: 'PATCH',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/recipes/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete('recipes/:id')
  async deleteRecipe(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.deleteRecipe(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/recipes/${id}`,
        method: 'DELETE',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/recipes/${id}`,
        method: 'DELETE',
      };
    }
  }

  // ——— Wheel config ———
  @Get('config/wheel')
  async getWheelConfig(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.getWheelConfig();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/config/wheel',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/config/wheel',
        method: 'GET',
      };
    }
  }

  @Put('config/wheel')
  async updateWheelConfig(@Body() body: any): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsAdminService.updateWheelConfig(body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/config/wheel',
        method: 'PUT',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/config/wheel',
        method: 'PUT',
      };
    }
  }

  // ——— Character cards ———
  @Get('cards')
  async listCards(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.cardsService.listCardsAdmin();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/cards',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/cards',
        method: 'GET',
      };
    }
  }

  @Post('cards')
  async createCard(@Body() body: any): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.cardsService.createCard(body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/cards',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/cards',
        method: 'POST',
      };
    }
  }

  @Patch('cards/:id')
  async updateCard(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.cardsService.updateCard(id, body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/cards/${id}`,
        method: 'PATCH',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/cards/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete('cards/:id')
  async deleteCard(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.cardsService.deleteCard(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/cards/${id}`,
        method: 'DELETE',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/cards/${id}`,
        method: 'DELETE',
      };
    }
  }

  // ——— Card decks ———
  @Get('card-decks')
  async listCardDecks(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.cardsService.listDecksAdmin();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/card-decks',
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/card-decks',
        method: 'GET',
      };
    }
  }

  @Post('card-decks')
  async createCardDeck(@Body() body: any): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.cardsService.createDeck(body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/card-decks',
        method: 'POST',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: 'game-items/admin/card-decks',
        method: 'POST',
      };
    }
  }

  @Patch('card-decks/:id')
  async updateCardDeck(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.cardsService.updateDeck(id, body);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/card-decks/${id}`,
        method: 'PATCH',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/card-decks/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete('card-decks/:id')
  async deleteCardDeck(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.cardsService.deleteDeck(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/card-decks/${id}`,
        method: 'DELETE',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/card-decks/${id}`,
        method: 'DELETE',
      };
    }
  }

  // Item by id (must be after all specific paths)
  @Get('item/:id')
  async getItem(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsService.adminFindOne(id);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `game-items/admin/item/${id}`,
        method: 'GET',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/item/${id}`,
        method: 'GET',
      };
    }
  }

  @Patch('item/:id')
  async updateItem(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsService.adminUpdate(id, body);
      return {
        success: true,
        data,
        message: 'Game item updated',
        timestamp: new Date().toISOString(),
        path: `game-items/admin/item/${id}`,
        method: 'PATCH',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/item/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Delete('item/:id')
  async deleteItem(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.gameItemsService.adminDelete(id);
      return {
        success: true,
        data,
        message: 'Game item deactivated',
        timestamp: new Date().toISOString(),
        path: `game-items/admin/item/${id}`,
        method: 'DELETE',
      };
    } catch (e) {
      return {
        success: false,
        message: (e as Error).message,
        errors: [(e as Error).message],
        timestamp: new Date().toISOString(),
        path: `game-items/admin/item/${id}`,
        method: 'DELETE',
      };
    }
  }
}
