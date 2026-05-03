import { IsString, IsNotEmpty } from 'class-validator';

export class AddFriendDto {
  @IsString()
  @IsNotEmpty()
  friendId: string;
}

export class RemoveFriendDto {
  @IsString()
  @IsNotEmpty()
  friendId: string;
}

export class BlockUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class UnblockUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
