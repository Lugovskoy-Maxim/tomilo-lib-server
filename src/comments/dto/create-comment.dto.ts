import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsMongoId,
  MinLength,
  MaxLength,
} from 'class-validator';
import { CommentEntityType } from '../../schemas/comment.schema';

export class CreateCommentDto {
  @IsEnum(CommentEntityType)
  @IsNotEmpty()
  entityType: CommentEntityType;

  @IsMongoId()
  @IsNotEmpty()
  entityId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @IsMongoId()
  @IsOptional()
  parentId?: string;
}
