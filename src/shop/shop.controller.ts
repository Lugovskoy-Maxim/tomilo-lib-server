import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
  ParseEnumPipe,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import * as Express from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

export enum DecorationType {
  avatar = 'avatar',
  frame = 'frame',
  background = 'background',
  card = 'card',
}

@Controller('shop')
@UsePipes(new ValidationPipe())
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  // Get all available decorations
  @Get('decorations')
  async getAllDecorations(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.getAllDecorations();

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'shop/decorations',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch decorations',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'shop/decorations',
      };
    }
  }

  // Get decorations by type
  @Get('decorations/:type')
  async getDecorationsByType(
    @Param('type', new ParseEnumPipe(DecorationType))
    type: DecorationType,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.getDecorationsByType(type);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: `shop/decorations/${type}`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch decorations',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `shop/decorations/${type}`,
      };
    }
  }

  // Suggested decorations (user proposals + voting)
  @Get('suggestions')
  @UseGuards(OptionalJwtAuthGuard)
  async getSuggestions(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const userId = req.user?.userId ?? null;
      const data = await this.shopService.getSuggestedDecorationsWithUserVote(userId);
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'shop/suggestions',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch suggestions',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'shop/suggestions',
      };
    }
  }

  /** Загрузка изображения для предложения. Отдельный путь без :id, чтобы не конфликтовать с suggestions/:id/vote. */
  @Post('upload-suggestion')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = './uploads/decorations';
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext =
            path.extname(file.originalname) ||
            (file.mimetype === 'image/gif'
              ? '.gif'
              : file.mimetype === 'image/webp'
                ? '.webp'
                : '.png');
          cb(
            null,
            `suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`,
          );
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadSuggestionImage(@Req() req: Express.Request): Promise<ApiResponseDto<{ imageUrl: string }>> {
    const file = (req as any).file ?? req.file ?? null;
    if (!file?.filename) {
      return {
        success: false,
        message: 'Image file is required',
        errors: ['No file uploaded'],
        timestamp: new Date().toISOString(),
        path: 'shop/upload-suggestion',
        method: 'POST',
      };
    }
    const imageUrl = `/uploads/decorations/${file.filename}`;
    return {
      success: true,
      data: { imageUrl },
      timestamp: new Date().toISOString(),
      path: 'shop/upload-suggestion',
      method: 'POST',
    };
  }

  @Post('suggestions')
  @UseGuards(JwtAuthGuard)
  async createSuggestion(
    @Request() req,
    @Body()
    body: {
      type: 'avatar' | 'frame' | 'background' | 'card';
      name: string;
      description?: string;
      imageUrl: string;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.createSuggestion(req.user.userId, {
        type: body.type,
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl,
      });
      return {
        success: true,
        data,
        message: 'Suggestion created',
        timestamp: new Date().toISOString(),
        path: 'shop/suggestions',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create suggestion',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'shop/suggestions',
        method: 'POST',
      };
    }
  }

  @Post('suggestions/:id/vote')
  @UseGuards(JwtAuthGuard)
  async voteSuggestion(
    @Request() req,
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.voteSuggestion(id, req.user.userId);
      return {
        success: true,
        data,
        message: 'Vote recorded',
        timestamp: new Date().toISOString(),
        path: `shop/suggestions/${id}/vote`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to vote',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `shop/suggestions/${id}/vote`,
        method: 'POST',
      };
    }
  }

  @Delete('suggestions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteSuggestion(@Param('id') id: string): Promise<ApiResponseDto<{ message: string }>> {
    try {
      const data = await this.shopService.deleteSuggestion(id);
      return {
        success: true,
        data,
        message: data.message,
        timestamp: new Date().toISOString(),
        path: `shop/suggestions/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete suggestion',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `shop/suggestions/${id}`,
        method: 'DELETE',
      };
    }
  }

  @Patch('suggestions/:id')
  @UseGuards(JwtAuthGuard)
  async updateSuggestion(
    @Request() req,
    @Param('id') id: string,
    @Body()
    body: { name?: string; description?: string; imageUrl?: string },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.updateSuggestion(id, req.user.userId, {
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl,
      });
      return {
        success: true,
        data,
        message: 'Suggestion updated',
        timestamp: new Date().toISOString(),
        path: `shop/suggestions/${id}`,
        method: 'PATCH',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update suggestion',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `shop/suggestions/${id}`,
        method: 'PATCH',
      };
    }
  }

  // Get user's owned decorations
  @Get('profile/decorations')
  @UseGuards(JwtAuthGuard)
  async getUserDecorations(@Request() req): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.getUserDecorations(req.user.userId);

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'shop/profile/decorations',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch user decorations',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: 'shop/profile/decorations',
      };
    }
  }

  // Purchase decoration
  @Post('purchase/:type/:decorationId')
  @UseGuards(JwtAuthGuard)
  async purchaseDecoration(
    @Request() req,
    @Param('type', new ParseEnumPipe(DecorationType))
    type: DecorationType,
    @Param('decorationId') decorationId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.purchaseDecoration(
        req.user.userId,
        type,
        decorationId,
      );

      return {
        success: true,
        data,
        message: 'Decoration purchased successfully',
        timestamp: new Date().toISOString(),
        path: `shop/purchase/${type}/${decorationId}`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to purchase decoration',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `shop/purchase/${type}/${decorationId}`,
        method: 'POST',
      };
    }
  }

  // Equip decoration
  @Put('equip/:type/:decorationId')
  @UseGuards(JwtAuthGuard)
  async equipDecoration(
    @Request() req,
    @Param('type', new ParseEnumPipe(DecorationType))
    type: DecorationType,
    @Param('decorationId') decorationId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.equipDecoration(
        req.user.userId,
        type,
        decorationId,
      );

      return {
        success: true,
        data,
        message: 'Decoration equipped successfully',
        timestamp: new Date().toISOString(),
        path: `shop/equip/${type}/${decorationId}`,
        method: 'PUT',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to equip decoration',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `shop/equip/${type}/${decorationId}`,
        method: 'PUT',
      };
    }
  }

  // Unequip decoration
  @Delete('equip/:type')
  @UseGuards(JwtAuthGuard)
  async unequipDecoration(
    @Request() req,
    @Param('type', new ParseEnumPipe(DecorationType))
    type: DecorationType,
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.unequipDecoration(
        req.user.userId,
        type,
      );

      return {
        success: true,
        data,
        message: 'Decoration unequipped successfully',
        timestamp: new Date().toISOString(),
        path: `shop/equip/${type}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to unequip decoration',
        errors: [error.message],
        timestamp: new Date().toISOString(),
        path: `shop/equip/${type}`,
        method: 'DELETE',
      };
    }
  }
}
