import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsMongoId,
  IsBoolean,
  IsDate,
} from 'class-validator';

export class CreateChapterDto {
  @IsMongoId()
  titleId: string;

  @IsNumber()
  chapterNumber: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsString({ each: true })
  pages: string[];

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @IsString()
  @IsOptional()
  translator?: string;

  @IsDate()
  @IsOptional()
  releaseDate?: Date;
}
