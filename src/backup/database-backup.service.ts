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

/** Лимит вложения Yandex/SMTP (оставляем запас ниже 25 МБ). */
const DEFAULT_MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024;

@Injectable()
export class DatabaseBackupService {
  private readonly logger = new LoggerService();

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.logger.setContext(DatabaseBackupService.name);
  }

  async runDailyBackupAndEmail(): Promise<void> {
    const enabled = this.configService.get('BACKUP_EMAIL_ENABLED') === 'true';
    if (!enabled) {
      return;
    }

    const uri = buildMongoConnectionUri((k) => this.configService.get(k));
    const database =
      this.configService.get('MONGO_DATABASE') || 'tomilo-lib_db';
    const baseDir =
      this.configService.get('BACKUP_DIR') ||
      path.join(process.cwd(), 'backups');
    const to =
      this.configService.get('BACKUP_EMAIL_TO') || 'support@tomilo-lib.ru';
    const maxBytes = Number(
      this.configService.get('BACKUP_EMAIL_MAX_BYTES') ||
        DEFAULT_MAX_ATTACHMENT_BYTES,
    );

    const dateStr = new Date().toISOString().slice(0, 10);
    const dumpFolderName = `dump-${dateStr}`;
    const outDir = path.join(baseDir, dumpFolderName, database);
    let archivePath: string | undefined;

    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }

      this.logger.log(`DB backup: writing collections to ${outDir}`);
      await dumpMongoCollectionsToDir(uri, outDir);

      archivePath = path.join(baseDir, `${dumpFolderName}.tar.gz`);
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
        return;
      }

      await this.emailService.sendDatabaseBackupArchive(
        to,
        archivePath,
        dateStr,
        stat.size,
      );
      this.logger.log(`DB backup email sent to ${to}`);
    } catch (err) {
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
    } finally {
      if (archivePath && fs.existsSync(archivePath)) {
        try {
          fs.unlinkSync(archivePath);
        } catch {
          /* ignore */
        }
      }
    }
  }
}
