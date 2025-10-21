import { IsNotEmpty } from 'class-validator';

export class UpdateAvatarDto {
  @IsNotEmpty()
  avatar: string;
}
