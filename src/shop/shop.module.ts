import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import {
  AvatarDecoration,
  AvatarDecorationSchema,
} from '../schemas/avatar-decoration.schema';
import {
  BackgroundDecoration,
  BackgroundDecorationSchema,
} from '../schemas/background-decoration.schema';
import {
  CardDecoration,
  CardDecorationSchema,
} from '../schemas/card-decoration.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AvatarDecoration.name, schema: AvatarDecorationSchema },
      { name: BackgroundDecoration.name, schema: BackgroundDecorationSchema },
      { name: CardDecoration.name, schema: CardDecorationSchema },
    ]),
    UsersModule,
  ],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
