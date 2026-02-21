import { ConfigService } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';

export const getMongoConfig = (
  configService: ConfigService,
): MongooseModuleOptions => {
  const uri = configService.get('MONGO_URI');
  if (uri) {
    return {
      uri,
      retryAttempts: 2,
      retryDelay: 1000,
    };
  }

  const login = configService.get('MONGO_LOGIN');
  const password = configService.get('MONGO_PASSWORD');
  const host = configService.get('MONGO_HOST');
  const port = configService.get('MONGO_PORT');
  const database = configService.get('MONGO_DATABASE');
  const authDatabase = configService.get('MONGO_AUTHDATABASE');

  const builtUri = `mongodb://${login}:${password}@${host}:${port}/${database}?authSource=${authDatabase}`;

  console.log('Connecting to MongoDB...');
  console.log(`Host: ${host}:${port}`);
  console.log(`Database: ${database}`);
  console.log(`Auth DB: ${authDatabase}`);

  return {
    uri: builtUri,
    retryAttempts: 5,
    retryDelay: 3000,
  };
};
