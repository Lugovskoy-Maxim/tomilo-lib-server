export const getMongoConfig = (
  configService: ConfigService,
): MongooseModuleOptions => {
  const login = encodeURIComponent(configService.get('MONGO_LOGIN'));
  const password = encodeURIComponent(configService.get('MONGO_PASSWORD'));
  
  const uri = `mongodb://${login}:${password}@${configService.get('MONGO_HOST')}:${configService.get('MONGO_PORT')}/${configService.get('MONGO_DATABASE')}?authSource=admin`;

  console.log('Connecting to MongoDB...');

  return { 
    uri,
    retryAttempts: 5,
    retryDelay: 3000
  };
};
