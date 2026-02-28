/**
 * Скрипт сравнения файлов на сервере и в S3.
 * Удаляет из S3 файлы, которых нет локально.
 *
 * Использование:
 *   npm run s3:cleanup           # Показать что будет удалено (dry-run)
 *   npm run s3:cleanup -- --delete   # Удалить файлы из S3
 */

import { config } from 'dotenv';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { join } from 'path';

config();

const UPLOADS_DIR = join(__dirname, '..', 'uploads');

interface SyncStats {
  localFiles: number;
  s3Files: number;
  toDelete: number;
  deleted: number;
  savedBytes: number;
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

async function getAllLocalFiles(dir: string): Promise<Set<string>> {
  const files = new Set<string>();

  async function walkDir(currentDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const relativePath = fullPath
            .replace(UPLOADS_DIR + '/', '')
            .replace(UPLOADS_DIR + '\\', '')
            .replace(/\\/g, '/');
          files.add(relativePath);
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

interface S3Object {
  key: string;
  size: number;
}

async function getAllS3Files(
  client: S3Client,
  bucket: string,
): Promise<S3Object[]> {
  const files: S3Object[] = [];
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
          files.push({
            key: obj.Key,
            size: obj.Size || 0,
          });
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files;
}

async function deleteS3Objects(
  client: S3Client,
  bucket: string,
  keys: string[],
): Promise<number> {
  if (keys.length === 0) return 0;

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
    console.log(`  Удалено ${deleted}/${keys.length} файлов...`);
  }

  return deleted;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');

  console.log('🔍 Сравнение файлов на сервере и в S3...\n');

  if (!shouldDelete) {
    console.log('ℹ️  Режим просмотра (dry-run). Для удаления добавьте --delete\n');
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
  console.log(`   Найдено: ${localFiles.size} файлов\n`);

  console.log('☁️  Сканируем S3...');
  const s3Files = await getAllS3Files(client, bucket);
  console.log(`   Найдено: ${s3Files.length} файлов\n`);

  const toDelete: S3Object[] = [];
  for (const s3File of s3Files) {
    if (!localFiles.has(s3File.key)) {
      toDelete.push(s3File);
    }
  }

  const stats: SyncStats = {
    localFiles: localFiles.size,
    s3Files: s3Files.length,
    toDelete: toDelete.length,
    deleted: 0,
    savedBytes: toDelete.reduce((sum, f) => sum + f.size, 0),
  };

  console.log('='.repeat(50));
  console.log('📊 Результаты сравнения:');
  console.log(`   Локальных файлов: ${stats.localFiles}`);
  console.log(`   Файлов в S3: ${stats.s3Files}`);
  console.log(`   Лишних в S3: ${stats.toDelete}`);
  console.log(`   Размер лишних: ${formatSize(stats.savedBytes)}`);
  console.log('='.repeat(50));

  if (toDelete.length === 0) {
    console.log('\n✅ S3 синхронизирован с локальными файлами. Нечего удалять.');
    return;
  }

  if (!shouldDelete) {
    console.log('\n📋 Файлы для удаления (первые 20):');
    for (const file of toDelete.slice(0, 20)) {
      console.log(`   - ${file.key} (${formatSize(file.size)})`);
    }
    if (toDelete.length > 20) {
      console.log(`   ... и ещё ${toDelete.length - 20} файлов`);
    }
    console.log(
      '\n💡 Для удаления запустите: npm run s3:cleanup -- --delete',
    );
    return;
  }

  console.log('\n🗑️  Удаляем лишние файлы из S3...');
  stats.deleted = await deleteS3Objects(
    client,
    bucket,
    toDelete.map((f) => f.key),
  );

  console.log('\n' + '='.repeat(50));
  console.log('✅ Очистка завершена!');
  console.log(`   Удалено файлов: ${stats.deleted}`);
  console.log(`   Освобождено: ${formatSize(stats.savedBytes)}`);
  console.log('='.repeat(50));
}

main().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
