import {
  Controller,
  Post,
  Patch,
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

  @Patch('decorations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateDecoration(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      imageUrl?: string;
      price?: number;
      rarity?: 'common' | 'rare' | 'epic' | 'legendary';
      description?: string;
      isAvailable?: boolean;
      /** Лимит количества (основное имя поля) */
      quantity?: number | null;
      /** Алиас для фронтенда: stock === quantity */
      stock?: number | null;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const quantity =
        body.quantity !== undefined && body.quantity !== null
          ? body.quantity
          : body.stock !== undefined
            ? body.stock
            : undefined;
      const data = await this.shopService.updateDecoration(id, {
        name: body.name,
        imageUrl: body.imageUrl,
        price: body.price !== undefined ? Number(body.price) : undefined,
        rarity: body.rarity,
        description: body.description,
        isAvailable: body.isAvailable,
        quantity,
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
      name: string;
      price: number;
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      description?: string;
      isAvailable?: string;
      /** Основное имя лимита на бэкенде */
      quantity?: number | string | null;
      /** Алиас, который шлёт фронтенд (stock === quantity) */
      stock?: number | string | null;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const file = (req as any).file ?? req.file ?? null;
      if (!file || !file.filename) {
        throw new BadRequestException('Image file is required');
      }
      const rawQuantityInput =
        body.quantity !== undefined && body.quantity !== null && body.quantity !== ''
          ? body.quantity
          : body.stock;
      const quantityRaw =
        rawQuantityInput === undefined || rawQuantityInput === null || rawQuantityInput === ''
          ? undefined
          : Number(rawQuantityInput);
      const quantity =
        quantityRaw !== undefined && !Number.isNaN(quantityRaw) ? quantityRaw : undefined;
      const data = await this.shopService.uploadDecoration(
        body.type,
        file,
        {
          name: body.name,
          price: Number(body.price),
          rarity: body.rarity,
          description: body.description,
          isAvailable: body.isAvailable === 'true' || body.isAvailable === undefined,
          quantity,
        },
      );
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
}
