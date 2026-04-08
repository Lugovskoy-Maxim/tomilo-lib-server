import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

function docToJsonSafe(doc: unknown): unknown {
  if (doc === null || doc === undefined) return doc;
  if (doc instanceof mongoose.Types.ObjectId) return doc.toString();
  if (doc instanceof Date) return doc.toISOString();
  if (Array.isArray(doc)) return doc.map(docToJsonSafe);
  if (typeof doc === 'object' && doc && doc.constructor?.name === 'Object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
      out[k] = docToJsonSafe(v);
    }
    return out;
  }
  return doc;
}

export function buildMongoConnectionUri(
  get: (key: string) => string | undefined,
): string {
  const uri = get('MONGO_URI');
  if (uri) return uri;

  const login = get('MONGO_LOGIN') || 'admin';
  const password = get('MONGO_PASSWORD') || 'password123';
  const host = get('MONGO_HOST') || 'localhost';
  const port = get('MONGO_PORT') || '27017';
  const database = get('MONGO_DATABASE') || 'tomilo-lib_db';
  const authDatabase = get('MONGO_AUTHDATABASE') || 'admin';

  const encodedPassword = encodeURIComponent(password);
  return `mongodb://${login}:${encodedPassword}@${host}:${port}/${database}?authSource=${authDatabase}`;
}

/**
 * Выгружает коллекции в JSON без использования основного подключения приложения.
 */
export async function dumpMongoCollectionsToDir(
  uri: string,
  outDir: string,
): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });

  const conn = mongoose.createConnection(uri);
  await conn.asPromise();
  try {
    const db = conn.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    const collections = await db.listCollections().toArray();

    for (const { name } of collections) {
      const coll = db.collection(name);
      const docs = await coll.find({}).toArray();
      const safe = docs.map((d) => docToJsonSafe(d));
      const filePath = path.join(outDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(safe, null, 2), 'utf8');
    }
  } finally {
    await conn.close();
  }
}

/**
 * Создаёт .tar.gz каталога dumpFolderName внутри baseDir (нужна утилита tar в PATH).
 */
export function tarGzDumpFolder(
  baseDir: string,
  dumpFolderName: string,
  archivePath: string,
): void {
  execFileSync('tar', ['-czf', archivePath, '-C', baseDir, dumpFolderName], {
    stdio: 'pipe',
  });
}
