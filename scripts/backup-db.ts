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
 * Ежедневный бэкап на почту: включите BACKUP_EMAIL_ENABLED=true на сервере (cron в приложении).
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildMongoConnectionUri,
  dumpMongoCollectionsToDir,
} from '../src/backup/mongo-backup.util';

async function main() {
  const uri = buildMongoConnectionUri((k) => process.env[k]);
  const database = process.env.MONGO_DATABASE || 'tomilo-lib_db';

  const baseDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir = path.join(baseDir, `dump-${dateStr}`, database);

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    console.log(`Created backup directory: ${baseDir}`);
  }

  console.log(`Connecting to MongoDB...`);
  await dumpMongoCollectionsToDir(uri, outDir);

  console.log(`Backup completed: ${outDir}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
