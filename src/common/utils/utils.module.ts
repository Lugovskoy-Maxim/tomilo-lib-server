import { Module } from '@nestjs/common';
import { WatermarkUtil } from './watermark.util';

@Module({
  providers: [WatermarkUtil],
  exports: [WatermarkUtil],
})
export class UtilsModule {}
