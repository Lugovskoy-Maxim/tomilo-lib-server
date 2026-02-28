/**
 * Скрипт сверки файлов в /uploads с записями в БД.
 * Находит и удаляет осиротевшие файлы (которые не привязаны к записям в БД).
 *
 * Использование:
 *   npm run cleanup:orphans           # Показать осиротевшие файлы (dry-run)
 *   npm run cleanup:orphans -- --delete   # Удалить осиротевшие файлы
 */

import { config } from 'dotenv';
import mongoose from 'mongoose';
import { promises as fs } from 'fs';
import { join, relative } from 'path';

config();

const UPLOADS_DIR = join(__dirname, '..', 'uploads');

interface OrphanStats {
  totalFiles: number;
  referencedFiles: number;
  orphanFiles: number;
  deletedFiles: number;
  savedBytes: number;
  byCategory: Record<string, number>;
}

interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
}

async function getAllLocalFiles(dir: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  async function walkDir(currentDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          const relativePath = relative(UPLOADS_DIR, fullPath).replace(/\\/g, '/');
          files.push({
            path: fullPath,
            relativePath,
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

function normalizeImagePath(path: string | null | undefined): string | null {
  if (!path) return null;
  let normalized = path.replace(/^\//, '');
  if (normalized.startsWith('uploads/')) {
    normalized = normalized.replace(/^uploads\//, '');
  }
  return normalized;
}

async function getReferencedFilesFromDB(): Promise<Set<string>> {
  const referenced = new Set<string>();

  const User = mongoose.connection.collection('users');
  const users = await User.find({}, { projection: { avatar: 1 } }).toArray();
  for (const user of users) {
    const path = normalizeImagePath(user.avatar);
    if (path) referenced.add(path);
  }
  console.log(`   Users: ${users.length} записей, ${referenced.size} файлов`);

  const Announcement = mongoose.connection.collection('announcements');
  const announcements = await Announcement.find(
    {},
    { projection: { coverImage: 1, images: 1 } },
  ).toArray();
  let announcementFiles = 0;
  for (const ann of announcements) {
    const cover = normalizeImagePath(ann.coverImage);
    if (cover) {
      referenced.add(cover);
      announcementFiles++;
    }
    if (ann.images && Array.isArray(ann.images)) {
      for (const img of ann.images) {
        const path = normalizeImagePath(img);
        if (path) {
          referenced.add(path);
          announcementFiles++;
        }
      }
    }
  }
  console.log(`   Announcements: ${announcements.length} записей, ${announcementFiles} файлов`);

  const Title = mongoose.connection.collection('titles');
  const titles = await Title.find({}, { projection: { coverImage: 1 } }).toArray();
  let titleFiles = 0;
  for (const title of titles) {
    const path = normalizeImagePath(title.coverImage);
    if (path) {
      referenced.add(path);
      titleFiles++;
    }
  }
  console.log(`   Titles: ${titles.length} записей, ${titleFiles} файлов`);

  const Chapter = mongoose.connection.collection('chapters');
  const chapters = await Chapter.find({}, { projection: { pages: 1 } }).toArray();
  let chapterFiles = 0;
  for (const chapter of chapters) {
    if (chapter.pages && Array.isArray(chapter.pages)) {
      for (const page of chapter.pages) {
        const path = normalizeImagePath(page);
        if (path) {
          referenced.add(path);
          chapterFiles++;
        }
      }
    }
  }
  console.log(`   Chapters: ${chapters.length} записей, ${chapterFiles} файлов`);

  const Collection = mongoose.connection.collection('collections');
  const collections = await Collection.find({}, { projection: { cover: 1 } }).toArray();
  let collectionFiles = 0;
  for (const col of collections) {
    const path = normalizeImagePath(col.cover);
    if (path) {
      referenced.add(path);
      collectionFiles++;
    }
  }
  console.log(`   Collections: ${collections.length} записей, ${collectionFiles} файлов`);

  const decorationCollections = [
    'avatardecorations',
    'avatarframedecorations',
    'backgrounddecorations',
    'carddecorations',
  ];

  let decorationFiles = 0;
  for (const collName of decorationCollections) {
    try {
      const coll = mongoose.connection.collection(collName);
      const docs = await coll.find({}, { projection: { imageUrl: 1 } }).toArray();
      for (const doc of docs) {
        const path = normalizeImagePath(doc.imageUrl);
        if (path) {
          referenced.add(path);
          decorationFiles++;
        }
      }
    } catch {
      // collection might not exist
    }
  }
  console.log(`   Decorations: ${decorationFiles} файлов`);

  const Character = mongoose.connection.collection('characters');
  const characters = await Character.find({}, { projection: { avatar: 1 } }).toArray();
  let characterFiles = 0;
  for (const char of characters) {
    const path = normalizeImagePath(char.avatar);
    if (path) {
      referenced.add(path);
      characterFiles++;
    }
  }
  console.log(`   Characters: ${characters.length} записей, ${characterFiles} файлов`);

  return referenced;
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function deleteFiles(files: FileInfo[]): Promise<number> {
  let deleted = 0;
  for (const file of files) {
    try {
      await fs.unlink(file.path);
      deleted++;
      if (deleted % 100 === 0) {
        console.log(`  Удалено ${deleted}/${files.length} файлов...`);
      }
    } catch (error) {
      console.error(`  Ошибка удаления ${file.relativePath}:`, error);
    }
  }
  return deleted;
}

async function cleanupEmptyDirs(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = join(dir, entry.name);
        await cleanupEmptyDirs(subDir);
      }
    }
    const remaining = await fs.readdir(dir);
    if (remaining.length === 0 && dir !== UPLOADS_DIR) {
      await fs.rmdir(dir);
    }
  } catch {
    // ignore errors
  }
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');

  console.log('🔍 Сверка файлов в /uploads с записями в БД...\n');

  if (!shouldDelete) {
    console.log('ℹ️  Режим просмотра (dry-run). Для удаления добавьте --delete\n');
  }

  let mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    const login = process.env.MONGO_LOGIN;
    const password = process.env.MONGO_PASSWORD;
    const host = process.env.MONGO_HOST || 'localhost';
    const port = process.env.MONGO_PORT || '27017';
    const authDatabase = process.env.MONGO_AUTHDATABASE || 'admin';
    const database = process.env.MONGO_DATABASE;

    if (!database) {
      throw new Error('MONGODB_URI или MONGO_DATABASE не указан в переменных окружения');
    }

    if (login && password) {
      mongoUri = `mongodb://${login}:${password}@${host}:${port}/${database}?authSource=${authDatabase}`;
    } else {
      mongoUri = `mongodb://${host}:${port}/${database}`;
    }
  }

  console.log('🔌 Подключаемся к MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('   Подключено!\n');

  console.log(`📁 Папка uploads: ${UPLOADS_DIR}\n`);

  console.log('📂 Сканируем локальные файлы...');
  const localFiles = await getAllLocalFiles(UPLOADS_DIR);
  console.log(`   Найдено: ${localFiles.length} файлов\n`);

  console.log('🗄️  Собираем ссылки из БД...');
  const referencedFiles = await getReferencedFilesFromDB();
  console.log(`   Всего ссылок в БД: ${referencedFiles.size}\n`);

  const orphanFiles: FileInfo[] = [];
  const stats: OrphanStats = {
    totalFiles: localFiles.length,
    referencedFiles: 0,
    orphanFiles: 0,
    deletedFiles: 0,
    savedBytes: 0,
    byCategory: {},
  };

  for (const file of localFiles) {
    if (referencedFiles.has(file.relativePath)) {
      stats.referencedFiles++;
    } else {
      orphanFiles.push(file);
      stats.orphanFiles++;
      stats.savedBytes += file.size;
      const category = categorizeFile(file.relativePath);
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }
  }

  console.log('='.repeat(60));
  console.log('📊 Результаты сверки:');
  console.log(`   Всего файлов в uploads: ${stats.totalFiles}`);
  console.log(`   Привязанных к БД: ${stats.referencedFiles}`);
  console.log(`   Осиротевших: ${stats.orphanFiles}`);
  console.log(`   Размер осиротевших: ${formatSize(stats.savedBytes)}`);
  console.log('');
  console.log('   По категориям:');
  for (const [category, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`     - ${category}: ${count}`);
  }
  console.log('='.repeat(60));

  if (orphanFiles.length === 0) {
    console.log('\n✅ Осиротевших файлов не найдено!');
    await mongoose.disconnect();
    return;
  }

  if (!shouldDelete) {
    console.log('\n📋 Примеры осиротевших файлов (первые 30):');
    for (const file of orphanFiles.slice(0, 30)) {
      const category = categorizeFile(file.relativePath);
      console.log(`   [${category}] ${file.relativePath} (${formatSize(file.size)})`);
    }
    if (orphanFiles.length > 30) {
      console.log(`   ... и ещё ${orphanFiles.length - 30} файлов`);
    }
    console.log('\n💡 Для удаления запустите: npm run cleanup:orphans -- --delete');
    await mongoose.disconnect();
    return;
  }

  console.log('\n🗑️  Удаляем осиротевшие файлы...');
  stats.deletedFiles = await deleteFiles(orphanFiles);

  console.log('\n🧹 Очищаем пустые директории...');
  await cleanupEmptyDirs(UPLOADS_DIR);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Очистка завершена!');
  console.log(`   Удалено файлов: ${stats.deletedFiles}`);
  console.log(`   Освобождено: ${formatSize(stats.savedBytes)}`);
  console.log('='.repeat(60));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('❌ Критическая ошибка:', error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
