import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsMongoId,
  MinLength,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
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

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return value === true || value === 'true';
  })
  @IsBoolean()
  isSpoiler?: boolean;
}
