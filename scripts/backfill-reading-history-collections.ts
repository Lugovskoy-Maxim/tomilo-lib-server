/**
 * Бэкфилл: копирует User.readingHistory в коллекции reading_histories + reading_history_orders.
 * Идемпотентно (upsert). Запускать после деплоя схемы вынесенной истории.
 *
 * npm run backfill:reading-history-collections
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MAX_READING_HISTORY_TITLES = 500;
const MAX_CHAPTERS_PER_TITLE_IN_HISTORY = 6000;

function toObjectId(v: unknown): mongoose.Types.ObjectId | null {
  if (v == null) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  const str = typeof v === 'string' ? v : String((v as { toString?: () => string })?.toString?.() ?? v);
  return mongoose.Types.ObjectId.isValid(str)
    ? new mongoose.Types.ObjectId(str)
    : null;
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
  const users = mongoose.connection.collection('users');
  const titlesColl = mongoose.connection.collection('reading_histories');
  const orderColl = mongoose.connection.collection('reading_history_orders');

  const cursor = users.find({
    readingHistory: { $exists: true, $ne: [] },
  });
  let n = 0;
  let written = 0;

  for await (const user of cursor) {
    n++;
    const raw = user.readingHistory;
    if (!Array.isArray(raw) || raw.length === 0) continue;

    const titleIds: mongoose.Types.ObjectId[] = [];
    const bulkOps: Parameters<typeof titlesColl.bulkWrite>[0] = [];

    for (const entry of raw) {
      const titleId = toObjectId((entry as any)?.titleId ?? (entry as any)?.title);
      if (!titleId) continue;

      let chapters: Array<{
        chapterId: mongoose.Types.ObjectId;
        chapterNumber: number;
        chapterTitle?: string;
        readAt: Date;
      }> = [];

      if (Array.isArray((entry as any)?.chapters)) {
        for (const ch of (entry as any).chapters) {
          const chapterId = toObjectId(ch?.chapterId ?? ch?.chapter);
          if (!chapterId) continue;
          chapters.push({
            chapterId,
            chapterNumber: Number(ch?.chapterNumber ?? ch?.number ?? 0),
            chapterTitle:
              typeof ch?.chapterTitle === 'string' ? ch.chapterTitle : undefined,
            readAt: ch?.readAt ? new Date(ch.readAt) : new Date(),
          });
        }
      }

      chapters = chapters
        .sort(
          (a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime(),
        )
        .slice(0, MAX_CHAPTERS_PER_TITLE_IN_HISTORY);

      const readAt = (entry as any)?.readAt
        ? new Date((entry as any).readAt)
        : new Date();

      if (chapters.length === 0) continue;

      titleIds.push(titleId);
      bulkOps.push({
        updateOne: {
          filter: { userId: user._id, titleId },
          update: {
            $set: {
              userId: user._id,
              titleId,
              chapters,
              readAt,
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }

    const trimmedTitles = titleIds.slice(0, MAX_READING_HISTORY_TITLES);
    if (trimmedTitles.length === 0) continue;

    await orderColl.updateOne(
      { userId: user._id },
      {
        $set: {
          userId: user._id,
          titleIds: trimmedTitles,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    const allowed = new Set(trimmedTitles.map((id) => id.toString()));
    const filteredOps = bulkOps.filter((op: any) => {
      const tid = op?.updateOne?.filter?.titleId;
      return tid && allowed.has(tid.toString());
    });

    if (filteredOps.length > 0) {
      await titlesColl.bulkWrite(filteredOps);
    }

    await titlesColl.deleteMany({
      userId: user._id,
      titleId: { $nin: trimmedTitles },
    });

    written++;
    if (written % 500 === 0) {
      console.log(`  ...processed ${written} users with history`);
    }
  }

  console.log(
    `\nDone. Scanned users with non-empty readingHistory: ${n}, wrote/updated external docs: ${written}`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
