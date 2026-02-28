import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FilesSyncService } from './files-sync.service';
import { ApiResponseDto } from '../common/dto/api-response.dto';

@Controller('files/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class FilesAdminController {
  constructor(private readonly filesSyncService: FilesSyncService) {}

  @Post('sync')
  async runSync(): Promise<ApiResponseDto<any>> {
    const result = await this.filesSyncService.fullSync();
    return {
      success: true,
      data: result,
      message: `Синхронизация завершена: загружено ${result.uploaded}, удалено из S3 ${result.deleted}, осиротевших удалено ${result.orphansDeleted}`,
      timestamp: new Date().toISOString(),
      path: '/files/admin/sync',
      method: 'POST',
    };
  }

  @Post('sync/upload')
  async runUploadToS3(): Promise<ApiResponseDto<any>> {
    const result = await this.filesSyncService.uploadMissingToS3();
    return {
      success: true,
      data: result,
      message: `Загружено ${result.uploaded} файлов в S3`,
      timestamp: new Date().toISOString(),
      path: '/files/admin/sync/upload',
      method: 'POST',
    };
  }

  @Post('sync/cleanup-s3')
  async runCleanupS3(): Promise<ApiResponseDto<any>> {
    const result = await this.filesSyncService.cleanupS3();
    return {
      success: true,
      data: result,
      message: `Удалено ${result.deleted} лишних файлов из S3`,
      timestamp: new Date().toISOString(),
      path: '/files/admin/sync/cleanup-s3',
      method: 'POST',
    };
  }

  @Post('sync/cleanup-orphans')
  async runCleanupOrphans(): Promise<ApiResponseDto<any>> {
    const result = await this.filesSyncService.cleanupOrphanFiles();
    return {
      success: true,
      data: result,
      message: `Удалено ${result.deleted} осиротевших файлов`,
      timestamp: new Date().toISOString(),
      path: '/files/admin/sync/cleanup-orphans',
      method: 'POST',
    };
  }
}
