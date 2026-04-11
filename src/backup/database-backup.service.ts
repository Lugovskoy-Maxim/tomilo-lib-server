import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildMongoConnectionUri,
  dumpMongoCollectionsToDir,
  tarGzDumpFolder,
} from './mongo-backup.util';
import { EmailService } from '../email/email.service';
import { LoggerService } from '../common/logger/logger.service';
import { S3BackupService } from './s3-backup.service';

/** Лимит вложения Yandex/SMTP (оставляем запас ниже 25 МБ). */
const DEFAULT_MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024;

@Injectable()
export class DatabaseBackupService {
  private readonly logger = new LoggerService();

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly s3BackupService: S3BackupService,
  ) {
    this.logger.setContext(DatabaseBackupService.name);
  }

  /**
   * Удаляет временные файлы бекапа (архив и директорию дампа).
   * @param archivePath Путь к архиву .tar.gz
   * @param dumpDir Путь к директории дампа
   */
  private cleanupTempFiles(
    archivePath: string | undefined,
    dumpDir: string | undefined,
  ): void {
    try {
      if (archivePath && fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
        this.logger.debug(`Удален архив: ${archivePath}`);
      }
    } catch (err) {
      this.logger.warn(
        `Не удалось удалить архив ${archivePath}: ${(err as Error).message}`,
      );
    }

    try {
      if (dumpDir && fs.existsSync(dumpDir)) {
        fs.rmSync(dumpDir, { recursive: true, force: true });
        this.logger.debug(`Удалена директория дампа: ${dumpDir}`);
      }
    } catch (err) {
      this.logger.warn(
        `Не удалось удалить директорию дампа ${dumpDir}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Удаляет временные файлы бекапа на основе даты (когда пути неизвестны).
   * @param dateStr Строка даты в формате YYYY-MM-DD
   */
  private cleanupTempFilesByDate(dateStr: string): void {
    try {
      const baseDir =
        this.configService.get('BACKUP_DIR') ||
        path.join(process.cwd(), 'backups');
      const dumpFolderName = `dump-${dateStr}`;
      const archivePath = path.join(baseDir, `${dumpFolderName}.tar.gz`);
      const dumpDir = path.join(baseDir, dumpFolderName);

      this.cleanupTempFiles(archivePath, dumpDir);
    } catch (err) {
      // Игнорируем ошибки при очистке
      this.logger.debug(
        `Очистка по дате ${dateStr} не удалась: ${(err as Error).message}`,
      );
    }
  }

  async runDailyBackupAndEmail(): Promise<void> {
    const enabled = this.configService.get('BACKUP_EMAIL_ENABLED') === 'true';
    if (!enabled) {
      return;
    }

    const to =
      this.configService.get('BACKUP_EMAIL_TO') || 'support@tomilo-lib.ru';
    const dateStr = new Date().toISOString().slice(0, 10);
    const useS3 = this.configService.get('BACKUP_USE_S3') === 'true';
    const maxBytes = Number(
      this.configService.get('BACKUP_EMAIL_MAX_BYTES') ||
        DEFAULT_MAX_ATTACHMENT_BYTES,
    );

    // Переменные для очистки временных файлов (используются в блоке catch)
    let archivePath: string | undefined;
    let dumpDir: string | undefined;

    try {
      if (useS3 && this.s3BackupService.isS3Configured()) {
        // Режим S3: загружаем в облако и отправляем ссылку
        this.logger.log('Создание бекапа с загрузкой в S3');
        const result = await this.s3BackupService.createAndUploadBackup();

        await this.emailService.sendDatabaseBackupS3Link(
          to,
          dateStr,
          result.url,
          result.size,
          result.key,
        );
        this.logger.log(`Бекап загружен в S3 и ссылка отправлена на ${to}`);

        // Очищаем старые бекапы (если настроено)
        const cleanupEnabled =
          this.configService.get('BACKUP_S3_CLEANUP_ENABLED') === 'true';
        const daysToKeep = Number(
          this.configService.get('BACKUP_S3_DAYS_TO_KEEP') || '30',
        );
        if (cleanupEnabled) {
          await this.s3BackupService.cleanupOldBackups(daysToKeep);
        }
      } else {
        // Старый режим: отправка вложением по почте
        this.logger.log('Создание бекапа для отправки вложением по почте');

        const uri = buildMongoConnectionUri((k) => this.configService.get(k));
        const database =
          this.configService.get('MONGO_DATABASE') || 'tomilo-lib_db';
        const baseDir =
          this.configService.get('BACKUP_DIR') ||
          path.join(process.cwd(), 'backups');
        const dumpFolderName = `dump-${dateStr}`;
        const outDir = path.join(baseDir, dumpFolderName, database);
        archivePath = path.join(baseDir, `${dumpFolderName}.tar.gz`);
        dumpDir = path.join(baseDir, dumpFolderName); // Родительская директория для дампа

        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
        }

        this.logger.log(`DB backup: writing collections to ${outDir}`);
        await dumpMongoCollectionsToDir(uri, outDir);

        tarGzDumpFolder(baseDir, dumpFolderName, archivePath);

        const stat = fs.statSync(archivePath);
        if (stat.size > maxBytes) {
          this.logger.warn(
            `Backup archive ${archivePath} is ${stat.size} bytes (max ${maxBytes}); sending notice email without attachment`,
          );
          await this.emailService.sendBackupTooLargeEmail(
            to,
            dateStr,
            stat.size,
            maxBytes,
          );
          // Очищаем временные файлы перед возвратом
          this.cleanupTempFiles(archivePath, dumpDir);
          return;
        }

        await this.emailService.sendDatabaseBackupArchive(
          to,
          archivePath,
          dateStr,
          stat.size,
        );
        this.logger.log(`DB backup email sent to ${to}`);

        // Удаляем временные файлы после успешной отправки
        this.cleanupTempFiles(archivePath, dumpDir);
      }
    } catch (err) {
      // Очищаем временные файлы в случае ошибки
      if (archivePath || dumpDir) {
        this.cleanupTempFiles(archivePath, dumpDir);
      } else {
        // Если переменные не определены (например, ошибка до их вычисления),
        // пытаемся вычислить пути на основе dateStr и удалить возможные остатки
        this.cleanupTempFilesByDate(dateStr);
      }

      this.logger.error(
        `Daily DB backup failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      try {
        await this.emailService.sendBackupFailureNotice(
          to,
          dateStr,
          (err as Error).message,
        );
      } catch (mailErr) {
        this.logger.error(
          `Could not send backup failure email: ${(mailErr as Error).message}`,
          (mailErr as Error).stack,
        );
      }
    }
  }
}
