import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsObject,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { AnnouncementLayout, ContentBlockType } from '../../schemas/announcement.schema';

export class ContentBlockDto {
  @IsEnum(ContentBlockType)
  type: ContentBlockType;

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  style?: Record<string, string>;
}

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  slug?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  shortDescription?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsArray()
  @IsOptional()
  contentBlocks?: ContentBlockDto[];

  @IsString()
  @IsOptional()
  coverImage?: string | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsEnum(AnnouncementLayout)
  @IsOptional()
  layout?: AnnouncementLayout;

  @IsObject()
  @IsOptional()
  style?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
