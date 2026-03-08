import { IsString, IsUrl, IsOptional, IsArray, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncChaptersDto {
  @IsString()
  titleId: string;

  @IsUrl()
  sourceUrl: string;

  /** Номера глав для синхронизации; если не указано — синхронизируются все главы тайтла */
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  chapterNumbers?: number[];
}
