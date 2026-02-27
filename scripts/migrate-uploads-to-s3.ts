/**
 * Скрипт миграции файлов из локальной папки uploads в S3 хранилище.
 *
 * Использование:
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-uploads-to-s3.ts
 *
 * Убедитесь, что в .env заполнены переменные S3_ENDPOINT, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY, S3_BUCKET.
 */

import { config } from 'dotenv';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { lookup } from 'mime-types';

config();

const UPLOADS_DIR = join(__dirname, '..', 'uploads');

interface MigrationStats {
  total: number;
  uploaded: number;
  skipped: number;
  errors: number;
}

async function getS3Client(): Promise<S3Client> {
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

async function fileExistsInS3(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walkDir(currentDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Ошибка при чтении директории ${currentDir}:`, error);
    }
  }

  await walkDir(dir);
  return files;
}

async function migrateFile(
  client: S3Client,
  bucket: string,
  filePath: string,
  stats: MigrationStats,
  skipExisting: boolean,
): Promise<void> {
  const key = relative(UPLOADS_DIR, filePath).replace(/\\/g, '/');

  if (skipExisting) {
    const exists = await fileExistsInS3(client, bucket, key);
    if (exists) {
      console.log(`⏭️  Пропускаем (уже существует): ${key}`);
      stats.skipped++;
      return;
    }
  }

  try {
    const fileContent = await fs.readFile(filePath);
    const contentType = lookup(filePath) || 'application/octet-stream';

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        ACL: 'public-read',
      }),
    );

    console.log(`✅ Загружен: ${key} (${formatSize(fileContent.length)})`);
    stats.uploaded++;
  } catch (error) {
    console.error(`❌ Ошибка при загрузке ${key}:`, error);
    stats.errors++;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  console.log('🚀 Начало миграции файлов в S3...\n');

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET не указан в переменных окружения');
  }

  const client = await getS3Client();

  console.log(`📁 Сканируем папку: ${UPLOADS_DIR}`);
  console.log(`🪣 Целевой бакет: ${bucket}\n`);

  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    console.log('📭 Папка uploads не найдена или пуста. Миграция не требуется.');
    return;
  }

  const files = await getAllFiles(UPLOADS_DIR);
  console.log(`📊 Найдено файлов: ${files.length}\n`);

  if (files.length === 0) {
    console.log('📭 Нет файлов для миграции.');
    return;
  }

  const stats: MigrationStats = {
    total: files.length,
    uploaded: 0,
    skipped: 0,
    errors: 0,
  };

  const skipExisting = process.argv.includes('--skip-existing');
  if (skipExisting) {
    console.log('ℹ️  Режим: пропускать существующие файлы\n');
  }

  const batchSize = 10;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(
      batch.map((file) => migrateFile(client, bucket, file, stats, skipExisting)),
    );
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Результаты миграции:');
  console.log(`   Всего файлов: ${stats.total}`);
  console.log(`   Загружено: ${stats.uploaded}`);
  console.log(`   Пропущено: ${stats.skipped}`);
  console.log(`   Ошибок: ${stats.errors}`);
  console.log('='.repeat(50));

  if (stats.errors > 0) {
    console.log('\n⚠️  Некоторые файлы не были загружены. Проверьте ошибки выше.');
    process.exit(1);
  }

  console.log('\n✅ Миграция завершена успешно!');
  console.log(
    '\n💡 Совет: После проверки работоспособности вы можете удалить локальную папку uploads.',
  );
}

main().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
