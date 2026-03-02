import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PromocodesController } from './promocodes.controller';
import { PromocodesAdminController } from './promocodes-admin.controller';
import { PromocodesService } from './promocodes.service';
import { PromoCode, PromoCodeSchema } from '../schemas/promo-code.schema';
import {
  PromoCodeUsage,
  PromoCodeUsageSchema,
} from '../schemas/promo-code-usage.schema';
import { User, UserSchema } from '../schemas/user.schema';
import {
  AvatarDecoration,
  AvatarDecorationSchema,
} from '../schemas/avatar-decoration.schema';
import {
  AvatarFrameDecoration,
  AvatarFrameDecorationSchema,
} from '../schemas/avatar-frame-decoration.schema';
import {
  BackgroundDecoration,
  BackgroundDecorationSchema,
} from '../schemas/background-decoration.schema';
import {
  CardDecoration,
  CardDecorationSchema,
} from '../schemas/card-decoration.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PromoCode.name, schema: PromoCodeSchema },
      { name: PromoCodeUsage.name, schema: PromoCodeUsageSchema },
      { name: User.name, schema: UserSchema },
      { name: AvatarDecoration.name, schema: AvatarDecorationSchema },
      { name: AvatarFrameDecoration.name, schema: AvatarFrameDecorationSchema },
      { name: BackgroundDecoration.name, schema: BackgroundDecorationSchema },
      { name: CardDecoration.name, schema: CardDecorationSchema },
    ]),
  ],
  controllers: [PromocodesController, PromocodesAdminController],
  providers: [PromocodesService],
  exports: [PromocodesService],
})
export class PromocodesModule {}
