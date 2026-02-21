import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
  ParseEnumPipe,
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
