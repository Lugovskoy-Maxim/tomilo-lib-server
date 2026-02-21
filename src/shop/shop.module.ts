import { Module, OnModuleInit } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import * as fs from 'fs';
import * as path from 'path';
import { MongooseModule } from '@nestjs/mongoose';
import { ShopController } from './shop.controller';
import { ShopAdminController } from './shop-admin.controller';
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
  controllers: [ShopController, ShopAdminController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule implements OnModuleInit {
  onModuleInit() {
    const dir = path.join(process.cwd(), 'uploads', 'decorations');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
