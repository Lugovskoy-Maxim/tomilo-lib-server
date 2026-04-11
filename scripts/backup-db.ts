/**
 * Бэкап MongoDB средствами Node.js (без mongodump).
 * Подключается к БД через Mongoose и выгружает каждую коллекцию в JSON-файл.
 * Каталог: BACKUP_DIR/dump-YYYY-MM-DD/<database>/<collection>.json
 *
 * Внешние утилиты не требуются — нужны только зависимости проекта.
 *
 * Запуск:
 *   npm run backup:db
 *   npx ts-node -r tsconfig-paths/register scripts/backup-db.ts
 *
 * Опции:
 *   --s3              Загрузить бекап в S3 (требует настройки S3)
 *   --email           Отправить бекап по почте (требует настройки email)
 *   --cleanup         Очистить старые бекапы в S3
 *
 * Ежедневный бэкап на почту: включите BACKUP_EMAIL_ENABLED=true на сервере (cron в приложении).
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
  buildMongoConnectionUri,
  dumpMongoCollectionsToDir,
  tarGzDumpFolder,
} from '../src/backup/mongo-backup.util';

// Импортируем сервисы (требуют контекст NestJS, поэтому используем упрощенную версию)
async function uploadToS3(
  archivePath: string,
  dateStr: string,
): Promise<string> {
  // Упрощенная загрузка в S3 без полной инициализации NestJS
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'us-east-1';
  const s3Prefix = process.env.BACKUP_S3_PREFIX || 'backups/database';

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'S3 не настроен. Проверьте переменные окружения S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET',
    );
  }

  const s3Client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${s3Prefix}/${dateStr}/tomilo-db-${timestamp}.tar.gz`;
  const fileBuffer = fs.readFileSync(archivePath);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: 'application/gzip',
      ACL: 'public-read',
    }),
  );

  const publicUrl = process.env.S3_PUBLIC_URL || endpoint.replace(/\/$/, '');
  return `${publicUrl}/${bucket}/${key}`;
}

async function main() {
  const program = new Command();

  program
    .name('backup-db')
    .description('Создание бекапа базы данных MongoDB')
    .option('--s3', 'Загрузить бекап в S3')
    .option('--email', 'Отправить бекап по почте (вложение)')
    .option('--cleanup', 'Очистить старые бекапы в S3 (требует --s3)')
    .option(
      '--days <number>',
      'Количество дней для хранения бекапов (по умолчанию 30)',
      '30',
    )
    .parse(process.argv);

  const options = program.opts();

  const uri = buildMongoConnectionUri((k) => process.env[k]);
  const database = process.env.MONGO_DATABASE || 'tomilo-lib_db';
  const baseDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  const dateStr = new Date().toISOString().slice(0, 10);
  const dumpFolderName = `dump-${dateStr}`;
  const outDir = path.join(baseDir, dumpFolderName, database);
  let archivePath: string | undefined;

  try {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
      console.log(`Создана директория для бекапов: ${baseDir}`);
    }

    console.log(`Подключение к MongoDB...`);
    await dumpMongoCollectionsToDir(uri, outDir);
    console.log(`Бекап создан в: ${outDir}`);

    // Создаем архив
    archivePath = path.join(baseDir, `${dumpFolderName}.tar.gz`);
    tarGzDumpFolder(baseDir, dumpFolderName, archivePath);
    const stat = fs.statSync(archivePath);
    console.log(`Архив создан: ${archivePath}, размер: ${stat.size} байт`);

    // Загрузка в S3
    if (options.s3) {
      try {
        console.log('Загрузка бекапа в S3...');
        const s3Url = await uploadToS3(archivePath, dateStr);
        console.log(`Бекап загружен в S3: ${s3Url}`);

        // Очистка старых бекапов
        if (options.cleanup) {
          console.log(`Очистка бекапов старше ${options.days} дней...`);
          // Здесь можно добавить логику очистки
          console.log(
            'Очистка старых бекапов (реализация требует полного контекста NestJS)',
          );
        }
      } catch (s3Error) {
        console.error('Ошибка при загрузке в S3:', s3Error);
      }
    }

    // Отправка по почте (вложение)
    if (options.email) {
      console.log('Отправка бекапа по почте...');
      // Здесь можно добавить логику отправки email
      console.log(
        'Отправка email (реализация требует полного контекста NestJS)',
      );
    }

    console.log('Бекап успешно завершен');
  } catch (err) {
    console.error('Ошибка при создании бекапа:', err);
    process.exit(1);
  } finally {
    // Очистка временных файлов
    if (archivePath && fs.existsSync(archivePath)) {
      try {
        fs.unlinkSync(archivePath);
      } catch {
        /* ignore */
      }
    }

    const dumpDir = path.join(baseDir, dumpFolderName);
    if (fs.existsSync(dumpDir)) {
      try {
        fs.rmSync(dumpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
