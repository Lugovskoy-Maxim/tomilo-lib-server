import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { S3Service } from '../s3/s3.service';
import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { lookup } from 'mime-types';

interface SyncResult {
  uploaded: number;
  deleted: number;
  orphansDeleted: number;
  errors: string[];
}

interface LocalFile {
  relativePath: string;
  fullPath: string;
  size: number;
}

@Injectable()
export class FilesSyncService {
  private readonly logger = new Logger(FilesSyncService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads');
  private isSyncing = false;

  constructor(
    private readonly s3Service: S3Service,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Полная синхронизация каждый день в 4:00 ночи
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduledFullSync(): Promise<void> {
    if (!this.s3Service.isConfigured()) {
      return;
    }

    this.logger.log('Запуск ежедневной синхронизации файлов...');
    const result = await this.fullSync();
    this.logger.log(
      `Синхронизация завершена: загружено ${result.uploaded}, удалено из S3 ${result.deleted}, ` +
        `осиротевших удалено ${result.orphansDeleted}, ошибок ${result.errors.length}`,
    );
  }

  /**
   * Полная синхронизация: загрузка новых + удаление лишних из S3 + очистка осиротевших
   */
  async fullSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      this.logger.warn('Синхронизация уже выполняется, пропускаем');
      return { uploaded: 0, deleted: 0, orphansDeleted: 0, errors: ['Already syncing'] };
    }

    this.isSyncing = true;
    const result: SyncResult = { uploaded: 0, deleted: 0, orphansDeleted: 0, errors: [] };

    try {
      if (this.s3Service.isConfigured()) {
        const uploadResult = await this.uploadMissingToS3();
        result.uploaded = uploadResult.uploaded;
        result.errors.push(...uploadResult.errors);

        const cleanupResult = await this.cleanupS3();
        result.deleted = cleanupResult.deleted;
        result.errors.push(...cleanupResult.errors);
      }

      const orphanResult = await this.cleanupOrphanFiles();
      result.orphansDeleted = orphanResult.deleted;
      result.errors.push(...orphanResult.errors);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Загрузить в S3 файлы, которых там нет
   */
  async uploadMissingToS3(): Promise<{ uploaded: number; errors: string[] }> {
    if (!this.s3Service.isConfigured()) {
      return { uploaded: 0, errors: ['S3 не настроен'] };
    }

    const errors: string[] = [];
    let uploaded = 0;

    try {
      const localFiles = await this.getAllLocalFiles();
      const s3Keys = await this.getAllS3Keys();

      const toUpload = localFiles.filter((f) => !s3Keys.has(f.relativePath));

      this.logger.log(`Найдено ${toUpload.length} файлов для загрузки в S3`);

      for (const file of toUpload) {
        try {
          const buffer = await fs.readFile(file.fullPath);
          const contentType = lookup(file.relativePath) || 'application/octet-stream';
          await this.s3Service.uploadFile(file.relativePath, buffer, contentType);
          uploaded++;
        } catch (error) {
          const msg = `Ошибка загрузки ${file.relativePath}: ${error}`;
          this.logger.error(msg);
          errors.push(msg);
        }
      }
    } catch (error) {
      const msg = `Ошибка при загрузке в S3: ${error}`;
      this.logger.error(msg);
      errors.push(msg);
    }

    return { uploaded, errors };
  }

  /**
   * Удалить из S3 файлы, которых нет локально
   */
  async cleanupS3(): Promise<{ deleted: number; errors: string[] }> {
    if (!this.s3Service.isConfigured()) {
      return { deleted: 0, errors: ['S3 не настроен'] };
    }

    const errors: string[] = [];
    let deleted = 0;

    try {
      const localFiles = await this.getAllLocalFiles();
      const localPaths = new Set(localFiles.map((f) => f.relativePath));
      const s3Files = await this.getAllS3FilesWithSize();

      const toDelete = s3Files.filter((f) => !localPaths.has(f.key)).map((f) => f.key);

      if (toDelete.length > 0) {
        this.logger.log(`Найдено ${toDelete.length} лишних файлов в S3`);
        deleted = await this.deleteS3Objects(toDelete);
      }
    } catch (error) {
      const msg = `Ошибка при очистке S3: ${error}`;
      this.logger.error(msg);
      errors.push(msg);
    }

    return { deleted, errors };
  }

  /**
   * Удалить локальные файлы, не привязанные к БД
   */
  async cleanupOrphanFiles(): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deleted = 0;

    try {
      const localFiles = await this.getAllLocalFiles();
      const referencedFiles = await this.getReferencedFilesFromDB();

      const orphans = localFiles.filter((f) => !referencedFiles.has(f.relativePath));

      this.logger.log(`Найдено ${orphans.length} осиротевших файлов`);

      for (const file of orphans) {
        try {
          await fs.unlink(file.fullPath);
          deleted++;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            const msg = `Ошибка удаления ${file.relativePath}: ${error}`;
            this.logger.error(msg);
            errors.push(msg);
          }
        }
      }

      await this.cleanupEmptyDirs(this.uploadsDir);
    } catch (error) {
      const msg = `Ошибка при очистке осиротевших файлов: ${error}`;
      this.logger.error(msg);
      errors.push(msg);
    }

    return { deleted, errors };
  }

  private async getAllLocalFiles(): Promise<LocalFile[]> {
    const files: LocalFile[] = [];

    const walkDir = async (currentDir: string) => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            const stat = await fs.stat(fullPath);
            const relativePath = relative(this.uploadsDir, fullPath).replace(/\\/g, '/');
            files.push({ relativePath, fullPath, size: stat.size });
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.error(`Ошибка чтения директории ${currentDir}: ${error}`);
        }
      }
    };

    await walkDir(this.uploadsDir);
    return files;
  }

  private async getAllS3Keys(): Promise<Set<string>> {
    const keys = new Set<string>();
    const client = this.s3Service.getClient();
    const bucket = this.s3Service.getBucket();
    let continuationToken: string | undefined;

    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) keys.add(obj.Key);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  private async getAllS3FilesWithSize(): Promise<{ key: string; size: number }[]> {
    const files: { key: string; size: number }[] = [];
    const client = this.s3Service.getClient();
    const bucket = this.s3Service.getBucket();
    let continuationToken: string | undefined;

    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            files.push({ key: obj.Key, size: obj.Size || 0 });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return files;
  }

  private async deleteS3Objects(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    const client = this.s3Service.getClient();
    const bucket = this.s3Service.getBucket();
    let deleted = 0;
    const batchSize = 1000;

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );

      deleted += batch.length;
    }

    return deleted;
  }

  private normalizeImagePath(path: string | null | undefined): string | null {
    if (!path) return null;
    let normalized = path.replace(/^\//, '');
    if (normalized.startsWith('uploads/')) {
      normalized = normalized.replace(/^uploads\//, '');
    }
    return normalized;
  }

  private async getReferencedFilesFromDB(): Promise<Set<string>> {
    const referenced = new Set<string>();

    const users = await this.connection.collection('users').find({}, { projection: { avatar: 1 } }).toArray();
    for (const user of users) {
      const path = this.normalizeImagePath(user.avatar);
      if (path) referenced.add(path);
    }

    const announcements = await this.connection
      .collection('announcements')
      .find({}, { projection: { coverImage: 1, images: 1 } })
      .toArray();
    for (const ann of announcements) {
      const cover = this.normalizeImagePath(ann.coverImage);
      if (cover) referenced.add(cover);
      if (ann.images && Array.isArray(ann.images)) {
        for (const img of ann.images) {
          const path = this.normalizeImagePath(img);
          if (path) referenced.add(path);
        }
      }
    }

    const titles = await this.connection.collection('titles').find({}, { projection: { coverImage: 1 } }).toArray();
    for (const title of titles) {
      const path = this.normalizeImagePath(title.coverImage);
      if (path) referenced.add(path);
    }

    const chapters = await this.connection.collection('chapters').find({}, { projection: { pages: 1 } }).toArray();
    for (const chapter of chapters) {
      if (chapter.pages && Array.isArray(chapter.pages)) {
        for (const page of chapter.pages) {
          const path = this.normalizeImagePath(page);
          if (path) referenced.add(path);
        }
      }
    }

    const collections = await this.connection.collection('collections').find({}, { projection: { cover: 1 } }).toArray();
    for (const col of collections) {
      const path = this.normalizeImagePath(col.cover);
      if (path) referenced.add(path);
    }

    const decorationCollections = [
      'avatardecorations',
      'avatarframedecorations',
      'backgrounddecorations',
      'carddecorations',
    ];

    for (const collName of decorationCollections) {
      try {
        const docs = await this.connection.collection(collName).find({}, { projection: { imageUrl: 1 } }).toArray();
        for (const doc of docs) {
          const path = this.normalizeImagePath(doc.imageUrl);
          if (path) referenced.add(path);
        }
      } catch {
        // collection might not exist
      }
    }

    const characters = await this.connection.collection('characters').find({}, { projection: { avatar: 1 } }).toArray();
    for (const char of characters) {
      const path = this.normalizeImagePath(char.avatar);
      if (path) referenced.add(path);
    }

    return referenced;
  }

  private async cleanupEmptyDirs(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.cleanupEmptyDirs(join(dir, entry.name));
        }
      }
      const remaining = await fs.readdir(dir);
      if (remaining.length === 0 && dir !== this.uploadsDir) {
        await fs.rmdir(dir);
      }
    } catch {
      // ignore errors
    }
  }
}
