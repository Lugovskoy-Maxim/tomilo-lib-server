import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AchievementsService } from './achievements.service';
import { AchievementsAdminController } from './achievements-admin.controller';
import { AchievementsAdminService } from './achievements-admin.service';
import {
  Achievement,
  AchievementSchema,
} from '../schemas/achievement.schema';
import { User, UserSchema } from '../schemas/user.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Achievement.name, schema: AchievementSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AchievementsAdminController],
  providers: [AchievementsService, AchievementsAdminService],
  exports: [AchievementsService, AchievementsAdminService],
})
export class AchievementsModule {}
