import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyEmailCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Код должен содержать 6 цифр' })
  code: string;
}
