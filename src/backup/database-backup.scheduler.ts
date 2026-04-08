import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseBackupService } from './database-backup.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class DatabaseBackupScheduler {
  private readonly logger = new LoggerService();

  constructor(private readonly databaseBackupService: DatabaseBackupService) {
    this.logger.setContext(DatabaseBackupScheduler.name);
  }

  /**
   * Каждый день в 03:00 по времени сервера.
   * Для Europe/Moscow задайте TZ в окружении процесса (systemd, Docker, PM2).
   */
  @Cron('0 3 * * *')
  async dailyBackupJob() {
    this.logger.log('Running scheduled DB backup (email)');
    await this.databaseBackupService.runDailyBackupAndEmail();
  }
}
