/**
 * Скрипт загрузки локальных файлов в S3.
 * Находит файлы, которых нет в облаке, и загружает их.
 *
 * Использование:
 *   npm run s3:upload           # Показать что будет загружено (dry-run)
 *   npm run s3:upload -- --upload   # Загрузить файлы в S3
 */

import { config } from 'dotenv';
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { join } from 'path';
import { lookup } from 'mime-types';

config();

const UPLOADS_DIR = join(__dirname, '..', 'uploads');

interface SyncStats {
  localFiles: number;
  s3Files: number;
  toUpload: number;
  uploaded: number;
  uploadedBytes: number;
}

interface LocalFile {
  relativePath: string;
  fullPath: string;
  size: number;
}

function getS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'S3 не настроен. Проверьте переменные окружения S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
    );
  }

  return new S3Client({
    endpoint,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });
}

async function getAllLocalFiles(dir: string): Promise<LocalFile[]> {
  const files: LocalFile[] = [];

  async function walkDir(currentDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          const relativePath = fullPath
            .replace(UPLOADS_DIR + '/', '')
            .replace(UPLOADS_DIR + '\\', '')
            .replace(/\\/g, '/');
          files.push({
            relativePath,
            fullPath,
            size: stat.size,
          });
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Ошибка при чтении директории ${currentDir}:`, error);
      }
    }
  }

  await walkDir(dir);
  return files;
}

async function getAllS3Keys(
  client: S3Client,
  bucket: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
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
          keys.add(obj.Key);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function uploadFile(
  client: S3Client,
  bucket: string,
  file: LocalFile,
): Promise<void> {
  const buffer = await fs.readFile(file.fullPath);
  const contentType = lookup(file.relativePath) || 'application/octet-stream';

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: file.relativePath,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function categorizeFile(relativePath: string): string {
  if (relativePath.startsWith('users/')) return 'avatars';
  if (relativePath.startsWith('avatars/')) return 'avatars (legacy)';
  if (relativePath.startsWith('announcements/')) return 'announcements';
  if (relativePath.match(/^titles\/[^/]+\/chapters\//)) return 'chapters';
  if (relativePath.startsWith('titles/')) return 'title covers';
  if (relativePath.startsWith('chapters/')) return 'chapters (legacy)';
  if (relativePath.startsWith('covers/')) return 'covers (legacy)';
  if (relativePath.startsWith('decorations/')) return 'decorations';
  if (relativePath.startsWith('collections/')) return 'collections';
  return 'other';
}

async function main() {
  const shouldUpload = process.argv.includes('--upload');

  console.log('🔍 Сравнение локальных файлов с S3...\n');

  if (!shouldUpload) {
    console.log('ℹ️  Режим просмотра (dry-run). Для загрузки добавьте --upload\n');
  }

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET не указан в переменных окружения');
  }

  const client = getS3Client();

  console.log(`📁 Локальная папка: ${UPLOADS_DIR}`);
  console.log(`🪣 S3 бакет: ${bucket}\n`);

  console.log('📂 Сканируем локальные файлы...');
  const localFiles = await getAllLocalFiles(UPLOADS_DIR);
  console.log(`   Найдено: ${localFiles.length} файлов\n`);

  console.log('☁️  Сканируем S3...');
  const s3Keys = await getAllS3Keys(client, bucket);
  console.log(`   Найдено: ${s3Keys.size} файлов\n`);

  const toUpload: LocalFile[] = [];
  const byCategory: Record<string, number> = {};

  for (const file of localFiles) {
    if (!s3Keys.has(file.relativePath)) {
      toUpload.push(file);
      const category = categorizeFile(file.relativePath);
      byCategory[category] = (byCategory[category] || 0) + 1;
    }
  }

  const totalBytes = toUpload.reduce((sum, f) => sum + f.size, 0);

  const stats: SyncStats = {
    localFiles: localFiles.length,
    s3Files: s3Keys.size,
    toUpload: toUpload.length,
    uploaded: 0,
    uploadedBytes: totalBytes,
  };

  console.log('='.repeat(60));
  console.log('📊 Результаты сравнения:');
  console.log(`   Локальных файлов: ${stats.localFiles}`);
  console.log(`   Файлов в S3: ${stats.s3Files}`);
  console.log(`   Отсутствует в S3: ${stats.toUpload}`);
  console.log(`   Размер для загрузки: ${formatSize(stats.uploadedBytes)}`);
  console.log('');
  if (Object.keys(byCategory).length > 0) {
    console.log('   По категориям:');
    for (const [category, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      console.log(`     - ${category}: ${count}`);
    }
  }
  console.log('='.repeat(60));

  if (toUpload.length === 0) {
    console.log('\n✅ Все локальные файлы уже есть в S3!');
    return;
  }

  if (!shouldUpload) {
    console.log('\n📋 Файлы для загрузки (первые 30):');
    for (const file of toUpload.slice(0, 30)) {
      const category = categorizeFile(file.relativePath);
      console.log(`   [${category}] ${file.relativePath} (${formatSize(file.size)})`);
    }
    if (toUpload.length > 30) {
      console.log(`   ... и ещё ${toUpload.length - 30} файлов`);
    }
    console.log('\n💡 Для загрузки запустите: npm run s3:upload -- --upload');
    return;
  }

  console.log('\n☁️  Загружаем файлы в S3...');
  let uploaded = 0;
  let uploadedBytes = 0;
  const startTime = Date.now();

  for (const file of toUpload) {
    try {
      await uploadFile(client, bucket, file);
      uploaded++;
      uploadedBytes += file.size;

      if (uploaded % 50 === 0 || uploaded === toUpload.length) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = uploadedBytes / elapsed;
        const remaining = (stats.uploadedBytes - uploadedBytes) / speed;
        console.log(
          `  Загружено ${uploaded}/${toUpload.length} (${formatSize(uploadedBytes)}) ` +
          `| ${formatSize(speed)}/s | ~${Math.ceil(remaining)}s осталось`,
        );
      }
    } catch (error) {
      console.error(`  Ошибка загрузки ${file.relativePath}:`, error);
    }
  }

  stats.uploaded = uploaded;

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Загрузка завершена!');
  console.log(`   Загружено файлов: ${stats.uploaded}`);
  console.log(`   Размер: ${formatSize(stats.uploadedBytes)}`);
  console.log(`   Время: ${totalTime}s`);
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
