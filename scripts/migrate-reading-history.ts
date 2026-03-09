/**
 * Миграция: приводит историю чтения всех пользователей к актуальному формату.
 * - Инициализирует readingHistory = [] у пользователей без поля или с не-массивом.
 * - Нормализует каждую запись: titleId (ObjectId), chapters[{ chapterId, chapterNumber, chapterTitle?, readAt }], readAt.
 * - Приводит типы (строки → ObjectId/Date/Number), обрезает по лимитам (500 тайтлов, 6000 глав на тайтл).
 *
 * Перед миграцией обязательно сделать бэкап БД: npm run backup:db
 * Или запустить миграцию с предварительным бэкапом: npm run migrate:reading-history:safe
 *
 * Запуск: npx ts-node -r tsconfig-paths/register scripts/migrate-reading-history.ts
 * Или: npm run migrate:reading-history
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MAX_READING_HISTORY_TITLES = 500;
const MAX_CHAPTERS_PER_TITLE_IN_HISTORY = 6000;

function toObjectId(v: any): mongoose.Types.ObjectId | null {
  if (v == null) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  const str = typeof v === 'string' ? v : String(v?.toString?.() ?? v);
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
}

function toDate(v: any): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && !Number.isNaN(v)) return new Date(v);
  if (typeof v === 'string') return new Date(v);
  return new Date();
}

function toNumber(v: any): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : n;
}

function normalizeChapter(ch: any): { chapterId: mongoose.Types.ObjectId; chapterNumber: number; chapterTitle?: string; readAt: Date } | null {
  const chapterId = toObjectId(ch?.chapterId ?? ch?.chapter);
  if (!chapterId) return null;
  return {
    chapterId,
    chapterNumber: toNumber(ch?.chapterNumber ?? ch?.number ?? 0),
    chapterTitle: typeof ch?.chapterTitle === 'string' ? ch.chapterTitle : ch?.chapterTitle ? String(ch.chapterTitle) : undefined,
    readAt: toDate(ch?.readAt),
  };
}

function normalizeEntry(entry: any): { titleId: mongoose.Types.ObjectId; chapters: Array<{ chapterId: mongoose.Types.ObjectId; chapterNumber: number; chapterTitle?: string; readAt: Date }>; readAt: Date } | null {
  const titleId = toObjectId(entry?.titleId ?? entry?.title);
  if (!titleId) return null;

  let chapters: Array<{ chapterId: mongoose.Types.ObjectId; chapterNumber: number; chapterTitle?: string; readAt: Date }> = [];
  if (Array.isArray(entry?.chapters)) {
    for (const ch of entry.chapters) {
      const norm = normalizeChapter(ch);
      if (norm) chapters.push(norm);
    }
  } else if (entry?.lastChapterId ?? entry?.chapterId) {
    // Старый формат: одна последняя глава
    const ch = normalizeChapter({
      chapterId: entry.lastChapterId ?? entry.chapterId,
      chapterNumber: entry.lastChapterNumber ?? entry.chapterNumber ?? 0,
      chapterTitle: entry.chapterTitle,
      readAt: entry.readAt,
    });
    if (ch) chapters = [ch];
  }

  // Сортируем по readAt (новые первые), обрезаем до лимита глав на тайтл
  chapters = chapters
    .sort((a, b) => toDate(b.readAt).getTime() - toDate(a.readAt).getTime())
    .slice(0, MAX_CHAPTERS_PER_TITLE_IN_HISTORY);

  const readAt = toDate(entry?.readAt);
  if (chapters.length === 0) return null;

  return { titleId, chapters, readAt };
}

function needsMigration(raw: any): boolean {
  if (raw == null || !Array.isArray(raw)) return true;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return true;
    if (entry.titleId != null && !(entry.titleId instanceof mongoose.Types.ObjectId)) return true;
    if (!Array.isArray(entry.chapters)) return true;
    for (const ch of entry.chapters ?? []) {
      if (ch?.chapterId != null && !(ch.chapterId instanceof mongoose.Types.ObjectId)) return true;
      if (ch?.readAt != null && !(ch.readAt instanceof Date)) return true;
    }
    if (entry.readAt != null && !(entry.readAt instanceof Date)) return true;
  }
  return false;
}

async function run() {
  const login = process.env.MONGO_LOGIN || 'admin';
  const password = process.env.MONGO_PASSWORD || 'password123';
  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';
  const database = process.env.MONGO_DATABASE || 'tomilo-lib_db';
  const authDatabase = process.env.MONGO_AUTHDATABASE || 'admin';
  const uri = `mongodb://${login}:${password}@${host}:${port}/${database}?authSource=${authDatabase}`;

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  const coll = mongoose.connection.collection('users');

  const cursor = coll.find({});
  let total = 0;
  let updated = 0;
  let skipped = 0;
  let initialized = 0;

  for await (const user of cursor) {
    total++;
    const raw = user.readingHistory;

    if (raw == null || !Array.isArray(raw)) {
      await coll.updateOne(
        { _id: user._id },
        { $set: { readingHistory: [] } },
      );
      initialized++;
      updated++;
      if (raw != null) {
        console.log(`  User ${user._id} (${user.username ?? 'no-username'}): set readingHistory to [] (was ${typeof raw})`);
      }
      continue;
    }

    if (!needsMigration(raw)) {
      skipped++;
      continue;
    }

    const normalized: Array<{ titleId: mongoose.Types.ObjectId; chapters: any[]; readAt: Date }> = [];
    for (const entry of raw) {
      const norm = normalizeEntry(entry);
      if (norm) normalized.push(norm);
    }

    // По времени чтения тайтла (readAt) — новые первые, обрезаем до лимита тайтлов
    normalized.sort((a, b) => b.readAt.getTime() - a.readAt.getTime());
    const trimmed = normalized.slice(0, MAX_READING_HISTORY_TITLES);

    await coll.updateOne(
      { _id: user._id },
      { $set: { readingHistory: trimmed } },
    );
    updated++;
    const totalChapters = trimmed.reduce((s, e) => s + e.chapters.length, 0);
    console.log(`  User ${user._id} (${user.username ?? 'no-username'}): ${raw.length} → ${trimmed.length} titles, ${totalChapters} chapters`);
  }

  console.log(`\nDone. Total users: ${total}, Updated: ${updated} (initialized: ${initialized}, normalized: ${updated - initialized}), Skipped (already ok): ${skipped}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
