import { IsString, IsOptional, IsEnum } from 'class-validator';

const ROLES = [
  'translator',
  'editor',
  'proofreader',
  'cleaner',
  'typesetter',
  'leader',
] as const;

export class AddMemberDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  name: string;

  @IsString()
  @IsEnum(ROLES)
  role: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
