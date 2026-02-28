import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesSyncService } from './files-sync.service';
import { FilesAdminController } from './files-admin.controller';
import { UtilsModule } from '../common/utils/utils.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [UtilsModule, S3Module],
  controllers: [FilesAdminController],
  providers: [FilesService, FilesSyncService],
  exports: [FilesService, FilesSyncService],
})
export class FilesModule {}
