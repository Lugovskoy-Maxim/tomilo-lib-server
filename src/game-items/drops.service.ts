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

/** Макс. дропов необычных (uncommon) в день на пользователя — всего. */
const MAX_UNCOMMON_READING_DROPS_PER_DAY = 2;
/** Макс. дропов редких (rare) в день на пользователя — всего. */
const MAX_RARE_READING_DROPS_PER_DAY = 3;
/** Макс. дропов эпик + легендарный в день — вместе только 1. */
const MAX_HIGH_RARITY_READING_DROPS_PER_DAY = 1;

function getStartOfDayUTC(d: Date = new Date()): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

function countDropsTodayByRarity(
  dropsToday: { itemId: string; count: number }[],
  itemIdToRarity: Map<string, string>,
): { uncommon: number; rare: number; epicOrLegendary: number } {
  let uncommon = 0;
  let rare = 0;
  let epicOrLegendary = 0;
  for (const d of dropsToday) {
    const r = itemIdToRarity.get(d.itemId) ?? 'common';
    const add = d.count ?? 0;
    if (r === 'uncommon') uncommon += add;
    else if (r === 'rare') rare += add;
    else if (r === 'epic' || r === 'legendary') epicOrLegendary += add;
  }
  return { uncommon, rare, epicOrLegendary };
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

    const allItems = await this.gameItemsService.findAllActive();
    const itemIdToRarity = new Map<string, string>();
    for (const item of allItems) {
      itemIdToRarity.set(item.id, item.rarity ?? 'common');
    }

    const gained: { itemId: string; count: number }[] = [];
    const dropsToday = [...(user.readingDropsToday ?? [])];
    const countsByItem = new Map<string, number>();
    for (const d of dropsToday) {
      countsByItem.set(d.itemId, (countsByItem.get(d.itemId) ?? 0) + d.count);
    }
    const byRarity = countDropsTodayByRarity(dropsToday, itemIdToRarity);

    for (const rule of rules) {
      if (user.readingChaptersToday < (rule.minChaptersToday ?? 1)) continue;
      const already = countsByItem.get(rule.itemId) ?? 0;
      if (already >= rule.maxDropsPerDay) continue;

      const rarity = itemIdToRarity.get(rule.itemId) ?? 'common';
      if (rarity === 'uncommon' && byRarity.uncommon >= MAX_UNCOMMON_READING_DROPS_PER_DAY)
        continue;
      if (rarity === 'rare' && byRarity.rare >= MAX_RARE_READING_DROPS_PER_DAY) continue;
      if (
        (rarity === 'epic' || rarity === 'legendary') &&
        byRarity.epicOrLegendary >= MAX_HIGH_RARITY_READING_DROPS_PER_DAY
      )
        continue;

      if (Math.random() > rule.chance) continue;

      await this.gameItemsService.addToInventory(userId, rule.itemId, 1);
      countsByItem.set(rule.itemId, already + 1);
      if (rarity === 'uncommon') byRarity.uncommon += 1;
      else if (rarity === 'rare') byRarity.rare += 1;
      else if (rarity === 'epic' || rarity === 'legendary') byRarity.epicOrLegendary += 1;
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
  ): Promise<{ itemId: string; count: number; name?: string; icon?: string }[]> {
    const rewards = await this.dailyQuestRewardModel
      .find({ questType, isActive: true })
      .sort({ sortOrder: 1 })
      .lean()
      .exec();

    const gained: { itemId: string; count: number; name?: string; icon?: string }[] = [];
    for (const r of rewards) {
      if (Math.random() > (r.chance ?? 1)) continue;
      const count =
        r.countMin === r.countMax
          ? r.countMin
          : r.countMin +
            Math.floor(Math.random() * (r.countMax - r.countMin + 1));
      if (count <= 0) continue;
      await this.gameItemsService.addToInventory(userId, r.itemId, count);
      const item = await this.gameItemsService.findById(r.itemId);
      gained.push({
        itemId: r.itemId,
        count,
        name: item?.name,
        icon: item?.icon ?? undefined,
      });
    }
    return gained;
  }

  async getDailyQuestRewardPreviews(questTypes: string[]): Promise<
    Record<
      string,
      {
        itemId: string;
        countMin: number;
        countMax: number;
        chance: number;
        name?: string;
        icon?: string;
      }[]
    >
  > {
    const normalizedQuestTypes = Array.from(
      new Set((questTypes ?? []).filter((questType) => typeof questType === 'string' && questType.trim())),
    );
    if (normalizedQuestTypes.length === 0) return {};

    const rewards = await this.dailyQuestRewardModel
      .find({ questType: { $in: normalizedQuestTypes }, isActive: true })
      .sort({ questType: 1, sortOrder: 1 })
      .lean()
      .exec();
    const items = await this.gameItemsService.findAllActive();
    const itemMetaById = new Map(
      items.map((item) => [
        item.id,
        {
          name: item.name,
          icon: item.icon ?? undefined,
        },
      ]),
    );

    return rewards.reduce(
      (acc, reward) => {
        const itemMeta = itemMetaById.get(reward.itemId);
        if (!acc[reward.questType]) acc[reward.questType] = [];
        acc[reward.questType].push({
          itemId: reward.itemId,
          countMin: reward.countMin,
          countMax: reward.countMax,
          chance: reward.chance ?? 1,
          name: itemMeta?.name,
          icon: itemMeta?.icon,
        });
        return acc;
      },
      {} as Record<
        string,
        {
          itemId: string;
          countMin: number;
          countMax: number;
          chance: number;
          name?: string;
          icon?: string;
        }[]
      >,
    );
  }
}
