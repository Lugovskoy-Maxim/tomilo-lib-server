import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { UtilsModule } from '../common/utils/utils.module';

@Module({
  imports: [UtilsModule],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
