import { IsUrl } from 'class-validator';

export class ParseMetadataDto {
  @IsUrl()
  url: string;
}
