import { IsString, IsUrl, IsOptional, IsArray } from 'class-validator';

export class ParseTitleDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chapterNumbers?: string[];

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

  @IsOptional()
  @IsString()
  customType?: string;
}
