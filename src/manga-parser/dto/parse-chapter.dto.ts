import { IsString, IsUrl, IsOptional, IsNumber } from 'class-validator';

export class ParseChapterDto {
  @IsUrl()
  url: string;

  @IsString()
  titleId: string;

  @IsNumber()
  chapterNumber: number;

  @IsOptional()
  @IsString()
  customName?: string;
}
