import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsArray } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsArray()
  bookmarks?: string[];

  @IsOptional()
  @IsArray()
  readingHistory?: any[];
}
