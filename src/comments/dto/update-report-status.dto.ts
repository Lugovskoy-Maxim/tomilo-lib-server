import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReportStatusDto {
  @IsBoolean()
  isResolved: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  resolutionMessage?: string;
}
