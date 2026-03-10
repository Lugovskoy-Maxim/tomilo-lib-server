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
  IsMongoId,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TitleStatus } from '../../schemas/title.schema';

export const RELATED_TITLE_TYPES = ['sequel', 'prequel', 'spin_off', 'adaptation', 'side_story', 'alternative_story', 'other'] as const;

export class RelatedTitleItemDto {
  @IsString()
  @IsIn(RELATED_TITLE_TYPES)
  relationType: (typeof RELATED_TITLE_TYPES)[number];

  @IsString()
  @IsMongoId()
  titleId: string;
}

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

  /** Главы удалены по просьбе правообладателя — при true главы не возвращаются в API */
  @IsBoolean()
  @IsOptional()
  chaptersRemovedByCopyrightHolder?: boolean;

  /** Связанные тайтлы: сиквел, приквел, спинофф и т.д. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedTitleItemDto)
  relatedTitles?: RelatedTitleItemDto[];
}
