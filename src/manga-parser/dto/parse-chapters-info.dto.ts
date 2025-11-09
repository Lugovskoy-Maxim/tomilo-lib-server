import { IsUrl, IsOptional, IsArray, IsString } from 'class-validator';

export class ParseChaptersInfoDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chapterNumbers?: string[];
}
