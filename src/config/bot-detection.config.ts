import { ConfigService } from '@nestjs/config';

/**
 * Конфигурация для системы детекции ботов и отслеживания подозрительной активности
 */
export interface BotDetectionConfig {
  // === Настройки детекции ботов ===

  /** Минимальное время между главами в миллисекундах (по умолчанию: 10 секунд) */
  MIN_TIME_BETWEEN_CHAPTERS_MS: number;

  /** Максимальное количество глав за час для подозрения в бото-активности (по умолчанию: 100) */
  MAX_CHAPTERS_PER_HOUR: number;

  /** Порог баллов для определения пользователя как бота (по умолчанию: 80) */
  BOT_SCORE_THRESHOLD: number;

  /** Порог баллов для пометки пользователя как подозрительного (по умолчанию: 50) */
  SUSPICIOUS_SCORE_THRESHOLD: number;

  // === Rate Limiting ===

  /** Лимит запросов в минуту для авторизованных пользователей (по умолчанию: 60) */
  RATE_LIMIT_NORMAL: number;

  /** Лимит запросов в минуту для анонимных пользователей (по умолчанию: 50) */
  RATE_LIMIT_ANONYMOUS: number;

  /** Лимит запросов в минуту для подозрительных пользователей (по умолчанию: 10) */
  RATE_LIMIT_SUSPICIOUS: number;

  // === IP Blocking ===

  /** Порог баллов для автоматической блокировки IP (по умолчанию: 100) */
  IP_BLOCK_THRESHOLD: number;

  /** Порог баллов для пометки IP как подозрительного (по умолчанию: 50) */
  IP_SUSPICIOUS_THRESHOLD: number;

  /** Время автоматической блокировки IP в миллисекундах (по умолчанию: 1 час = 3600000 мс) */
  IP_BLOCK_DURATION_MS: number;

  // === Ночная активность ===

  /** Начало ночного времени в часах (по умолчанию: 2 - 2:00) */
  NIGHT_TIME_START: number;

  /** Конец ночного времени в часах (по умолчанию: 6 - 6:00) */
  NIGHT_TIME_END: number;

  /** Баллы за активность в ночное время (по умолчанию: 10) */
  NIGHT_TIME_SCORE: number;

  // === Дополнительные настройки ===

  /** Максимальное количество записей в истории активности пользователя (по умолчанию: 1000) */
  MAX_USER_ACTIVITY_HISTORY: number;

  /** Максимальное количество записей в логе подозрительной активности (по умолчанию: 100) */
  MAX_SUSPICIOUS_LOG_ENTRIES: number;

  /** Время хранения истории активности в часах (по умолчанию: 24 часа) */
  ACTIVITY_HISTORY_TTL_HOURS: number;

  /** Порог запросов за день для пометки IP как подозрительного (по умолчанию: 500) */
  IP_DAILY_REQUEST_THRESHOLD: number;

  /** Минимальный интервал между запросами для подозрения в мс (по умолчанию: 500) */
  IP_MIN_INTERVAL_MS: number;

  /** Порог уникальных endpoints для подозрения (по умолчанию: 50) */
  IP_UNIQUE_ENDPOINT_THRESHOLD: number;
}

/**
 * Настройки по умолчанию для системы детекции ботов
 */
export const DEFAULT_BOT_DETECTION_CONFIG: BotDetectionConfig = {
  // === Настройки детекции ботов ===
  MIN_TIME_BETWEEN_CHAPTERS_MS: 10000, // 10 секунд
  MAX_CHAPTERS_PER_HOUR: 100,
  BOT_SCORE_THRESHOLD: 80,
  SUSPICIOUS_SCORE_THRESHOLD: 50,

  // === Rate Limiting ===
  RATE_LIMIT_NORMAL: 60,
  RATE_LIMIT_ANONYMOUS: 50,
  RATE_LIMIT_SUSPICIOUS: 10,

  // === IP Blocking ===
  IP_BLOCK_THRESHOLD: 100,
  IP_SUSPICIOUS_THRESHOLD: 50,
  IP_BLOCK_DURATION_MS: 3600000, // 1 час

  // === Ночная активность ===
  NIGHT_TIME_START: 2,
  NIGHT_TIME_END: 6,
  NIGHT_TIME_SCORE: 10,

  // === Дополнительные настройки ===
  MAX_USER_ACTIVITY_HISTORY: 1000,
  MAX_SUSPICIOUS_LOG_ENTRIES: 100,
  ACTIVITY_HISTORY_TTL_HOURS: 24,
  IP_DAILY_REQUEST_THRESHOLD: 500,
  IP_MIN_INTERVAL_MS: 500,
  IP_UNIQUE_ENDPOINT_THRESHOLD: 50,
};

/**
 * Префикс для переменных окружения
 */
export const BOT_DETECTION_ENV_PREFIX = 'BOT_DETECTION_';

/**
 * Маппинг конфигурационных ключей к переменным окружения
 */
export const ENV_KEY_MAPPING: Record<keyof BotDetectionConfig, string> = {
  MIN_TIME_BETWEEN_CHAPTERS_MS: `${BOT_DETECTION_ENV_PREFIX}MIN_TIME_BETWEEN_CHAPTERS_MS`,
  MAX_CHAPTERS_PER_HOUR: `${BOT_DETECTION_ENV_PREFIX}MAX_CHAPTERS_PER_HOUR`,
  BOT_SCORE_THRESHOLD: `${BOT_DETECTION_ENV_PREFIX}BOT_SCORE_THRESHOLD`,
  SUSPICIOUS_SCORE_THRESHOLD: `${BOT_DETECTION_ENV_PREFIX}SUSPICIOUS_SCORE_THRESHOLD`,
  RATE_LIMIT_NORMAL: `${BOT_DETECTION_ENV_PREFIX}RATE_LIMIT_NORMAL`,
  RATE_LIMIT_ANONYMOUS: `${BOT_DETECTION_ENV_PREFIX}RATE_LIMIT_ANONYMOUS`,
  RATE_LIMIT_SUSPICIOUS: `${BOT_DETECTION_ENV_PREFIX}RATE_LIMIT_SUSPICIOUS`,
  IP_BLOCK_THRESHOLD: `${BOT_DETECTION_ENV_PREFIX}IP_BLOCK_THRESHOLD`,
  IP_SUSPICIOUS_THRESHOLD: `${BOT_DETECTION_ENV_PREFIX}IP_SUSPICIOUS_THRESHOLD`,
  IP_BLOCK_DURATION_MS: `${BOT_DETECTION_ENV_PREFIX}IP_BLOCK_DURATION_MS`,
  NIGHT_TIME_START: `${BOT_DETECTION_ENV_PREFIX}NIGHT_TIME_START`,
  NIGHT_TIME_END: `${BOT_DETECTION_ENV_PREFIX}NIGHT_TIME_END`,
  NIGHT_TIME_SCORE: `${BOT_DETECTION_ENV_PREFIX}NIGHT_TIME_SCORE`,
  MAX_USER_ACTIVITY_HISTORY: `${BOT_DETECTION_ENV_PREFIX}MAX_USER_ACTIVITY_HISTORY`,
  MAX_SUSPICIOUS_LOG_ENTRIES: `${BOT_DETECTION_ENV_PREFIX}MAX_SUSPICIOUS_LOG_ENTRIES`,
  ACTIVITY_HISTORY_TTL_HOURS: `${BOT_DETECTION_ENV_PREFIX}ACTIVITY_HISTORY_TTL_HOURS`,
  IP_DAILY_REQUEST_THRESHOLD: `${BOT_DETECTION_ENV_PREFIX}IP_DAILY_REQUEST_THRESHOLD`,
  IP_MIN_INTERVAL_MS: `${BOT_DETECTION_ENV_PREFIX}IP_MIN_INTERVAL_MS`,
  IP_UNIQUE_ENDPOINT_THRESHOLD: `${BOT_DETECTION_ENV_PREFIX}IP_UNIQUE_ENDPOINT_THRESHOLD`,
};

/**
 * Функция для получения конфигурации из ConfigService
 * @param configService - NestJS ConfigService
 * @returns BotDetectionConfig с учетом переменных окружения
 */
export const getBotDetectionConfig = (
  configService: ConfigService,
): BotDetectionConfig => {
  const config: Partial<BotDetectionConfig> = {};

  // Проходим по всем ключам конфигурации и пытаемся получить из env
  for (const key of Object.keys(DEFAULT_BOT_DETECTION_CONFIG) as Array<
    keyof BotDetectionConfig
  >) {
    const envKey = ENV_KEY_MAPPING[key];
    const envValue = configService.get<number | string>(envKey);

    if (envValue !== undefined && envValue !== null) {
      // Преобразуем в число, если это число в строке
      if (typeof envValue === 'string' && !isNaN(Number(envValue))) {
        (config as any)[key] = Number(envValue);
      } else {
        (config as any)[key] = envValue;
      }
    } else {
      // Используем значение по умолчанию
      (config as any)[key] = DEFAULT_BOT_DETECTION_CONFIG[key];
    }
  }

  return config as BotDetectionConfig;
};

/**
 * Вспомогательная функция для получения одной настройки из ConfigService
 * @param configService - NestJS ConfigService
 * @param key - Ключ конфигурации
 * @returns Значение настройки
 */
export const getBotDetectionSetting = <K extends keyof BotDetectionConfig>(
  configService: ConfigService,
  key: K,
): BotDetectionConfig[K] => {
  const envKey = ENV_KEY_MAPPING[key];
  const envValue = configService.get<string | number>(envKey);

  if (envValue !== undefined && envValue !== null) {
    if (typeof envValue === 'string' && !isNaN(Number(envValue))) {
      return Number(envValue) as BotDetectionConfig[K];
    }
    return envValue as BotDetectionConfig[K];
  }

  return DEFAULT_BOT_DETECTION_CONFIG[key];
};
