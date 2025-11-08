import {
  IsString,
  IsUrl,
  IsOptional,
  IsArray,
  IsNumber,
} from 'class-validator';

export class ParseTitleDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  chapterNumbers?: number[];

  @IsOptional()
  @IsString()
  customTitle?: string;

  @IsOptional()
  @IsString()
  customDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customGenres?: string[];
}
