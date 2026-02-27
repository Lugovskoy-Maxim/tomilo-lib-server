import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private s3Client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'S3_SECRET_ACCESS_KEY',
    );
    this.bucket = this.configService.get<string>('S3_BUCKET') || '';
    this.publicUrl = this.configService.get<string>('S3_PUBLIC_URL') || '';

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.warn(
        'S3 не настроен. Проверьте переменные окружения S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET',
      );
      return;
    }

    this.s3Client = new S3Client({
      endpoint,
      region: this.configService.get<string>('S3_REGION') || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });

    this.logger.log(`S3 подключен: ${endpoint}, bucket: ${this.bucket}`);
  }

  isConfigured(): boolean {
    return !!this.s3Client && !!this.bucket;
  }

  getBucket(): string {
    return this.bucket;
  }

  getPublicUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    }
    const endpoint = this.configService.get<string>('S3_ENDPOINT') || '';
    return `${endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
  }

  async uploadFile(
    key: string,
    body: Buffer,
    contentType?: string,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('S3 не настроен');
    }

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
        ACL: 'public-read',
      },
    });

    await upload.done();
    this.logger.log(`Файл загружен в S3: ${key}`);

    return this.getPublicUrl(key);
  }

  async uploadFileStream(
    key: string,
    body: Buffer | import('stream').Readable,
    contentType?: string,
    contentLength?: number,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('S3 не настроен');
    }

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
        ContentLength: contentLength,
        ACL: 'public-read',
      },
    });

    await upload.done();
    this.logger.log(`Файл загружен в S3: ${key}`);

    return this.getPublicUrl(key);
  }

  async deleteFile(key: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('S3 не настроен');
    }

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    this.logger.log(`Файл удалён из S3: ${key}`);
  }

  async deleteFolder(prefix: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('S3 не настроен');
    }

    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;

    const listResponse = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: normalizedPrefix,
      }),
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      this.logger.log(`Папка пуста или не существует: ${normalizedPrefix}`);
      return;
    }

    const deletePromises = listResponse.Contents.map((obj) => {
      if (obj.Key) {
        return this.deleteFile(obj.Key);
      }
      return Promise.resolve();
    });

    await Promise.all(deletePromises);
    this.logger.log(
      `Папка удалена из S3: ${normalizedPrefix} (${listResponse.Contents.length} файлов)`,
    );
  }

  async fileExists(key: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const response = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      }),
    );

    return (response.Contents || [])
      .map((obj) => obj.Key)
      .filter((key): key is string => !!key);
  }

  getClient(): S3Client {
    return this.s3Client;
  }
}
