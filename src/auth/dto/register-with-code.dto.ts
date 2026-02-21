import { IsEmail, IsString, Length, MinLength, IsOptional } from 'class-validator';

export class RegisterWithCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsString()
  @Length(6, 6, { message: 'Код должен содержать 6 цифр' })
  code: string;
}
