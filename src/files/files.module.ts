import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { UtilsModule } from '../common/utils/utils.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [UtilsModule, S3Module],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
