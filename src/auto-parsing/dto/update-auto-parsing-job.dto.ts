import { PartialType } from '@nestjs/mapped-types';
import { CreateAutoParsingJobDto } from './create-auto-parsing-job.dto';

export class UpdateAutoParsingJobDto extends PartialType(
  CreateAutoParsingJobDto,
) {}
