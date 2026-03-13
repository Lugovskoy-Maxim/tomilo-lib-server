import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { GameItemsService } from './game-items.service';
import {
  ReadingDropRule,
  ReadingDropRuleDocument,
} from '../schemas/reading-drop-rule.schema';
import {
  DailyQuestItemReward,
  DailyQuestItemRewardDocument,
} from '../schemas/daily-quest-item-reward.schema';
import {
  LeaderboardReward,
  LeaderboardRewardDocument,
} from '../schemas/leaderboard-reward.schema';
import {
  DisciplesConfig,
  DisciplesConfigDocument,
} from '../schemas/disciples-config.schema';
import {
  AlchemyRecipe,
  AlchemyRecipeDocument,
} from '../schemas/alchemy-recipe.schema';
import {
  WheelConfig,
  WheelConfigDocument,
} from '../schemas/wheel-config.schema';

@Injectable()
export class GameItemsAdminService {
  constructor(
    private gameItemsService: GameItemsService,
    @InjectModel(ReadingDropRule.name)
    private readingDropRuleModel: Model<ReadingDropRuleDocument>,
    @InjectModel(DailyQuestItemReward.name)
    private dailyQuestRewardModel: Model<DailyQuestItemRewardDocument>,
    @InjectModel(LeaderboardReward.name)
    private leaderboardRewardModel: Model<LeaderboardRewardDocument>,
    @InjectModel(DisciplesConfig.name)
    private disciplesConfigModel: Model<DisciplesConfigDocument>,
    @InjectModel(AlchemyRecipe.name)
    private recipeModel: Model<AlchemyRecipeDocument>,
    @InjectModel(WheelConfig.name)
    private wheelConfigModel: Model<WheelConfigDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  async grantItem(
    userId: string,
    itemId: string,
    count: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for audit
    _adminId?: string,
  ) {
    const inventory = await this.gameItemsService.addToInventory(
      userId,
      itemId,
      count,
    );
    return { userId, itemId, count, inventory };
  }

  async findAllReadingDrops() {
    const list = await this.readingDropRuleModel
      .find({})
      .sort({ itemId: 1 })
      .lean()
      .exec();
    return { rules: list };
  }

  async createReadingDrop(body: {
    itemId: string;
    chance: number;
    minChaptersToday?: number;
    maxDropsPerDay: number;
    isActive?: boolean;
  }) {
    const doc = await this.readingDropRuleModel.create({
      itemId: body.itemId,
      chance: body.chance,
      minChaptersToday: body.minChaptersToday ?? 1,
      maxDropsPerDay: body.maxDropsPerDay,
      isActive: body.isActive ?? true,
    });
    return doc.toObject();
  }

  async updateReadingDrop(
    id: string,
    body: Partial<{
      itemId: string;
      chance: number;
      minChaptersToday: number;
      maxDropsPerDay: number;
      isActive: boolean;
    }>,
  ) {
    const doc = await this.readingDropRuleModel
      .findByIdAndUpdate(new Types.ObjectId(id), { $set: body }, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Reading drop rule not found');
    return doc;
  }

  async deleteReadingDrop(id: string) {
    const doc = await this.readingDropRuleModel
      .findByIdAndDelete(new Types.ObjectId(id))
      .exec();
    if (!doc) throw new NotFoundException('Reading drop rule not found');
    return { message: 'Deleted' };
  }

  async findAllDailyQuestRewards() {
    const list = await this.dailyQuestRewardModel
      .find({})
      .sort({ questType: 1, sortOrder: 1 })
      .lean()
      .exec();
    return { rewards: list };
  }

  async createDailyQuestReward(body: {
    questType: string;
    itemId: string;
    countMin: number;
    countMax: number;
    chance?: number;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const doc = await this.dailyQuestRewardModel.create({
      questType: body.questType,
      itemId: body.itemId,
      countMin: body.countMin,
      countMax: body.countMax,
      chance: body.chance ?? 1,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    });
    return doc.toObject();
  }

  async updateDailyQuestReward(
    id: string,
    body: Partial<{
      questType: string;
      itemId: string;
      countMin: number;
      countMax: number;
      chance: number;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    const doc = await this.dailyQuestRewardModel
      .findByIdAndUpdate(new Types.ObjectId(id), { $set: body }, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Daily quest reward not found');
    return doc;
  }

  async deleteDailyQuestReward(id: string) {
    const doc = await this.dailyQuestRewardModel
      .findByIdAndDelete(new Types.ObjectId(id))
      .exec();
    if (!doc) throw new NotFoundException('Daily quest reward not found');
    return { message: 'Deleted' };
  }

  async findAllLeaderboardRewards(params: {
    category?: string;
    period?: string;
  }) {
    const filter: Record<string, unknown> = {};
    if (params.category) filter.category = params.category;
    if (params.period) filter.period = params.period;
    const list = await this.leaderboardRewardModel
      .find(filter)
      .sort({ category: 1, period: 1, rankMin: 1 })
      .lean()
      .exec();
    return { rewards: list };
  }

  async createLeaderboardReward(body: {
    category: string;
    period: string;
    rankMin: number;
    rankMax: number;
    itemId?: string;
    itemCount?: number;
    coins?: number;
    isActive?: boolean;
  }) {
    const doc = await this.leaderboardRewardModel.create({
      category: body.category,
      period: body.period,
      rankMin: body.rankMin,
      rankMax: body.rankMax,
      itemId: body.itemId,
      itemCount: body.itemCount ?? 0,
      coins: body.coins ?? 0,
      isActive: body.isActive ?? true,
    });
    return doc.toObject();
  }

  async updateLeaderboardReward(
    id: string,
    body: Partial<{
      category: string;
      period: string;
      rankMin: number;
      rankMax: number;
      itemId: string;
      itemCount: number;
      coins: number;
      isActive: boolean;
    }>,
  ) {
    const doc = await this.leaderboardRewardModel
      .findByIdAndUpdate(new Types.ObjectId(id), { $set: body }, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Leaderboard reward not found');
    return doc;
  }

  async deleteLeaderboardReward(id: string) {
    const doc = await this.leaderboardRewardModel
      .findByIdAndDelete(new Types.ObjectId(id))
      .exec();
    if (!doc) throw new NotFoundException('Leaderboard reward not found');
    return { message: 'Deleted' };
  }

  async getDisciplesConfig() {
    let config = await this.disciplesConfigModel
      .findOne({ id: 'default' })
      .lean()
      .exec();
    if (!config) {
      await this.disciplesConfigModel.create({
        id: 'default',
        rerollCostCoins: 50,
        trainCostCoins: 15,
        maxDisciples: 3,
        maxBattlesPerDay: 5,
      });
      config = (await this.disciplesConfigModel
        .findOne({ id: 'default' })
        .lean()
        .exec()) as any;
    }
    return config;
  }

  async updateDisciplesConfig(body: any) {
    const doc = await this.disciplesConfigModel
      .findOneAndUpdate(
        { id: 'default' },
        { $set: body },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return doc;
  }

  async findAllRecipes() {
    const list = await this.recipeModel
      .find({})
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();
    return { recipes: list };
  }

  async getRecipe(id: string) {
    const doc = await this.recipeModel
      .findById(new Types.ObjectId(id))
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Recipe not found');
    return doc;
  }

  async createRecipe(body: {
    name: string;
    description?: string;
    icon?: string;
    coinCost?: number;
    ingredients: { itemId: string; count: number }[];
    resultType?: string;
    qualityWeights?: { common: number; quality: number; legendary: number };
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const doc = await this.recipeModel.create({
      name: body.name,
      description: body.description ?? '',
      icon: body.icon ?? '',
      coinCost: body.coinCost ?? 0,
      ingredients: body.ingredients ?? [],
      resultType: body.resultType ?? 'pill_common',
      qualityWeights: body.qualityWeights ?? {
        common: 70,
        quality: 25,
        legendary: 5,
      },
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    });
    return doc.toObject();
  }

  async updateRecipe(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      icon: string;
      coinCost: number;
      ingredients: { itemId: string; count: number }[];
      resultType: string;
      qualityWeights: { common: number; quality: number; legendary: number };
      isActive: boolean;
      sortOrder: number;
    }>,
  ) {
    const doc = await this.recipeModel
      .findByIdAndUpdate(new Types.ObjectId(id), { $set: body }, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Recipe not found');
    return doc;
  }

  async deleteRecipe(id: string) {
    const doc = await this.recipeModel
      .findByIdAndUpdate(
        new Types.ObjectId(id),
        { $set: { isActive: false } },
        { new: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('Recipe not found');
    return { message: 'Recipe deactivated' };
  }

  async getWheelConfig() {
    let config = await this.wheelConfigModel
      .findOne({ id: 'default' })
      .lean()
      .exec();
    if (!config) {
      await this.wheelConfigModel.create({
        id: 'default',
        spinCostCoins: 20,
        segments: [
          { rewardType: 'coins', weight: 40, param: 5, label: '5 монет' },
          { rewardType: 'coins', weight: 30, param: 10, label: '10 монет' },
          { rewardType: 'xp', weight: 20, param: 5, label: '5 XP' },
          { rewardType: 'empty', weight: 10, label: 'Пусто' },
        ],
      });
      config = (await this.wheelConfigModel
        .findOne({ id: 'default' })
        .lean()
        .exec()) as any;
    }
    return config;
  }

  async updateWheelConfig(body: { spinCostCoins?: number; segments?: any[] }) {
    const update: any = {};
    if (body.spinCostCoins !== undefined)
      update.spinCostCoins = body.spinCostCoins;
    if (body.segments !== undefined) {
      if (!Array.isArray(body.segments) || body.segments.length === 0) {
        throw new BadRequestException(
          'Wheel config must contain at least one segment',
        );
      }
      update.segments = body.segments.map((segment, index) => {
        const rewardType = String(segment?.rewardType ?? '').trim();
        const label = String(segment?.label ?? '').trim();
        const weight = Number(segment?.weight ?? 0);
        if (
          !['xp', 'coins', 'item', 'element_bonus', 'empty'].includes(rewardType)
        ) {
          throw new BadRequestException(
            `Wheel segment #${index + 1}: invalid rewardType`,
          );
        }
        if (!label) {
          throw new BadRequestException(
            `Wheel segment #${index + 1}: label is required`,
          );
        }
        if (!Number.isFinite(weight) || weight <= 0) {
          throw new BadRequestException(
            `Wheel segment #${index + 1}: weight must be greater than 0`,
          );
        }

        if (rewardType === 'item') {
          const itemId = String(segment?.param?.itemId ?? '').trim();
          const count = Number(segment?.param?.count ?? 0);
          if (!itemId) {
            throw new BadRequestException(
              `Wheel segment #${index + 1}: itemId is required`,
            );
          }
          if (!Number.isFinite(count) || count <= 0) {
            throw new BadRequestException(
              `Wheel segment #${index + 1}: item count must be greater than 0`,
            );
          }
          return {
            rewardType,
            label,
            weight,
            param: {
              itemId,
              count,
            },
          };
        }

        if (rewardType === 'empty') {
          return {
            rewardType,
            label,
            weight,
          };
        }

        const param = Number(segment?.param ?? 0);
        if (!Number.isFinite(param) || param < 0) {
          throw new BadRequestException(
            `Wheel segment #${index + 1}: reward value must be 0 or higher`,
          );
        }

        return {
          rewardType,
          label,
          weight,
          param,
        };
      });
    }
    const doc = await this.wheelConfigModel
      .findOneAndUpdate(
        { id: 'default' },
        { $set: update },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return doc;
  }

  /** Получить игровые данные пользователя (инвентарь с именами, достижения, ученики) для админки. */
  async getUserGameData(userId: string) {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .populate([
        {
          path: 'disciples.characterId',
          model: 'Character',
          select: 'name avatar',
        },
        { path: 'disciples.titleId', model: 'Title', select: 'name' },
      ])
      .select('inventory achievements disciples combatRating element')
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');

    const itemIds = [
      ...new Set(
        (user.inventory ?? []).map((e: { itemId: string }) => e.itemId),
      ),
    ];
    const itemsMap = new Map<string, any>();
    for (const id of itemIds) {
      const item = await this.gameItemsService.findById(id);
      if (item) itemsMap.set(id, item);
    }

    const inventory = (user.inventory ?? []).map((e: any) => ({
      itemId: e.itemId,
      count: e.count,
      name: itemsMap.get(e.itemId)?.name ?? e.itemId,
      icon: itemsMap.get(e.itemId)?.icon,
    }));

    return {
      userId,
      inventory,
      achievements: user.achievements ?? [],
      disciples: (user.disciples ?? []).map((d: any) => ({
        characterId: d.characterId?._id?.toString(),
        titleId: d.titleId?._id?.toString(),
        name: d.characterId?.name,
        avatar: d.characterId?.avatar,
        titleName: d.titleId?.name,
        attack: d.attack,
        defense: d.defense,
        speed: d.speed,
        hp: d.hp,
      })),
      combatRating: user.combatRating ?? 0,
      element: user.element ?? null,
    };
  }

  /** Установить инвентарь пользователя (полная замена). */
  async setUserInventory(
    userId: string,
    items: { itemId: string; count: number }[],
  ) {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    user.inventory = items.filter((e) => e.count > 0);
    user.markModified('inventory');
    await user.save();
    return { userId, inventory: user.inventory };
  }
}
