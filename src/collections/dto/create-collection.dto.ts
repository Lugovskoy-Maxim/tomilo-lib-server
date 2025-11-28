import { IsString, IsOptional, IsArray, IsMongoId } from 'class-validator';

export class CreateCollectionDto {
  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  titles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  comments?: string[];
}
