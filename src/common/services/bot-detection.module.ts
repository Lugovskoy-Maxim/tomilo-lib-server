import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { BotDetectionService } from './bot-detection.service';
import { User, UserSchema } from '../../schemas/user.schema';
import { IPActivity, IPActivitySchema } from '../../schemas/ip-activity.schema';

@Module({
  imports: [
    ConfigModule, // Required for BotDetectionService to access configuration
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: IPActivity.name, schema: IPActivitySchema },
    ]),
  ],
  providers: [BotDetectionService],
  exports: [BotDetectionService],
})
export class BotDetectionModule {}
