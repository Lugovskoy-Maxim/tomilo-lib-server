import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FileUploadInterceptor } from '../common/interceptors/file-upload.interceptor';
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
      quantity?: number | null;
    },
  ): Promise<ApiResponseDto<any>> {
    try {
      const data = await this.shopService.updateDecoration(id, {
        name: body.name,
        imageUrl: body.imageUrl,
        price: body.price !== undefined ? Number(body.price) : undefined,
        rarity: body.rarity,
        description: body.description,
        isAvailable: body.isAvailable,
        quantity: body.quantity,
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
    FileUploadInterceptor.create('file', {
      destination: './uploads/decorations',
      fileTypes: /\/(jpg|jpeg|png|webp|gif)$/,
      fileSize: 20 * 1024 * 1024, // 20MB (GIF can be large)
      filenamePrefix: 'decoration',
    }),
  )
  async uploadDecoration(
    @Body()
    body: {
      type: DecorationType;
      name: string;
      price: number;
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      description?: string;
      isAvailable?: string;
      quantity?: number | string | null;
    },
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!file) {
        throw new BadRequestException('Image file is required');
      }
      const quantityRaw =
        body.quantity === undefined || body.quantity === null || body.quantity === ''
          ? undefined
          : Number(body.quantity);
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
      return {
        success: false,
        message: 'Failed to upload decoration',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'shop/admin/decorations/upload',
        method: 'POST',
      };
    }
  }
}
