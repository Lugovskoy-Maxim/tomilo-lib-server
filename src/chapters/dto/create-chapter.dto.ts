import { Type } from 'class-transformer';
import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsMongoId,
  IsBoolean,
  // IsDate,
} from 'class-validator';

export class CreateChapterDto {
  @IsMongoId()
  titleId: string;

  @IsNumber()
  @Type(() => Number)
  chapterNumber: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pages?: string[];

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isPublished?: boolean;

  @IsString()
  @IsOptional()
  translator?: string;

  // @IsDate()
  @IsOptional()
  releaseDate?: Date;
}
