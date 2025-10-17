import { ConfigService } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';

export const getMongoConfig = (
  configService: ConfigService,
): MongooseModuleOptions => {
  const uri = `mongodb://${configService.get('MONGO_LOGIN')}:${configService.get('MONGO_PASSWORD')}@${configService.get('MONGO_HOST')}:${configService.get('MONGO_PORT')}/${configService.get('MONGO_DATABASE')}?authSource=${configService.get('MONGO_AUTHDATABASE')}`;

  console.log('Connecting to MongoDB...');

  return { uri };
};
