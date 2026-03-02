import { IsString, MaxLength } from 'class-validator';

export class RedeemPromoCodeDto {
  @IsString()
  @MaxLength(50)
  code: string;
}
