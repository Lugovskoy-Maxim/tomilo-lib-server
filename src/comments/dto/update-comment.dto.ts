import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  content: string;
}
