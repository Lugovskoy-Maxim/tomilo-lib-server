import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { TitleStatus } from '../../schemas/title.schema';

export class CreateTitleDto {
  @IsString()
  name: string;

  @IsArray()
  @IsOptional()
  altNames?: string[];

  @IsString()
  description: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsEnum(TitleStatus)
  @IsOptional()
  status?: TitleStatus;

  @IsString()
  @IsOptional()
  author?: string;

  @IsString()
  @IsOptional()
  artist?: string;

  @IsArray()
  @IsString({ each: true })
  genres: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear())
  @IsOptional()
  releaseYear?: number;

  @IsNumber()
  @Min(0)
  @Max(18)
  @IsOptional()
  ageLimit?: number;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
