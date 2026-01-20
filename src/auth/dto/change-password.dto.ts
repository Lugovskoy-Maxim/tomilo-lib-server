import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  readonly currentPassword: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  readonly newPassword: string;
}
