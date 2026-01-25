import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../schemas/user.schema';

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

@Injectable()
export class BotDetectionService {
  private readonly logger = new Logger(BotDetectionService.name);

  // Конфигурация детекции
  private readonly MIN_TIME_BETWEEN_CHAPTERS_MS = 10000; // 10 секунд минимум
  private readonly MAX_CHAPTERS_PER_HOUR = 100; // 100 глав/час - подозрительно
  private readonly BOT_SCORE_THRESHOLD = 80; // Порог для определения бота
  private readonly SUSPICIOUS_SCORE_THRESHOLD = 50; // Порог для подозрительной активности

  // Rate limiting configuration (more strict for suspicious users)
  private readonly RATE_LIMIT_NORMAL = 60; // 60 requests/min
  private readonly RATE_LIMIT_SUSPICIOUS = 30; // 30 requests/min for suspicious users

  // Хранилище последней активности (в продакшене использовать Redis)
  private readonly userActivityHistory: Map<string, ActivityCheck[]> =
    new Map();

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

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

    const isBot = botScore >= this.BOT_SCORE_THRESHOLD;
    const isSuspicious = botScore >= this.SUSPICIOUS_SCORE_THRESHOLD;

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
    if (timeDiff < this.MIN_TIME_BETWEEN_CHAPTERS_MS) {
      result.isSuspicious = true;
      result.score = 20; // Высокий вес - это явный признак бота
      result.reasons.push(
        `Reading speed too fast: ${Math.round(timeDiff / 1000)}s between chapters (min: ${this.MIN_TIME_BETWEEN_CHAPTERS_MS / 1000}s)`,
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

    if (count > this.MAX_CHAPTERS_PER_HOUR) {
      result.isSuspicious = true;
      result.score = 30;
      result.reasons.push(
        `High volume: ${count} chapters in the last hour (max: ${this.MAX_CHAPTERS_PER_HOUR})`,
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
          { botScore: { $gt: this.SUSPICIOUS_SCORE_THRESHOLD } },
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
    const isSuspicious = user && user.length > this.MAX_CHAPTERS_PER_HOUR / 2; // Если уже есть много активности

    const limit = isSuspicious
      ? this.RATE_LIMIT_SUSPICIOUS
      : this.RATE_LIMIT_NORMAL;

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

    if (recentCount > this.MAX_CHAPTERS_PER_HOUR / 10) {
      return this.RATE_LIMIT_SUSPICIOUS;
    }
    return this.RATE_LIMIT_NORMAL;
  }
}
