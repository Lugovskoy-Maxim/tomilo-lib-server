import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TranslatorTeam,
  TranslatorTeamSchema,
} from '../schemas/translator-team.schema';
import { Title, TitleSchema } from '../schemas/title.schema';
import { TranslatorTeamsService } from './translator-teams.service';
import { TranslatorTeamsController } from './translator-teams.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TranslatorTeam.name, schema: TranslatorTeamSchema },
      { name: Title.name, schema: TitleSchema },
    ]),
    FilesModule,
  ],
  controllers: [TranslatorTeamsController],
  providers: [TranslatorTeamsService],
  exports: [TranslatorTeamsService],
})
export class TranslatorTeamsModule {}
