import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ALLOWED_REACTION_EMOJIS } from '../../schemas/comment.schema';

export class ToggleChapterReactionDto {
  @IsString()
  @IsNotEmpty()
  @IsIn([...ALLOWED_REACTION_EMOJIS])
  emoji: string;
}
