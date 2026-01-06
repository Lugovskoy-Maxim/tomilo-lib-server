import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsMongoId,
  MinLength,
  MaxLength,
} from 'class-validator';

export enum ReportType {
  ERROR = 'error',
  TYPO = 'typo',
  COMPLAINT = 'complaint',
}

export class CreateReportDto {
  @IsEnum(ReportType)
  @IsNotEmpty()
  reportType: ReportType;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  content: string;

  @IsMongoId()
  @IsOptional()
  entityId?: string;

  @IsString()
  @IsOptional()
  entityType?: string;

  @IsString()
  @IsOptional()
  url?: string;
}
