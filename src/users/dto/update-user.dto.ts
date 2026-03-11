import { PartialType } from '@nestjs/mapped-types';
import {
  IsOptional,
  IsArray,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsObject,
  IsDateString,
  MaxLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { Types } from 'mongoose';
import { Type } from 'class-transformer';

export class PrivacySettingsDto {
  @IsOptional()
  @IsEnum(['public', 'friends', 'private'])
  profileVisibility?: 'public' | 'friends' | 'private';

  @IsOptional()
  @IsEnum(['public', 'friends', 'private'])
  readingHistoryVisibility?: 'public' | 'friends' | 'private';
}

export class NotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  newChapters?: boolean;

  @IsOptional()
  @IsBoolean()
  comments?: boolean;

  @IsOptional()
  @IsBoolean()
  news?: boolean;
}

export class DisplaySettingsDto {
  @IsOptional()
  @IsBoolean()
  isAdult?: boolean;

  @IsOptional()
  @IsEnum(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsArray()
  bookmarks?: Array<
    string | { titleId: string; category?: string; addedAt?: Date }
  >;

  @IsOptional()
  @IsString()
  avatar?: string;

  /** Краткое описание / био (для админа — модерация правил), до 200 символов */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @IsOptional()
  @IsArray()
  readingHistory?: any[];

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  equippedDecorations?: {
    avatar: Types.ObjectId | null;
    frame: Types.ObjectId | null;
    background: Types.ObjectId | null;
    card: Types.ObjectId | null;
  };

  @IsOptional()
  ownedDecorations?: {
    decorationType: string;
    decorationId: Types.ObjectId;
    purchasedAt: Date;
  }[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PrivacySettingsDto)
  privacy?: PrivacySettingsDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DisplaySettingsDto)
  displaySettings?: DisplaySettingsDto;

  /** Показывать ли историю чтения в профиле */
  @IsOptional()
  @IsBoolean()
  showReadingHistory?: boolean;

  /** Показывать ли закладки в профиле */
  @IsOptional()
  @IsBoolean()
  showBookmarks?: boolean;

  /** Дата окончания премиум-подписки (ISO). Передать null, чтобы снять подписку. Только для админа. */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsDateString()
  subscriptionExpiresAt?: string | null;
}
