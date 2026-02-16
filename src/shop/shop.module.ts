import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
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

const DECORATIONS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

@Module({
  imports: [
    CacheModule.register({ ttl: DECORATIONS_CACHE_TTL_MS }),
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
