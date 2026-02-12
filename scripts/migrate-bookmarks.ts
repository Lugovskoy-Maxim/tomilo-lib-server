/**
 * Миграция: приводит все закладки пользователей к формату { titleId, category, addedAt }.
 * Исправляет: string[], spread ("0"-"23"), title без titleId.
 *
 * Запуск: npx ts-node -r tsconfig-paths/register scripts/migrate-bookmarks.ts
 * Или: npm run migrate:bookmarks
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const BOOKMARK_CATEGORIES = ['reading', 'planned', 'completed', 'favorites', 'dropped'] as const;

function extractTitleIdFromBookmark(b: any): string {
  if (typeof b === 'string') return b;
  const from = b?.titleId ?? b?.title;
  if (from) {
    return from instanceof mongoose.Types.ObjectId ? from.toString() : String(from);
  }
  const chars: string[] = [];
  for (let i = 0; i < 24; i++) {
    const c = b?.[String(i)];
    if (typeof c === 'string' && /^[0-9a-f]$/i.test(c)) chars.push(c);
  }
  return chars.length === 24 ? chars.join('') : '';
}

function bookmarkNeedsNormalize(b: any): boolean {
  if (typeof b === 'string') return true;
  if (!b || typeof b !== 'object') return false;
  if (b.titleId || b.title) {
    if (b.title && !b.titleId) return true;
    return false;
  }
  const hasCharKeys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
    .every((i) => typeof b[String(i)] === 'string');
  return hasCharKeys;
}

function normalizeBookmarks(raw: any[]): Array<{ titleId: mongoose.Types.ObjectId; category: string; addedAt: Date }> {
  const result: Array<{ titleId: mongoose.Types.ObjectId; category: string; addedAt: Date }> = [];
  for (const b of raw) {
    const titleIdStr = extractTitleIdFromBookmark(b);
    if (!titleIdStr || !mongoose.Types.ObjectId.isValid(titleIdStr)) continue;
    result.push({
      titleId: new mongoose.Types.ObjectId(titleIdStr),
      category: BOOKMARK_CATEGORIES.includes(b?.category) ? b.category : 'reading',
      addedAt: b?.addedAt ? new Date(b.addedAt) : new Date(),
    });
  }
  return result;
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

  const users = await coll.find({ bookmarks: { $exists: true, $ne: [] } }).toArray();
  console.log(`Found ${users.length} users with bookmarks`);

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    const bookmarks = user.bookmarks;
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) continue;

    const needsMigrate = bookmarks.some((b: any) => bookmarkNeedsNormalize(b));
    if (!needsMigrate) {
      skipped++;
      continue;
    }

    const normalized = normalizeBookmarks(bookmarks);
    await coll.updateOne(
      { _id: user._id },
      { $set: { bookmarks: normalized } },
    );
    updated++;
    console.log(`  Updated user ${user._id} (${user.username ?? 'no-username'}): ${bookmarks.length} → ${normalized.length} bookmarks`);
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (already ok): ${skipped}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
