import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  MinLength,
  MaxLength,
} from 'class-validator';
import { CharacterRole } from '../../schemas/character.schema';

export class CreateCharacterDto {
  @IsMongoId()
  titleId: string;

  @IsString()
  @MinLength(1, { message: 'Имя обязательно' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(CharacterRole)
  role?: CharacterRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  altNames?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  age?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  guild?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  voiceActor?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
