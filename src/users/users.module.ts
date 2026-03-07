import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from '../schemas/user.schema';
import { FilesModule } from '../files/files.module';
import { ChaptersModule } from '../chapters/chapters.module';
import { BotDetectionModule } from '../common/services/bot-detection.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    FilesModule,
    forwardRef(() => ChaptersModule),
    BotDetectionModule,
    PushModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
