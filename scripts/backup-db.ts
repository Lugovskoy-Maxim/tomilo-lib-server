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
 * Ежедневный бэкап (cron): 0 2 * * * /path/to/scripts/cron-daily-backup.sh >> /var/log/tomilo-backup.log 2>&1
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

function docToJsonSafe(doc: any): any {
  if (doc === null || doc === undefined) return doc;
  if (doc instanceof mongoose.Types.ObjectId) return doc.toString();
  if (doc instanceof Date) return doc.toISOString();
  if (Array.isArray(doc)) return doc.map(docToJsonSafe);
  if (typeof doc === 'object' && doc.constructor?.name === 'Object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(doc)) {
      out[k] = docToJsonSafe(v);
    }
    return out;
  }
  return doc;
}

async function main() {
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
  const outDir = path.join(baseDir, `dump-${dateStr}`, database);

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    console.log(`Created backup directory: ${baseDir}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('Database connection not available');
    process.exit(1);
  }

  const collections = await db.listCollections().toArray();
  console.log(`Backing up ${collections.length} collections to ${outDir}...`);

  for (const { name } of collections) {
    const coll = db.collection(name);
    const docs = await coll.find({}).toArray();
    const safe = docs.map((d) => docToJsonSafe(d));
    const filePath = path.join(outDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(safe, null, 2), 'utf8');
    console.log(`  ${name}: ${docs.length} documents`);
  }

  await mongoose.disconnect();
  console.log(`Backup completed: ${outDir}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
