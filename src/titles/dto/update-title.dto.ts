// update-title.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateTitleDto } from './create-title.dto';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { TitleStatus } from '../../schemas/title.schema';

export class UpdateTitleDto extends PartialType(CreateTitleDto) {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsArray()
  altNames?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  genres?: string[];

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  status?: TitleStatus;

  @IsOptional()
  @IsNumber()
  @Min(1900)
  releaseYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ageLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalChapters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  views?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  rating?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
