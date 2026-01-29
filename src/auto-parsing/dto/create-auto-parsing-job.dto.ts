import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { ParsingFrequency } from '../../schemas/auto-parsing-job.schema';

export class CreateAutoParsingJobDto {
  @IsString()
  titleId: string;

  /**
   * @deprecated Use sources instead. Kept for backward compatibility.
   */
  @IsOptional()
  @IsString()
  url?: string;

  /**
   * Array of source URLs to check sequentially for new chapters.
   * The service will try each source in order until new chapters are found.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one source URL is required' })
  @IsString({ each: true })
  sources?: string[];

  @IsOptional()
  @IsEnum(ParsingFrequency)
  frequency?: ParsingFrequency;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
