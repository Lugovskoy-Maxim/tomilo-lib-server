import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameItem, GameItemSchema } from '../schemas/game-item.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Character, CharacterSchema } from '../schemas/character.schema';
import {
  CharacterCard,
  CharacterCardSchema,
} from '../schemas/character-card.schema';
import {
  ReadingDropRule,
  ReadingDropRuleSchema,
} from '../schemas/reading-drop-rule.schema';
import {
  DailyQuestItemReward,
  DailyQuestItemRewardSchema,
} from '../schemas/daily-quest-item-reward.schema';
import {
  LeaderboardReward,
  LeaderboardRewardSchema,
} from '../schemas/leaderboard-reward.schema';
import {
  DisciplesConfig,
  DisciplesConfigSchema,
} from '../schemas/disciples-config.schema';
import { Technique, TechniqueSchema } from '../schemas/technique.schema';
import {
  AlchemyRecipe,
  AlchemyRecipeSchema,
} from '../schemas/alchemy-recipe.schema';
import { WheelConfig, WheelConfigSchema } from '../schemas/wheel-config.schema';
import { GameItemsService } from './game-items.service';
import { GameItemsAdminService } from './game-items-admin.service';
import { GameItemsAdminController } from './game-items-admin.controller';
import { DropsService } from './drops.service';
import { FilesModule } from '../files/files.module';
import { DisciplesService } from './disciples.service';
import { AlchemyService } from './alchemy.service';
import { WheelService } from './wheel.service';

@Module({
  imports: [
    FilesModule,
    MongooseModule.forFeature([
      { name: GameItem.name, schema: GameItemSchema },
      { name: User.name, schema: UserSchema },
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterCard.name, schema: CharacterCardSchema },
      { name: ReadingDropRule.name, schema: ReadingDropRuleSchema },
      { name: DailyQuestItemReward.name, schema: DailyQuestItemRewardSchema },
      { name: LeaderboardReward.name, schema: LeaderboardRewardSchema },
      { name: DisciplesConfig.name, schema: DisciplesConfigSchema },
      { name: Technique.name, schema: TechniqueSchema },
      { name: AlchemyRecipe.name, schema: AlchemyRecipeSchema },
      { name: WheelConfig.name, schema: WheelConfigSchema },
    ]),
  ],
  controllers: [GameItemsAdminController],
  providers: [
    GameItemsService,
    GameItemsAdminService,
    DropsService,
    DisciplesService,
    AlchemyService,
    WheelService,
  ],
  exports: [
    GameItemsService,
    DropsService,
    DisciplesService,
    AlchemyService,
    WheelService,
  ],
})
export class GameItemsModule {}
