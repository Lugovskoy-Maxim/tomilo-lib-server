import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { TitlesModule } from './titles/titles.module';
import { ChaptersModule } from './chapters/chapters.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getMongoConfig } from './config/mongo-config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMongoConfig,
    }),
    ConfigModule.forRoot(),
    UsersModule,
    AuthModule,
    TitlesModule,
    ChaptersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
