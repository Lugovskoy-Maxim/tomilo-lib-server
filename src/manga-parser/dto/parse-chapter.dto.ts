import { IsString, IsUrl, IsOptional, IsArray } from 'class-validator';

export class ParseChapterDto {
  @IsUrl()
  url: string;

  @IsString()
  titleId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chapterNumbers?: string[];
}
