import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import {
  ReadingDropRule,
  ReadingDropRuleDocument,
} from '../schemas/reading-drop-rule.schema';
import {
  DailyQuestItemReward,
  DailyQuestItemRewardDocument,
} from '../schemas/daily-quest-item-reward.schema';
import { GameItemsService } from './game-items.service';

function getStartOfDayUTC(d: Date = new Date()): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

@Injectable()
export class DropsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ReadingDropRule.name)
    private readingDropRuleModel: Model<ReadingDropRuleDocument>,
    @InjectModel(DailyQuestItemReward.name)
    private dailyQuestRewardModel: Model<DailyQuestItemRewardDocument>,
    private gameItemsService: GameItemsService,
  ) {}

  /**
   * Вызвать после добавления главы в историю чтения (только если isNewChapter и не бот).
   * Обновляет счётчики дня и выдаёт дропы по правилам.
   */
  async tryReadingDrops(
    userId: string,
    isNewChapter: boolean,
  ): Promise<{ itemId: string; count: number }[]> {
    if (!isNewChapter) return [];

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) return [];

    const today = getStartOfDayUTC();
    const readingDropsDate = user.readingDropsDate
      ? getStartOfDayUTC(new Date(user.readingDropsDate))
      : null;

    if (!readingDropsDate || readingDropsDate.getTime() !== today.getTime()) {
      user.readingDropsDate = today;
      user.readingChaptersToday = 0;
      user.readingDropsToday = [];
      user.markModified('readingDropsDate');
      user.markModified('readingChaptersToday');
      user.markModified('readingDropsToday');
    }

    user.readingChaptersToday = (user.readingChaptersToday ?? 0) + 1;
    user.markModified('readingChaptersToday');

    const rules = await this.readingDropRuleModel
      .find({ isActive: true })
      .lean()
      .exec();

    const gained: { itemId: string; count: number }[] = [];
    const dropsToday = [...(user.readingDropsToday ?? [])];
    const countsByItem = new Map<string, number>();
    for (const d of dropsToday) {
      countsByItem.set(d.itemId, (countsByItem.get(d.itemId) ?? 0) + d.count);
    }

    for (const rule of rules) {
      if (user.readingChaptersToday < (rule.minChaptersToday ?? 1)) continue;
      const already = countsByItem.get(rule.itemId) ?? 0;
      if (already >= rule.maxDropsPerDay) continue;
      if (Math.random() > rule.chance) continue;

      await this.gameItemsService.addToInventory(userId, rule.itemId, 1);
      countsByItem.set(rule.itemId, already + 1);
      gained.push({ itemId: rule.itemId, count: 1 });
    }

    user.readingDropsToday = Array.from(countsByItem.entries()).map(
      ([itemId, count]) => ({
        itemId,
        count,
      }),
    );
    user.markModified('readingDropsToday');
    await user.save();

    return gained;
  }

  /**
   * Выдать награды предметами за тип квеста при claim. Вызывать после начисления XP/монет в claimDailyQuest.
   */
  async grantDailyQuestRewards(
    userId: string,
    questType: string,
  ): Promise<{ itemId: string; count: number }[]> {
    const rewards = await this.dailyQuestRewardModel
      .find({ questType, isActive: true })
      .sort({ sortOrder: 1 })
      .lean()
      .exec();

    const gained: { itemId: string; count: number }[] = [];
    for (const r of rewards) {
      if (Math.random() > (r.chance ?? 1)) continue;
      const count =
        r.countMin === r.countMax
          ? r.countMin
          : r.countMin +
            Math.floor(Math.random() * (r.countMax - r.countMin + 1));
      if (count <= 0) continue;
      await this.gameItemsService.addToInventory(userId, r.itemId, count);
      gained.push({ itemId: r.itemId, count });
    }
    return gained;
  }
}
