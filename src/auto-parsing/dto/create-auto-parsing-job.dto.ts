import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ParsingFrequency } from '../../schemas/auto-parsing-job.schema';

export class CreateAutoParsingJobDto {
  @IsString()
  titleId: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsEnum(ParsingFrequency)
  frequency?: ParsingFrequency;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
