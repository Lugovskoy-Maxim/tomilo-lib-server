import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from '../schemas/user.schema';
import { FilesModule } from '../files/files.module';
import { ChaptersModule } from '../chapters/chapters.module';
import { BotDetectionService } from '../common/services/bot-detection.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    FilesModule,
    ChaptersModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, BotDetectionService],
  exports: [UsersService],
})
export class UsersModule {}
