/**
 * Миграция: пересчитывает ratingsCount и commentsCount для всех пользователей.
 * 
 * ratingsCount = количество уникальных тайтлов, которые пользователь оценил
 * commentsCount = количество видимых комментариев пользователя
 *
 * Запуск: npx ts-node -r tsconfig-paths/register scripts/recalculate-user-counts.ts
 * Или: npm run migrate:recalculate-counts
 */
import 'dotenv/config';
import mongoose from 'mongoose';

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
  
  const usersCollection = mongoose.connection.collection('users');
  const titlesCollection = mongoose.connection.collection('titles');
  const commentsCollection = mongoose.connection.collection('comments');

  console.log('Aggregating ratings counts from titles...');
  
  // Подсчёт оценок: сколько тайтлов оценил каждый пользователь
  const ratingsCounts = await titlesCollection.aggregate([
    { $unwind: '$ratings' },
    {
      $group: {
        _id: '$ratings.userId',
        count: { $sum: 1 },
      },
    },
  ]).toArray();

  const ratingsMap = new Map<string, number>();
  for (const item of ratingsCounts) {
    if (item._id) {
      ratingsMap.set(item._id.toString(), item.count);
    }
  }
  console.log(`Found ratings for ${ratingsMap.size} users`);

  console.log('Aggregating comments counts...');
  
  // Подсчёт комментариев: сколько видимых комментариев у каждого пользователя
  const commentsCounts = await commentsCollection.aggregate([
    { $match: { isVisible: true } },
    {
      $group: {
        _id: '$userId',
        count: { $sum: 1 },
      },
    },
  ]).toArray();

  const commentsMap = new Map<string, number>();
  for (const item of commentsCounts) {
    if (item._id) {
      commentsMap.set(item._id.toString(), item.count);
    }
  }
  console.log(`Found comments for ${commentsMap.size} users`);

  console.log('Updating users...');
  
  const users = await usersCollection.find({}).toArray();
  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    const userId = user._id.toString();
    const newRatingsCount = ratingsMap.get(userId) ?? 0;
    const newCommentsCount = commentsMap.get(userId) ?? 0;

    const currentRatingsCount = user.ratingsCount ?? 0;
    const currentCommentsCount = user.commentsCount ?? 0;

    if (currentRatingsCount !== newRatingsCount || currentCommentsCount !== newCommentsCount) {
      await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            ratingsCount: newRatingsCount,
            commentsCount: newCommentsCount,
          },
        },
      );
      updated++;
      if (newRatingsCount > 0 || newCommentsCount > 0) {
        console.log(`  Updated ${user.username ?? userId}: ratings ${currentRatingsCount} → ${newRatingsCount}, comments ${currentCommentsCount} → ${newCommentsCount}`);
      }
    } else {
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (no changes): ${skipped}`);
  console.log(`Total users with ratings: ${ratingsMap.size}`);
  console.log(`Total users with comments: ${commentsMap.size}`);
  
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
