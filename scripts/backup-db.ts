/**
 * Бэкап MongoDB через mongodump.
 * Создаёт дамп в каталог BACKUP_DIR/dump-YYYY-MM-DD (или ./backups по умолчанию).
 *
 * Требуется: установленные MongoDB Database Tools (mongodump в PATH).
 *   Ubuntu/Debian: sudo apt install mongodb-database-tools
 *   Или: https://www.mongodb.com/docs/database-tools/installation/installation/
 *
 * Запуск:
 *   npm run backup:db
 *   npx ts-node -r tsconfig-paths/register scripts/backup-db.ts
 *
 * Ежедневный бэкап (cron): добавить в crontab -e:
 *   0 2 * * * cd /path/to/tomilo-lib-server && /usr/bin/env bash -lc 'npm run backup:db' >> /var/log/tomilo-backup.log 2>&1
 * Или через скрипт: 0 2 * * * /path/to/tomilo-lib-server/scripts/cron-daily-backup.sh
 */
import 'dotenv/config';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function main() {
  const login = process.env.MONGO_LOGIN || 'admin';
  const password = process.env.MONGO_PASSWORD || 'password123';
  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';
  const database = process.env.MONGO_DATABASE || 'tomilo-lib_db';
  const authDatabase = process.env.MONGO_AUTHDATABASE || 'admin';

  const encodedPassword = encodeURIComponent(password);
  const uri = `mongodb://${login}:${encodedPassword}@${host}:${port}/${database}?authSource=${authDatabase}`;

  const baseDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir = path.join(baseDir, `dump-${dateStr}`);

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    console.log(`Created backup directory: ${baseDir}`);
  }

  console.log(`Backing up database to ${outDir}...`);
  const result = spawnSync(
    'mongodump',
    ['--uri', uri, '--out', outDir],
    { stdio: 'inherit', shell: false },
  );

  if (result.status !== 0) {
    console.error(`mongodump failed with code ${result.status}`);
    if (result.error) {
      console.error(result.error.message);
    }
    process.exit(1);
  }

  console.log(`Backup completed: ${outDir}`);
  process.exit(0);
}

main();
