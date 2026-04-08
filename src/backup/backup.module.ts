import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '../email/email.module';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackupScheduler } from './database-backup.scheduler';

@Module({
  imports: [ConfigModule, EmailModule],
  providers: [DatabaseBackupService, DatabaseBackupScheduler],
})
export class BackupModule {}
