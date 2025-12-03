import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
