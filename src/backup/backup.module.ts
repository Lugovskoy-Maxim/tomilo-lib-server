import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '../email/email.module';
import { S3Module } from '../s3/s3.module';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackupScheduler } from './database-backup.scheduler';
import { S3BackupService } from './s3-backup.service';

@Module({
  imports: [ConfigModule, EmailModule, S3Module],
  providers: [DatabaseBackupService, DatabaseBackupScheduler, S3BackupService],
  exports: [S3BackupService],
})
export class BackupModule {}
