import { Module, Global } from '@nestjs/common';
import { AchievementsService } from './achievements.service';

@Global()
@Module({
  providers: [AchievementsService],
  exports: [AchievementsService],
})
export class AchievementsModule {}
