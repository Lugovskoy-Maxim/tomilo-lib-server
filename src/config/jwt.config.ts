import { ConfigService } from '@nestjs/config';

const DEV_SECRET = 'dev-only-secret-change-in-production';

/**
 * Единый источник JWT секрета. В production JWT_SECRET обязателен (без дефолта в коде).
 * Предпочтительно использовать getJwtSecretFromConfig(ConfigService), чтобы секрет
 * читался после загрузки конфига и совпадал при подписи и верификации.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error(
      'JWT_SECRET must be set in production. Add it to your environment.',
    );
  }
  return secret || DEV_SECRET;
}

/**
 * Секрет из ConfigService (использовать в JwtModule и JwtStrategy после загрузки ConfigModule).
 */
export function getJwtSecretFromConfig(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error(
      'JWT_SECRET must be set in production. Add it to your environment.',
    );
  }
  return secret || DEV_SECRET;
}
