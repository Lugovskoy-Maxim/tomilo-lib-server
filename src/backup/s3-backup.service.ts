import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { S3Service } from '../s3/s3.service';
import {
  buildMongoConnectionUri,
  dumpMongoCollectionsToDir,
  tarGzDumpFolder,
} from './mongo-backup.util';

@Injectable()
export class S3BackupService {
  private readonly logger = new Logger(S3BackupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Создает бекап БД и загружает его в S3
   * @returns URL загруженного файла в S3
   */
  async createAndUploadBackup(): Promise<{
    url: string;
    key: string;
    size: number;
  }> {
    const uri = buildMongoConnectionUri((k) => this.configService.get(k));
    const database =
      this.configService.get('MONGO_DATABASE') || 'tomilo-lib_db';
    const baseDir =
      this.configService.get('BACKUP_DIR') ||
      path.join(process.cwd(), 'backups');
    const s3Prefix =
      this.configService.get('BACKUP_S3_PREFIX') || 'backups/database';

    const dateStr = new Date().toISOString().slice(0, 10);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dumpFolderName = `dump-${dateStr}`;
    const outDir = path.join(baseDir, dumpFolderName, database);
    let archivePath: string | undefined;

    try {
      // Создаем директорию для бекапа
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }

      this.logger.log(`Создание бекапа БД в ${outDir}`);
      await dumpMongoCollectionsToDir(uri, outDir);

      // Создаем архив
      archivePath = path.join(baseDir, `${dumpFolderName}.tar.gz`);
      tarGzDumpFolder(baseDir, dumpFolderName, archivePath);

      const stat = fs.statSync(archivePath);
      this.logger.log(
        `Архив создан: ${archivePath}, размер: ${stat.size} байт`,
      );

      // Генерируем ключ для S3
      const key = `${s3Prefix}/${dateStr}/tomilo-db-${timestamp}.tar.gz`;

      // Загружаем в S3
      this.logger.log(`Загрузка в S3 с ключом: ${key}`);
      const fileBuffer = fs.readFileSync(archivePath);
      const url = await this.s3Service.uploadFile(
        key,
        fileBuffer,
        'application/gzip',
      );

      this.logger.log(`Бекап успешно загружен в S3: ${url}`);

      return {
        url,
        key,
        size: stat.size,
      };
    } finally {
      // Очищаем временные файлы
      if (archivePath && fs.existsSync(archivePath)) {
        try {
          fs.unlinkSync(archivePath);
        } catch (err) {
          this.logger.warn(`Не удалось удалить архив: ${archivePath}`, err);
        }
      }

      // Удаляем директорию с дампом
      const dumpDir = path.join(baseDir, dumpFolderName);
      if (fs.existsSync(dumpDir)) {
        try {
          fs.rmSync(dumpDir, { recursive: true, force: true });
        } catch (err) {
          this.logger.warn(
            `Не удалось удалить директорию дампа: ${dumpDir}`,
            err,
          );
        }
      }
    }
  }

  /**
   * Удаляет старые бекапы из S3, оставляя только последние N дней
   * @param daysToKeep количество дней для хранения (по умолчанию 30)
   */
  async cleanupOldBackups(daysToKeep = 30): Promise<void> {
    if (!this.s3Service.isConfigured()) {
      this.logger.warn('S3 не настроен, очистка пропущена');
      return;
    }

    const s3Prefix =
      this.configService.get('BACKUP_S3_PREFIX') || 'backups/database';
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);

    this.logger.log(
      `Очистка бекапов старше ${cutoffDateStr} (${daysToKeep} дней)`,
    );

    try {
      const files = await this.s3Service.listFiles(s3Prefix);
      const backupFiles = files.filter((key) => key.endsWith('.tar.gz'));

      for (const key of backupFiles) {
        // Извлекаем дату из ключа (формат: backups/database/YYYY-MM-DD/tomilo-db-...)
        const match = key.match(/\/(\d{4}-\d{2}-\d{2})\//);
        if (match) {
          const fileDateStr = match[1];
          if (fileDateStr < cutoffDateStr) {
            this.logger.log(`Удаление старого бекапа: ${key}`);
            await this.s3Service.deleteFile(key).catch((err) => {
              this.logger.error(`Ошибка при удалении ${key}: ${err.message}`);
            });
          }
        }
      }

      this.logger.log('Очистка старых бекапов завершена');
    } catch (err) {
      this.logger.error(
        `Ошибка при очистке бекапов: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Проверяет, настроен ли S3 для бекапов
   */
  isS3Configured(): boolean {
    return this.s3Service.isConfigured();
  }
}
