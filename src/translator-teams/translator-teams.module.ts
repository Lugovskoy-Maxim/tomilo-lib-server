import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TranslatorTeam,
  TranslatorTeamSchema,
} from '../schemas/translator-team.schema';
import { TranslatorTeamsService } from './translator-teams.service';
import { TranslatorTeamsController } from './translator-teams.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TranslatorTeam.name, schema: TranslatorTeamSchema },
    ]),
  ],
  controllers: [TranslatorTeamsController],
  providers: [TranslatorTeamsService],
  exports: [TranslatorTeamsService],
})
export class TranslatorTeamsModule {}
