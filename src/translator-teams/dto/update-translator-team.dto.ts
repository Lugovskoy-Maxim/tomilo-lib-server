import { PartialType } from '@nestjs/mapped-types';
import { CreateTranslatorTeamDto } from './create-translator-team.dto';

export class UpdateTranslatorTeamDto extends PartialType(
  CreateTranslatorTeamDto,
) {}
