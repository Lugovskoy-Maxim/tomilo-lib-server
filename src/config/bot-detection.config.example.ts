/**
 * Пример конфигурации для системы детекции ботов
 *
 * Этот файл содержит примеры настроек и документацию.
 * Для переопределения значений используйте переменные окружения:
 *
 * Пример:
 *   export BOT_DETECTION_RATE_LIMIT_NORMAL=100
 *   export BOT_DETECTION_IP_BLOCK_THRESHOLD=150
 *
 * Или скопируйте эти настройки в ваш .env файл
 */

// === Настройки детекции ботов ===

/**
 * MIN_TIME_BETWEEN_CHAPTERS_MS
 * Минимальное время между просмотром глав в миллисекундах.
 * Если пользователь переходит между главами быстрее этого времени - подозрительно.
 *
 * По умолчанию: 10000 (10 секунд)
 * Переменная окружения: BOT_DETECTION_MIN_TIME_BETWEEN_CHAPTERS_MS
 */
export const MIN_TIME_BETWEEN_CHAPTERS_MS = 10000;

/**
 * MAX_CHAPTERS_PER_HOUR
 * Максимальное количество глав за час, после которого пользователь помечается как подозрительный.
 *
 * По умолчанию: 100
 * Переменная окружения: BOT_DETECTION_MAX_CHAPTERS_PER_HOUR
 */
export const MAX_CHAPTERS_PER_HOUR = 100;

/**
 * BOT_SCORE_THRESHOLD
 * Порог баллов для определения пользователя как бота.
 * Баллы начисляются за различные подозрительные действия.
 *
 * По умолчанию: 80
 * Переменная окружения: BOT_DETECTION_BOT_SCORE_THRESHOLD
 */
export const BOT_SCORE_THRESHOLD = 80;

/**
 * SUSPICIOUS_SCORE_THRESHOLD
 * Порог баллов для пометки пользователя как подозрительного.
 *
 * По умолчанию: 50
 * Переменная окружения: BOT_DETECTION_SUSPICIOUS_SCORE_THRESHOLD
 */
export const SUSPICIOUS_SCORE_THRESHOLD = 50;

// === Rate Limiting ===

/**
 * RATE_LIMIT_NORMAL
 * Лимит запросов в минуту для авторизованных пользователей.
 *
 * По умолчанию: 480
 * Переменная окружения: BOT_DETECTION_RATE_LIMIT_NORMAL
 */
export const RATE_LIMIT_NORMAL = 480;

/**
 * RATE_LIMIT_ANONYMOUS
 * Лимит запросов в минуту для анонимных (неавторизованных) пользователей.
 *
 * По умолчанию: 450
 * Переменная окружения: BOT_DETECTION_RATE_LIMIT_ANONYMOUS
 */
export const RATE_LIMIT_ANONYMOUS = 450;

/**
 * RATE_LIMIT_SUSPICIOUS
 * Лимит запросов в минуту для подозрительных пользователей/IP.
 * Более строгий лимит для тех, кто уже помечен как подозрительный.
 *
 * По умолчанию: 30
 * Переменная окружения: BOT_DETECTION_RATE_LIMIT_SUSPICIOUS
 */
export const RATE_LIMIT_SUSPICIOUS = 30;

// === IP Blocking ===

/**
 * IP_BLOCK_THRESHOLD
 * Порог баллов для автоматической блокировки IP-адреса.
 *
 * По умолчанию: 100
 * Переменная окружения: BOT_DETECTION_IP_BLOCK_THRESHOLD
 */
export const IP_BLOCK_THRESHOLD = 100;

/**
 * IP_SUSPICIOUS_THRESHOLD
 * Порог баллов для пометки IP-адреса как подозрительного.
 *
 * По умолчанию: 50
 * Переменная окружения: BOT_DETECTION_IP_SUSPICIOUS_THRESHOLD
 */
export const IP_SUSPICIOUS_THRESHOLD = 50;

/**
 * IP_BLOCK_DURATION_MS
 * Время автоматической блокировки IP в миллисекундах.
 *
 * По умолчанию: 3600000 (1 час)
 * Переменная окружения: BOT_DETECTION_IP_BLOCK_DURATION_MS
 */
export const IP_BLOCK_DURATION_MS = 3600000;

// === Ночная активность ===

/**
 * NIGHT_TIME_START
 * Начало ночного времени в часах (0-23).
 * Активность в это время добавляет баллы подозрительности.
 *
 * По умолчанию: 2 (2:00 ночи)
 * Переменная окружения: BOT_DETECTION_NIGHT_TIME_START
 */
export const NIGHT_TIME_START = 2;

/**
 * NIGHT_TIME_END
 * Конец ночного времени в часах (0-23).
 *
 * По умолчанию: 6 (6:00 утра)
 * Переменная окружения: BOT_DETECTION_NIGHT_TIME_END
 */
export const NIGHT_TIME_END = 6;

/**
 * NIGHT_TIME_SCORE
 * Количество баллов, добавляемых за активность в ночное время.
 *
 * По умолчанию: 10
 * Переменная окружения: BOT_DETECTION_NIGHT_TIME_SCORE
 */
export const NIGHT_TIME_SCORE = 10;

// === Дополнительные настройки ===

/**
 * MAX_USER_ACTIVITY_HISTORY
 * Максимальное количество записей в истории активности пользователя в памяти.
 *
 * По умолчанию: 1000
 * Переменная окружения: BOT_DETECTION_MAX_USER_ACTIVITY_HISTORY
 */
export const MAX_USER_ACTIVITY_HISTORY = 1000;

/**
 * MAX_SUSPICIOUS_LOG_ENTRIES
 * Максимальное количество записей в логе подозрительной активности.
 *
 * По умолчанию: 100
 * Переменная окружения: BOT_DETECTION_MAX_SUSPICIOUS_LOG_ENTRIES
 */
export const MAX_SUSPICIOUS_LOG_ENTRIES = 100;

/**
 * ACTIVITY_HISTORY_TTL_HOURS
 * Время хранения истории активности в часах.
 *
 * По умолчанию: 24
 * Переменная окружения: BOT_DETECTION_ACTIVITY_HISTORY_TTL_HOURS
 */
export const ACTIVITY_HISTORY_TTL_HOURS = 24;

/**
 * IP_DAILY_REQUEST_THRESHOLD
 * Порог запросов за день для пометки IP как подозрительного.
 *
 * По умолчанию: 500
 * Переменная окружения: BOT_DETECTION_IP_DAILY_REQUEST_THRESHOLD
 */
export const IP_DAILY_REQUEST_THRESHOLD = 500;

/**
 * IP_MIN_INTERVAL_MS
 * Минимальный интервал между запросами в мс для подозрения в бото-активности.
 *
 * По умолчанию: 500 (0.5 секунды)
 * Переменная окружения: BOT_DETECTION_IP_MIN_INTERVAL_MS
 */
export const IP_MIN_INTERVAL_MS = 500;

/**
 * IP_UNIQUE_ENDPOINT_THRESHOLD
 * Порог уникальных endpoints для подозрения в сканировании.
 *
 * По умолчанию: 50
 * Переменная окружения: BOT_DETECTION_IP_UNIQUE_ENDPOINT_THRESHOLD
 */
export const IP_UNIQUE_ENDPOINT_THRESHOLD = 50;

// === Пример полного объекта конфигурации ===

/**
 * Пример объекта конфигурации для использования в коде:
 *
 * import { BOT_DETECTION_CONFIG } from './bot-detection.config.example';
 *
 * const config = {
 *   MIN_TIME_BETWEEN_CHAPTERS_MS: BOT_DETECTION_CONFIG.MIN_TIME_BETWEEN_CHAPTERS_MS,
 *   // ... остальные настройки
 * };
 */
export const BOT_DETECTION_CONFIG = {
  MIN_TIME_BETWEEN_CHAPTERS_MS,
  MAX_CHAPTERS_PER_HOUR,
  BOT_SCORE_THRESHOLD,
  SUSPICIOUS_SCORE_THRESHOLD,
  RATE_LIMIT_NORMAL,
  RATE_LIMIT_ANONYMOUS,
  RATE_LIMIT_SUSPICIOUS,
  IP_BLOCK_THRESHOLD,
  IP_SUSPICIOUS_THRESHOLD,
  IP_BLOCK_DURATION_MS,
  NIGHT_TIME_START,
  NIGHT_TIME_END,
  NIGHT_TIME_SCORE,
  MAX_USER_ACTIVITY_HISTORY,
  MAX_SUSPICIOUS_LOG_ENTRIES,
  ACTIVITY_HISTORY_TTL_HOURS,
  IP_DAILY_REQUEST_THRESHOLD,
  IP_MIN_INTERVAL_MS,
  IP_UNIQUE_ENDPOINT_THRESHOLD,
} as const;

/**
 * Тип конфигурации для TypeScript
 */
export type BotDetectionConfigType = typeof BOT_DETECTION_CONFIG;
