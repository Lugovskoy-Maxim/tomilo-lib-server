import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import { TitleStatus } from '../../schemas/title.schema';

export class CreateTitleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  altNames?: string[];

  @IsString()
  @IsNotEmpty()
  description: string;

  // 👇 это правильно — string, а не File!
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
  @IsNotEmpty()
  genres: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  @IsOptional()
  releaseYear?: number;

  @IsNumber()
  @Min(0)
  @Max(18)
  @IsOptional()
  ageLimit?: number;

  @IsString()
  @IsOptional()
  type?: string;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
