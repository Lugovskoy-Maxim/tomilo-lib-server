import { IsString, IsOptional, IsArray, IsBoolean, IsObject, IsEnum } from 'class-validator';

const ROLES = ['translator', 'editor', 'proofreader', 'cleaner', 'typesetter', 'leader'] as const;

export class TranslatorTeamMemberDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsString()
  @IsEnum(ROLES)
  role: string;

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}

export class CreateTranslatorTeamDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  banner?: string;

  @IsOptional()
  @IsArray()
  members?: TranslatorTeamMemberDto[];

  @IsOptional()
  @IsArray()
  titleIds?: string[];

  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;

  @IsOptional()
  @IsObject()
  donationLinks?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
