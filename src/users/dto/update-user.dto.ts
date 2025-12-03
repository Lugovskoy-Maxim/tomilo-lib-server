import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsArray, IsString, IsNumber } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { Types } from 'mongoose';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsArray()
  bookmarks?: string[];

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsArray()
  readingHistory?: any[];

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  equippedDecorations?: {
    avatar: Types.ObjectId | null;
    background: Types.ObjectId | null;
    card: Types.ObjectId | null;
  };

  @IsOptional()
  ownedDecorations?: {
    decorationType: string;
    decorationId: Types.ObjectId;
    purchasedAt: Date;
  }[];
}
