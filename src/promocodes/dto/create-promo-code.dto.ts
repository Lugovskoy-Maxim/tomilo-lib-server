import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PromoCodeRewardDto {
  @IsEnum(['balance', 'decoration', 'premium'])
  type: 'balance' | 'decoration' | 'premium';

  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  decorationId?: string;

  @IsOptional()
  @IsEnum(['avatar', 'frame', 'background', 'card'])
  decorationType?: 'avatar' | 'frame' | 'background' | 'card';

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class CreatePromoCodeDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromoCodeRewardDto)
  rewards: PromoCodeRewardDto[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsesPerUser?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'expired', 'exhausted'])
  status?: 'active' | 'inactive' | 'expired' | 'exhausted';

  @IsOptional()
  @IsBoolean()
  newUsersOnly?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minLevel?: number;
}
