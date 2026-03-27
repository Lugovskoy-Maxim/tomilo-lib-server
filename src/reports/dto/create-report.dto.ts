import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsMongoId,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';
import { ReportType } from '../../schemas/report.schema';

const REPORT_ENTITY_TYPES = ['title', 'chapter', 'comment'] as const;

export class CreateReportDto {
  @IsEnum(ReportType)
  @IsNotEmpty()
  reportType: ReportType;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @IsMongoId()
  @IsOptional()
  entityId?: string;

  @IsOptional()
  @IsIn([...REPORT_ENTITY_TYPES])
  entityType?: (typeof REPORT_ENTITY_TYPES)[number];

  @IsString()
  @IsOptional()
  url?: string;

  @IsMongoId()
  @IsOptional()
  creatorId?: string;

  @IsMongoId()
  @IsOptional()
  titleId?: string;
}
