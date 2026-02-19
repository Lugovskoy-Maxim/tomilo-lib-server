import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
  ParseEnumPipe,
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

export enum DecorationType {
  avatar = 'avatar',
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

  // Admin: update decoration by id (avatar, background, or card)
  @Patch('admin/decorations/:id')
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

  // Admin: upload decoration (avatar, background, card)
  @Post('admin/decorations/upload')
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
    },
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponseDto<any>> {
    try {
      if (!file) {
        throw new BadRequestException('Image file is required');
      }
      const data = await this.shopService.uploadDecoration(
        body.type,
        file,
        {
          name: body.name,
          price: Number(body.price),
          rarity: body.rarity,
          description: body.description,
          isAvailable: body.isAvailable === 'true' || body.isAvailable === undefined,
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
