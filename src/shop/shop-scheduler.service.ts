import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ShopService } from './shop.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class ShopSchedulerService {
  private readonly logger = new LoggerService();

  constructor(private readonly shopService: ShopService) {
    this.logger.setContext(ShopSchedulerService.name);
  }

  /**
   * Каждый понедельник в 00:00 (по времени сервера) — принять предложение с наибольшим числом голосов.
   * Совпадает с таймером на клиенте («следующий понедельник 00:00»). Рекомендуется TZ сервера = Europe/Moscow (или основной ЧП пользователей).
   * EVERY_WEEK = воскресенье 00:00, поэтому задаём понедельник явно: 0 0 * * 1
   */
  @Cron('0 0 * * 1')
  async acceptWeeklyWinnerJob() {
    this.logger.log('Running weekly suggested decoration winner job');
    try {
      const result = await this.shopService.acceptWeeklyWinner();
      if (result) {
        this.logger.log(
          `Weekly winner accepted: ${result.suggestionId} -> ${result.decorationId} (${result.type}, price=${result.price})`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Weekly winner job failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
