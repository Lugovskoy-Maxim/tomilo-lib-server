import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShopService } from './shop.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class ShopSchedulerService {
  private readonly logger = new LoggerService();

  constructor(private readonly shopService: ShopService) {
    this.logger.setContext(ShopSchedulerService.name);
  }

  /** Каждое воскресенье в 00:00 — принять предложение с наибольшим числом голосов и добавить в магазин */
  @Cron(CronExpression.EVERY_WEEK)
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
