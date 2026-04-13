import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
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
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { DecorationType } from './shop.controller';

/**
 * Admin shop routes under /api/shop/admin to avoid route conflicts with shop/decorations/:type.
 */
@Controller('shop/admin')
@UsePipes(new ValidationPipe())
export class ShopAdminController {
  constructor(private readonly shopService: ShopService) {}

  @Post('decorations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createDecoration(
    @Body()
    body: {
      name: string;
      description?: string;
      price: number;
      imageUrl: string;
      type: 'avatar' | 'frame' | 'background' | 'card';
      rarity?: 'common' | 'rare' | 'epic' | 'legendary';
      isAvailable?: boolean;
      stock?: number | null;
      originalPrice?: number | null;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const stock = body.stock ?? undefined;
      const data = await this.shopService.createDecoration({
        name: body.name,
        description: body.description,
        price: Number(body.price),
        imageUrl: body.imageUrl,
        type: body.type,
        rarity: body.rarity,
        isAvailable: body.isAvailable,
        quantity: stock,
        originalPrice:
          body.originalPrice !== undefined && body.originalPrice !== null
            ? Number(body.originalPrice)
            : undefined,
      });
      return {
        success: true,
        data,
        message: 'Decoration created successfully',
        timestamp: new Date().toISOString(),
        path: 'shop/admin/decorations',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create decoration',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'shop/admin/decorations',
        method: 'POST',
      };
    }
  }

  @Get('decorations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAdminDecorations(): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.getAllDecorationsAdmin();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: 'shop/admin/decorations',
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch admin decorations',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'shop/admin/decorations',
        method: 'GET',
      };
    }
  }

  @Delete('decorations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteDecoration(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<{ message: string }>> {
    try {
      const data = await this.shopService.deleteDecoration(id);
      return {
        success: true,
        data,
        message: data.message,
        timestamp: new Date().toISOString(),
        path: `shop/admin/decorations/${id}`,
        method: 'DELETE',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete decoration',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `shop/admin/decorations/${id}`,
        method: 'DELETE',
      };
    }
  }

  @Patch('decorations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
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
            `decoration-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`,
          );
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async updateDecoration(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      imageUrl?: string;
      price?: number | string;
      rarity?: 'common' | 'rare' | 'epic' | 'legendary';
      description?: string;
      isAvailable?: boolean | string;
      type?: DecorationType;
      quantity?: number | string | null;
      stock?: number | string | null;
      originalPrice?: number | string | null;
    },
    @Req() req: Express.Request,
  ): Promise<ApiResponseDto<any>> {
    try {
      const file = (req as any).file ?? req.file ?? null;
      const quantity =
        body.quantity !== undefined &&
        body.quantity !== null &&
        body.quantity !== ''
          ? Number(body.quantity)
          : body.stock !== undefined && body.stock !== null && body.stock !== ''
            ? Number(body.stock)
            : undefined;
      const isAvailable =
        body.isAvailable === undefined
          ? undefined
          : body.isAvailable === true || body.isAvailable === 'true';

      let originalPriceOut: number | null | undefined = undefined;
      if (body.originalPrice !== undefined) {
        if (body.originalPrice === '' || body.originalPrice === null) {
          originalPriceOut = null;
        } else {
          const n = Number(body.originalPrice);
          if (!Number.isNaN(n)) originalPriceOut = n;
        }
      }

      if (file?.filename) {
        const data = await this.shopService.updateDecorationWithFile(id, file, {
          name: body.name,
          price: body.price !== undefined ? Number(body.price) : undefined,
          rarity: body.rarity,
          description: body.description,
          isAvailable: isAvailable,
          quantity:
            quantity !== undefined && !Number.isNaN(quantity)
              ? quantity
              : undefined,
          ...(originalPriceOut !== undefined
            ? { originalPrice: originalPriceOut }
            : {}),
        });
        return {
          success: true,
          data,
          message: 'Decoration updated successfully',
          timestamp: new Date().toISOString(),
          path: `shop/admin/decorations/${id}`,
          method: 'PATCH',
        };
      }

      const data = await this.shopService.updateDecoration(id, {
        name: body.name,
        imageUrl: body.imageUrl,
        price: body.price !== undefined ? Number(body.price) : undefined,
        rarity: body.rarity,
        description: body.description,
        isAvailable: isAvailable,
        quantity:
          quantity !== undefined && !Number.isNaN(quantity)
            ? quantity
            : ((body.quantity as number | null) ??
              (body.stock as number | null) ??
              undefined),
        ...(originalPriceOut !== undefined
          ? { originalPrice: originalPriceOut }
          : {}),
      });
      return {
        success: true,
        data,
        message: 'Decoration updated successfully',
        timestamp: new Date().toISOString(),
        path: `shop/admin/decorations/${id}`,
        method: 'PATCH',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update decoration',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `shop/admin/decorations/${id}`,
        method: 'PATCH',
      };
    }
  }

  @Post('decorations/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
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
            `decoration-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`,
          );
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadDecoration(
    @Req() req: Express.Request,
    @Body()
    body: {
      type: DecorationType;
      name?: string;
      price?: number | string;
      rarity?: 'common' | 'rare' | 'epic' | 'legendary';
      description?: string;
      isAvailable?: string;
      quantity?: number | string | null;
      stock?: number | string | null;
      originalPrice?: number | string | null;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const file = (req as any).file ?? req.file ?? null;
      if (!file || !file.filename) {
        throw new BadRequestException('Image file is required');
      }
      const rawQuantityInput =
        body.quantity !== undefined &&
        body.quantity !== null &&
        body.quantity !== ''
          ? body.quantity
          : body.stock;
      const quantityRaw =
        rawQuantityInput === undefined ||
        rawQuantityInput === null ||
        rawQuantityInput === ''
          ? undefined
          : Number(rawQuantityInput);
      const quantity =
        quantityRaw !== undefined && !Number.isNaN(quantityRaw)
          ? quantityRaw
          : undefined;
      const priceNum =
        body.price !== undefined && body.price !== null && body.price !== ''
          ? Number(body.price)
          : 0;
      const name =
        body.name !== undefined && String(body.name).trim() !== ''
          ? String(body.name).trim()
          : (file.originalname && file.originalname.replace(/\.[^.]+$/, '')) ||
            'Unnamed';
      let originalPriceUpload: number | null | undefined = undefined;
      if (body.originalPrice !== undefined && body.originalPrice !== null) {
        const o = Number(body.originalPrice);
        if (!Number.isNaN(o)) originalPriceUpload = o;
      }
      const data = await this.shopService.uploadDecoration(body.type, file, {
        name,
        price: !Number.isNaN(priceNum) ? priceNum : 0,
        rarity: body.rarity ?? 'common',
        description: body.description ?? '',
        isAvailable:
          body.isAvailable === 'true' || body.isAvailable === undefined,
        quantity,
        originalPrice: originalPriceUpload,
      });
      return {
        success: true,
        data,
        message: 'Decoration uploaded successfully',
        timestamp: new Date().toISOString(),
        path: 'shop/admin/decorations/upload',
        method: 'POST',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw error;
    }
  }

  @Post('suggestions/accept-weekly-winners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async triggerWeeklyWinners(): Promise<ApiResponseDto<any>> {
    try {
      const result = await this.shopService.acceptWeeklyWinner();
      if (result?.winners?.length) {
        return {
          success: true,
          data: result,
          message: `Weekly winners accepted: ${result.winners.length} suggestion(s) added to shop`,
          timestamp: new Date().toISOString(),
          path: 'shop/admin/suggestions/accept-weekly-winners',
          method: 'POST',
        };
      } else {
        return {
          success: true,
          data: null,
          message: 'No pending suggestions or all skipped',
          timestamp: new Date().toISOString(),
          path: 'shop/admin/suggestions/accept-weekly-winners',
          method: 'POST',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to accept weekly winners',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'shop/admin/suggestions/accept-weekly-winners',
        method: 'POST',
      };
    }
  }

  @Post('suggestions/:suggestionId/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async acceptSuggestionManually(
    @Param('suggestionId') suggestionId: string,
  ): Promise<ApiResponseDto<any>> {
    try {
      const result =
        await this.shopService.acceptSuggestionManually(suggestionId);
      return {
        success: true,
        data: result,
        message: 'Suggestion accepted manually and added to shop',
        timestamp: new Date().toISOString(),
        path: `shop/admin/suggestions/${suggestionId}/accept`,
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to accept suggestion',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `shop/admin/suggestions/${suggestionId}/accept`,
        method: 'POST',
      };
    }
  }
}
