import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Req,
} from '@nestjs/common';
import { PromocodesService } from './promocodes.service';
import { RedeemPromoCodeDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiResponseDto } from '../common/dto/api-response.dto';

interface AuthenticatedRequest {
  user: { userId: string; email: string; roles: string[] };
}

@Controller('promocodes')
@UsePipes(new ValidationPipe({ transform: true }))
export class PromocodesController {
  constructor(private readonly promocodesService: PromocodesService) {}

  @Get('check/:code')
  async checkPromoCode(
    @Param('code') code: string,
  ): Promise<ApiResponseDto<unknown>> {
    try {
      const result = await this.promocodesService.checkPromoCode(code);
      return {
        success: true,
        data: result,
        message: result.valid
          ? 'Promo code is valid'
          : (result.message ?? 'Invalid promo code'),
        timestamp: new Date().toISOString(),
        path: `promocodes/check/${code}`,
        method: 'GET',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to check promo code',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: `promocodes/check/${code}`,
        method: 'GET',
      };
    }
  }

  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  async redeemPromoCode(
    @Body() dto: RedeemPromoCodeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponseDto<unknown>> {
    try {
      const result = await this.promocodesService.redeemPromoCode(
        req.user.userId,
        dto.code,
      );
      return {
        success: true,
        data: result,
        message: result.message,
        timestamp: new Date().toISOString(),
        path: 'promocodes/redeem',
        method: 'POST',
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message || 'Failed to redeem promo code',
        errors: [(error as Error).message],
        timestamp: new Date().toISOString(),
        path: 'promocodes/redeem',
        method: 'POST',
      };
    }
  }
}
