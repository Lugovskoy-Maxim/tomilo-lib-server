import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../schemas/user.schema';
import {
  IPActivity,
  IPActivityDocument,
} from '../../schemas/ip-activity.schema';
import {
  BotDetectionConfig,
  getBotDetectionConfig,
} from '../../config/bot-detection.config';

export interface BotDetectionResult {
  isBot: boolean;
  isSuspicious: boolean;
  botScore: number;
  reasons: string[];
}

export interface ActivityCheck {
  userId: string;
  chapterId: string;
  titleId: string;
  timestamp: Date;
}

export interface IPCheckResult {
  allowed: boolean;
  isBlocked: boolean;
  isSuspicious: boolean;
  botScore: number;
  remainingMs: number;
  reasons: string[];
}

export interface RequestInfo {
  ip: string;
  endpoint: string;
  method: string;
  userAgent?: string;
  userId?: string;
}

@Injectable()
export class BotDetectionService {
  private readonly logger = new Logger(BotDetectionService.name);

  // Конфигурация (загружается из ConfigService или используются значения по умолчанию)
  private readonly config: BotDetectionConfig;

  // Хранилище последней активности (в продакшене использовать Redis)
  private readonly userActivityHistory: Map<string, ActivityCheck[]> =
    new Map();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(IPActivity.name)
    private ipActivityModel: Model<IPActivityDocument>,
    private configService: ConfigService,
  ) {
    // Загружаем конфигурацию из ConfigService с поддержкой переменных окружения
    this.config = getBotDetectionConfig(this.configService);

    this.logger.log('BotDetectionService initialized with config:');
    this.logger.log(
      `  MIN_TIME_BETWEEN_CHAPTERS_MS: ${this.config.MIN_TIME_BETWEEN_CHAPTERS_MS}ms`,
    );
    this.logger.log(
      `  MAX_CHAPTERS_PER_HOUR: ${this.config.MAX_CHAPTERS_PER_HOUR}`,
    );
    this.logger.log(
      `  BOT_SCORE_THRESHOLD: ${this.config.BOT_SCORE_THRESHOLD}`,
    );
    this.logger.log(
      `  SUSPICIOUS_SCORE_THRESHOLD: ${this.config.SUSPICIOUS_SCORE_THRESHOLD}`,
    );
    this.logger.log(
      `  RATE_LIMIT_NORMAL: ${this.config.RATE_LIMIT_NORMAL}/min`,
    );
    this.logger.log(
      `  RATE_LIMIT_ANONYMOUS: ${this.config.RATE_LIMIT_ANONYMOUS}/min`,
    );
    this.logger.log(
      `  RATE_LIMIT_SUSPICIOUS: ${this.config.RATE_LIMIT_SUSPICIOUS}/min`,
    );
    this.logger.log(`  IP_BLOCK_THRESHOLD: ${this.config.IP_BLOCK_THRESHOLD}`);
    this.logger.log(
      `  IP_SUSPICIOUS_THRESHOLD: ${this.config.IP_SUSPICIOUS_THRESHOLD}`,
    );
    this.logger.log(
      `  Night time: ${this.config.NIGHT_TIME_START}:00 - ${this.config.NIGHT_TIME_END}:00`,
    );
  }

  /**
   * Проверить активность на признаки бота
   */
  async checkActivity(
    userId: string,
    chapterId: string,
    titleId: string,
  ): Promise<BotDetectionResult> {
    const reasons: string[] = [];
    let botScore = 0;
    const now = new Date();

    // 1. Получаем историю активности пользователя
    const activityHistory = this.getUserActivityHistory(userId);

    // 2. Проверка скорости между главами
    const speedCheck = this.checkReadingSpeed(activityHistory, now);
    if (speedCheck.isSuspicious) {
      botScore += speedCheck.score;
      reasons.push(...speedCheck.reasons);
    }

    // 3. Проверка объема за час
    const volumeCheck = this.checkHourlyVolume(activityHistory, now);
    if (volumeCheck.isSuspicious) {
      botScore += volumeCheck.score;
      reasons.push(...volumeCheck.reasons);
    }

    // 4. Проверка последовательности чтения
    const sequenceCheck = this.checkReadingSequence(activityHistory, titleId);
    if (sequenceCheck.isSuspicious) {
      botScore += sequenceCheck.score;
      reasons.push(...sequenceCheck.reasons);
    }

    // 5. Проверка времени суток (ночная активность)
    const nightTimeCheck = this.checkNightTime(now);
    if (nightTimeCheck.isSuspicious) {
      botScore += nightTimeCheck.score;
      reasons.push(...nightTimeCheck.reasons);
    }

    const isBot = botScore >= this.config.BOT_SCORE_THRESHOLD;
    const isSuspicious = botScore >= this.config.SUSPICIOUS_SCORE_THRESHOLD;

    // Логируем подозрительную активность
    if (isSuspicious) {
      this.logger.warn(
        `Suspicious activity detected for user ${userId}: score=${botScore}, reasons=${JSON.stringify(reasons)}`,
      );

      // Записываем в лог активности пользователя
      await this.logSuspiciousActivity(userId, {
        botScore,
        reasons,
        chapterId,
        titleId,
        timestamp: now,
      });
    }

    // Добавляем текущую активность в историю
    this.addActivityToHistory(userId, {
      userId,
      chapterId,
      titleId,
      timestamp: now,
    });

    return {
      isBot,
      isSuspicious,
      botScore,
      reasons,
    };
  }

  /**
   * Проверить скорость чтения между главами
   */
  private checkReadingSpeed(
    history: ActivityCheck[],
    now: Date,
  ): { isSuspicious: boolean; score: number; reasons: string[] } {
    const result = { isSuspicious: false, score: 0, reasons: [] as string[] };

    if (history.length === 0) {
      return result;
    }

    // Сортируем по времени (новые первые)
    const sorted = [...history].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

    // Берем последнюю активность
    const lastActivity = sorted[0];
    const timeDiff = now.getTime() - lastActivity.timestamp.getTime();

    // Проверяем минимальное время между главами
    if (timeDiff < this.config.MIN_TIME_BETWEEN_CHAPTERS_MS) {
      result.isSuspicious = true;
      result.score = 20; // Высокий вес - это явный признак бота
      result.reasons.push(
        `Reading speed too fast: ${Math.round(timeDiff / 1000)}s between chapters (min: ${this.config.MIN_TIME_BETWEEN_CHAPTERS_MS / 1000}s)`,
      );
    }

    return result;
  }

  /**
   * Проверить количество глав за час
   */
  private checkHourlyVolume(
    history: ActivityCheck[],
    now: Date,
  ): { isSuspicious: boolean; score: number; reasons: string[] } {
    const result = { isSuspicious: false, score: 0, reasons: [] as string[] };

    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    const recentActivities = history.filter(
      (a) => a.timestamp.getTime() > oneHourAgo,
    );
    const count = recentActivities.length + 1; // +1 текущая активность

    if (count > this.config.MAX_CHAPTERS_PER_HOUR) {
      result.isSuspicious = true;
      result.score = 30;
      result.reasons.push(
        `High volume: ${count} chapters in the last hour (max: ${this.config.MAX_CHAPTERS_PER_HOUR})`,
      );
    }

    return result;
  }

  /**
   * Проверить последовательность чтения (боты читают строго по порядку)
   */
  private checkReadingSequence(
    history: ActivityCheck[],
    currentTitleId: string,
  ): { isSuspicious: boolean; score: number; reasons: string[] } {
    const result = { isSuspicious: false, score: 0, reasons: [] as string[] };

    // Фильтруем активность по текущему тайтлу
    const titleActivities = history.filter((a) => a.titleId === currentTitleId);

    // Если у пользователя больше 10 глав подряд в одном тайтле - подозрительно
    if (titleActivities.length > 10) {
      result.isSuspicious = true;
      result.score = 15;
      result.reasons.push(
        `Sequential reading: ${titleActivities.length}+ chapters in a row without breaks`,
      );
    }

    return result;
  }

  /**
   * Проверить время суток (ночная активность - подозрительно)
   */
  private checkNightTime(now: Date): {
    isSuspicious: boolean;
    score: number;
    reasons: string[];
  } {
    const result = { isSuspicious: false, score: 0, reasons: [] as string[] };
    const hour = now.getHours();

    // Ночное время: 2:00 - 6:00
    if (hour >= 2 && hour < 6) {
      result.isSuspicious = true;
      result.score = 10;
      result.reasons.push(`Nighttime activity: reading at ${hour}:00`);
    }

    return result;
  }

  /**
   * Получить историю активности пользователя
   */
  private getUserActivityHistory(userId: string): ActivityCheck[] {
    const history = this.userActivityHistory.get(userId) || [];
    // Очищаем старые записи (старше 24 часов)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return history.filter((a) => a.timestamp.getTime() > oneDayAgo);
  }

  /**
   * Добавить активность в историю
   */
  private addActivityToHistory(userId: string, activity: ActivityCheck): void {
    const history = this.getUserActivityHistory(userId);
    history.push(activity);

    // Ограничиваем размер истории (последние 1000 записей)
    if (history.length > 1000) {
      history.shift();
    }

    this.userActivityHistory.set(userId, history);
  }

  /**
   * Записать подозрительную активность в базу данных
   */
  private async logSuspiciousActivity(
    userId: string,
    data: {
      botScore: number;
      reasons: string[];
      chapterId: string;
      titleId: string;
      timestamp: Date;
    },
  ): Promise<void> {
    try {
      await this.userModel.updateOne(
        { _id: new Types.ObjectId(userId) },
        {
          $push: {
            suspiciousActivityLog: {
              $each: [
                {
                  botScore: data.botScore,
                  reasons: data.reasons,
                  chapterId: new Types.ObjectId(data.chapterId),
                  titleId: new Types.ObjectId(data.titleId),
                  timestamp: data.timestamp,
                },
              ],
              $slice: -100, // Храним только последние 100 записей
            },
          },
          $set: { lastActivityAt: data.timestamp },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to log suspicious activity for user ${userId}: ${error.message}`,
      );
    }
  }

  /**
   * Обновить статус бота в базе данных
   */
  async updateBotStatus(
    userId: string,
    result: BotDetectionResult,
  ): Promise<void> {
    try {
      const updateData: any = {
        lastActivityAt: new Date(),
      };

      if (result.isBot) {
        updateData.isBot = true;
        updateData.botScore = result.botScore;
      } else if (result.isSuspicious) {
        // Увеличиваем botScore постепенно
        updateData.$inc = { botScore: result.botScore };
        updateData.suspicious = true;
      }

      await this.userModel.updateOne(
        { _id: new Types.ObjectId(userId) },
        updateData,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update bot status for user ${userId}: ${error.message}`,
      );
    }
  }

  /**
   * Получить подозрительных пользователей
   */
  async getSuspiciousUsers(limit: number = 50): Promise<UserDocument[]> {
    return this.userModel
      .find({
        $or: [
          { isBot: true },
          { suspicious: true },
          { botScore: { $gt: this.config.SUSPICIOUS_SCORE_THRESHOLD } },
        ],
      })
      .select('-password')
      .sort({ botScore: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Сбросить статус бота для пользователя
   */
  async resetBotStatus(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      {
        $set: {
          isBot: false,
          suspicious: false,
          botScore: 0,
        },
        $unset: {
          suspiciousActivityLog: '',
        },
      },
    );
    this.logger.log(`Reset bot status for user ${userId}`);
  }

  /**
   * Получить статистику по ботам
   */
  async getBotStats(): Promise<{
    totalUsers: number;
    suspectedBots: number;
    confirmedBots: number;
    recentSuspiciousActivities: number;
  }> {
    const [
      totalUsers,
      suspectedBots,
      confirmedBots,
      recentSuspiciousActivities,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ suspicious: true, isBot: false }),
      this.userModel.countDocuments({ isBot: true }),
      this.userModel.countDocuments({
        'suspiciousActivityLog.0': { $exists: true },
      }),
    ]);

    return {
      totalUsers,
      suspectedBots,
      confirmedBots,
      recentSuspiciousActivities,
    };
  }

  /**
   * Очистить историю активности в памяти (для тестирования)
   */
  clearMemoryHistory(): void {
    this.userActivityHistory.clear();
  }

  /**
   * Получить историю активности пользователя из памяти (для отладки)
   */
  getMemoryHistory(userId: string): ActivityCheck[] {
    return this.getUserActivityHistory(userId);
  }

  /**
   * Проверить, не превышен ли rate limit для пользователя
   * Возвращает { allowed: boolean, remainingMs: number }
   */
  checkRateLimit(userId: string): { allowed: boolean; remainingMs: number } {
    const history = this.getUserActivityHistory(userId);
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Подсчитываем запросы за последнюю минуту
    const recentRequests = history.filter(
      (a) => a.timestamp.getTime() > oneMinuteAgo,
    );

    // Для подозрительных пользователей лимит строже
    const user = this.userActivityHistory.get(userId);
    const isSuspicious =
      user && user.length > this.config.MAX_CHAPTERS_PER_HOUR / 2; // Если уже есть много активности

    const limit = isSuspicious
      ? this.config.RATE_LIMIT_SUSPICIOUS
      : this.config.RATE_LIMIT_NORMAL;

    if (recentRequests.length >= limit) {
      // Находим время до освобождения
      const oldestRecent = recentRequests.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      )[0];
      const remainingMs = 60000 - (now - oldestRecent.timestamp.getTime());
      return { allowed: false, remainingMs: Math.max(0, remainingMs) };
    }

    return { allowed: true, remainingMs: 0 };
  }

  /**
   * Получить рекомендуемый rate limit для пользователя
   */
  getRateLimitForUser(userId: string): number {
    const history = this.getUserActivityHistory(userId);
    const recentCount =
      history.filter((a) => a.timestamp.getTime() > Date.now() - 60000).length +
      1;

    if (recentCount > this.config.MAX_CHAPTERS_PER_HOUR / 10) {
      return this.config.RATE_LIMIT_SUSPICIOUS;
    }
    return this.config.RATE_LIMIT_NORMAL;
  }

  // ============ IP TRACKING METHODS ============

  /**
   * Проверить IP-адрес на подозрительную активность
   * Возвращает результат проверки с информацией о блокировке
   */
  async checkIPActivity(requestInfo: RequestInfo): Promise<IPCheckResult> {
    const { ip, endpoint, method, userAgent } = requestInfo;
    const now = new Date();
    const reasons: string[] = [];
    let botScore = 0;

    // 1. Найти или создать запись активности для IP
    let ipActivity = await this.ipActivityModel.findOne({ ip });

    if (!ipActivity) {
      ipActivity = new this.ipActivityModel({
        ip,
        firstSeenAt: now,
        activityLog: [],
        suspiciousActivityLog: [],
      });
    }

    if (ipActivity.isBlocked) {
      if (ipActivity.blockedUntil && ipActivity.blockedUntil > now) {
        // IP временно заблокирован
        const remainingMs = ipActivity.blockedUntil.getTime() - now.getTime();
        return {
          allowed: false,
          isBlocked: true,
          isSuspicious: true,
          botScore: ipActivity.botScore,
          remainingMs,
          reasons: ['IP temporarily blocked'],
        };
      } else {
        // Блокировка истекла, сбрасываем статус
        ipActivity.isBlocked = false;
        ipActivity.blockedReason = null;
        ipActivity.blockedAt = null;
        ipActivity.blockedUntil = null;
      }
    }

    // 3. Проверить rate limit для анонимных пользователей
    const rateLimitResult = this.checkIPRateLimit(ipActivity, now);
    if (!rateLimitResult.allowed) {
      botScore += 20;
      reasons.push(...rateLimitResult.reasons);
    }

    // 4. Проверить паттерны подозрительной активности
    const patternCheck = this.checkIPPatterns(ipActivity, now);
    if (patternCheck.isSuspicious) {
      botScore += patternCheck.score;
      reasons.push(...patternCheck.reasons);
    }

    // 5. Проверить ночное время
    const hour = now.getHours();
    if (
      hour >= this.config.NIGHT_TIME_START &&
      hour < this.config.NIGHT_TIME_END
    ) {
      botScore += this.config.NIGHT_TIME_SCORE;
      reasons.push(`Nighttime activity from IP: ${hour}:00`);
    }

    // 6. Обновить botScore и статус
    ipActivity.botScore = Math.max(ipActivity.botScore, botScore);
    ipActivity.isSuspicious = botScore >= this.config.IP_SUSPICIOUS_THRESHOLD;

    // 7. Автоматическая блокировка при превышении порога
    if (botScore >= this.config.IP_BLOCK_THRESHOLD) {
      ipActivity.isBlocked = true;
      ipActivity.blockedAt = now;
      ipActivity.blockedUntil = new Date(
        now.getTime() + this.config.IP_BLOCK_DURATION_MS,
      ); // Конфигурируемое время
      ipActivity.blockedReason = `Auto-blocked: score=${botScore}, reasons=${JSON.stringify(reasons)}`;
      this.logger.warn(`IP ${ip} auto-blocked: ${ipActivity.blockedReason}`);
    }

    // 8. Логируем подозрительную активность
    if (reasons.length > 0) {
      ipActivity.suspiciousActivityLog.push({
        score: botScore,
        reasons,
        endpoint,
        timestamp: now,
      });

      // Ограничиваем размер лога
      if (ipActivity.suspiciousActivityLog.length > 100) {
        ipActivity.suspiciousActivityLog =
          ipActivity.suspiciousActivityLog.slice(-100);
      }

      this.logger.warn(
        `Suspicious activity from IP ${ip}: score=${botScore}, reasons=${JSON.stringify(reasons)}`,
      );
    }

    // 9. Обновить статистику
    ipActivity.lastRequestAt = now;
    ipActivity.totalRequests += 1;
    ipActivity.requestsToday += 1;

    // Сброс счетчика daily в полночь
    if (ipActivity.lastRateLimitReset) {
      const lastReset = ipActivity.lastRateLimitReset;
      if (
        lastReset.getDate() !== now.getDate() ||
        lastReset.getMonth() !== now.getMonth()
      ) {
        ipActivity.requestsToday = 1;
        ipActivity.lastRateLimitReset = now;
      }
    } else {
      ipActivity.lastRateLimitReset = now;
    }

    // 10. Добавить в лог активности
    ipActivity.activityLog.push({
      endpoint,
      method,
      timestamp: now,
      userAgent,
    });

    // Ограничиваем размер лога активности
    if (ipActivity.activityLog.length > 500) {
      ipActivity.activityLog = ipActivity.activityLog.slice(-500);
    }

    // 11. Сохранить изменения
    await ipActivity.save();

    // 12. Проверить rate limit для возврата
    const finalRateLimitResult = this.checkIPRateLimit(ipActivity, now);
    const finalLimit = ipActivity.isBlocked
      ? 0
      : ipActivity.isSuspicious
        ? this.config.RATE_LIMIT_SUSPICIOUS
        : this.config.RATE_LIMIT_ANONYMOUS;

    return {
      allowed:
        finalRateLimitResult.remainingMs === 0 ||
        ipActivity.requestsLastMinute < finalLimit,
      isBlocked: ipActivity.isBlocked,
      isSuspicious: ipActivity.isSuspicious,
      botScore: ipActivity.botScore,
      remainingMs: finalRateLimitResult.remainingMs,
      reasons,
    };
  }

  /**
   * Проверить rate limit для IP-адреса
   */
  private checkIPRateLimit(
    ipActivity: IPActivityDocument,
    now: Date,
  ): { allowed: boolean; remainingMs: number; reasons: string[] } {
    const result = { allowed: true, remainingMs: 0, reasons: [] as string[] };

    // Определяем лимит в зависимости от статуса
    const limit = ipActivity.isBlocked
      ? 0
      : ipActivity.isSuspicious
        ? this.config.RATE_LIMIT_SUSPICIOUS
        : this.config.RATE_LIMIT_ANONYMOUS;

    // Проверяем последнюю минуту
    const oneMinuteAgo = now.getTime() - 60000;
    const recentRequests = ipActivity.activityLog.filter(
      (a) => a.timestamp.getTime() > oneMinuteAgo,
    );

    if (recentRequests.length >= limit && limit > 0) {
      // Находим время до освобождения
      const oldestRequest = recentRequests.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      )[0];
      result.remainingMs =
        60000 - (now.getTime() - oldestRequest.timestamp.getTime());
      result.allowed = false;
      result.reasons.push(
        `Rate limit exceeded: ${recentRequests.length} requests in the last minute (limit: ${limit})`,
      );
    }

    // Обновляем счетчик
    ipActivity.requestsLastMinute = recentRequests.length;

    return result;
  }

  /**
   * Проверить паттерны подозрительной активности
   */
  private checkIPPatterns(
    ipActivity: IPActivityDocument,
    now: Date,
  ): { isSuspicious: boolean; score: number; reasons: string[] } {
    const result = { isSuspicious: false, score: 0, reasons: [] as string[] };

    // Проверяем общее количество запросов сегодня
    if (ipActivity.requestsToday > 500) {
      result.isSuspicious = true;
      result.score += 10;
      result.reasons.push(
        `High daily volume: ${ipActivity.requestsToday} requests today`,
      );
    }

    // Проверяем частоту запросов
    const recentActivity = ipActivity.activityLog.slice(-20);
    if (recentActivity.length >= 10) {
      const timeSpan = now.getTime() - recentActivity[0].timestamp.getTime();
      const avgInterval = timeSpan / recentActivity.length;

      // Если средний интервал меньше 500мс - очень быстро
      if (avgInterval < 500) {
        result.isSuspicious = true;
        result.score += 25;
        result.reasons.push(
          `Very high request frequency: ${Math.round(avgInterval)}ms average interval`,
        );
      }
      // Если средний интервал меньше 1 секунды - быстро
      else if (avgInterval < 1000) {
        result.isSuspicious = true;
        result.score += 15;
        result.reasons.push(
          `High request frequency: ${Math.round(avgInterval)}ms average interval`,
        );
      }
    }

    // Проверяем разнообразие endpoints (боты часто запрашивают много разных endpoints)
    const uniqueEndpoints = new Set(
      ipActivity.activityLog.map((a) => a.endpoint),
    );
    if (uniqueEndpoints.size > 50 && ipActivity.activityLog.length > 0) {
      const ratio = uniqueEndpoints.size / ipActivity.activityLog.length;
      if (ratio > 0.8) {
        result.isSuspicious = true;
        result.score += 10;
        result.reasons.push(
          `High endpoint diversity: ${uniqueEndpoints.size} unique endpoints`,
        );
      }
    }

    return result;
  }

  /**
   * Получить информацию об активности IP
   */
  async getIPActivity(ip: string): Promise<IPActivityDocument | null> {
    return this.ipActivityModel.findOne({ ip });
  }

  /**
   * Получить все заблокированные IP
   */
  async getBlockedIPs(): Promise<IPActivityDocument[]> {
    return this.ipActivityModel
      .find({ isBlocked: true })
      .sort({ blockedAt: -1 })
      .exec();
  }

  /**
   * Получить подозрительные IP
   */
  async getSuspiciousIPs(limit: number = 50): Promise<IPActivityDocument[]> {
    return this.ipActivityModel
      .find({
        $or: [
          { isBlocked: true },
          { isSuspicious: true },
          { botScore: { $gte: this.config.IP_SUSPICIOUS_THRESHOLD } },
        ],
      })
      .sort({ botScore: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Заблокировать IP вручную
   */
  async blockIP(
    ip: string,
    reason: string,
    durationMinutes: number = 60,
  ): Promise<void> {
    const now = new Date();
    await this.ipActivityModel.updateOne(
      { ip },
      {
        $set: {
          isBlocked: true,
          blockedAt: now,
          blockedUntil: new Date(now.getTime() + durationMinutes * 60 * 1000),
          blockedReason: reason,
        },
      },
      { upsert: true },
    );
    this.logger.warn(`IP ${ip} manually blocked: ${reason}`);
  }

  /**
   * Разблокировать IP
   */
  async unblockIP(ip: string): Promise<void> {
    await this.ipActivityModel.updateOne(
      { ip },
      {
        $set: {
          isBlocked: false,
          blockedReason: null,
          blockedAt: null,
          blockedUntil: null,
        },
      },
    );
    this.logger.log(`IP ${ip} manually unblocked`);
  }

  /**
   * Сбросить счетчики для IP
   */
  async resetIPActivity(ip: string): Promise<void> {
    await this.ipActivityModel.updateOne(
      { ip },
      {
        $set: {
          botScore: 0,
          isSuspicious: false,
          isBlocked: false,
          requestsToday: 0,
          requestsLastMinute: 0,
        },
        $unset: {
          blockedReason: '',
          blockedAt: '',
          blockedUntil: '',
        },
      },
    );
    this.logger.log(`Activity reset for IP ${ip}`);
  }

  /**
   * Получить статистику по IP активности
   */
  async getIPStats(): Promise<{
    totalIPs: number;
    blockedIPs: number;
    suspiciousIPs: number;
    totalRequests: number;
  }> {
    const [totalIPs, blockedIPs, suspiciousIPs, ipStats] = await Promise.all([
      this.ipActivityModel.countDocuments(),
      this.ipActivityModel.countDocuments({ isBlocked: true }),
      this.ipActivityModel.countDocuments({ isSuspicious: true }),
      this.ipActivityModel.aggregate([
        {
          $group: {
            _id: null,
            totalRequests: { $sum: '$totalRequests' },
          },
        },
      ]),
    ]);

    return {
      totalIPs,
      blockedIPs,
      suspiciousIPs,
      totalRequests: ipStats[0]?.totalRequests || 0,
    };
  }

  /**
   * Проверить, может ли IP делать запросы (для использования в middleware)
   */
  async canMakeRequest(ip: string): Promise<{
    allowed: boolean;
    blocked: boolean;
    remainingMs: number;
    message?: string;
  }> {
    const ipActivity = await this.ipActivityModel.findOne({ ip });

    if (!ipActivity) {
      return { allowed: true, blocked: false, remainingMs: 0 };
    }

    if (ipActivity.isBlocked && ipActivity.blockedUntil) {
      const now = new Date();
      if (ipActivity.blockedUntil > now) {
        const remainingMs = ipActivity.blockedUntil.getTime() - now.getTime();
        return {
          allowed: false,
          blocked: true,
          remainingMs,
          message: `IP blocked. Try again in ${Math.ceil(remainingMs / 1000)} seconds.`,
        };
      }
    }

    // Проверить rate limit
    const now = new Date();
    const oneMinuteAgo = now.getTime() - 60000;
    const recentRequests = ipActivity.activityLog.filter(
      (a) => a.timestamp.getTime() > oneMinuteAgo,
    );

    const limit = ipActivity.isBlocked
      ? 0
      : ipActivity.isSuspicious
        ? this.config.RATE_LIMIT_SUSPICIOUS
        : this.config.RATE_LIMIT_ANONYMOUS;

    if (recentRequests.length >= limit) {
      const oldestRequest = recentRequests.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      )[0];
      const remainingMs =
        60000 - (now.getTime() - oldestRequest.timestamp.getTime());
      return {
        allowed: false,
        blocked: false,
        remainingMs,
        message: `Rate limit exceeded. Try again in ${Math.ceil(remainingMs / 1000)} seconds.`,
      };
    }

    return { allowed: true, blocked: false, remainingMs: 0 };
  }
}
