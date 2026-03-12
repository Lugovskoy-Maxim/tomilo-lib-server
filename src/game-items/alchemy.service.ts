import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import {
  AlchemyRecipe,
  AlchemyRecipeDocument,
} from '../schemas/alchemy-recipe.schema';
import { GameItemsService } from './game-items.service';

function getStartOfDayUTC(d: Date = new Date()): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

function alchemyExpToNext(level: number): number {
  return 40 + level * 25;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

@Injectable()
export class AlchemyService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(AlchemyRecipe.name)
    private recipeModel: Model<AlchemyRecipeDocument>,
    private gameItemsService: GameItemsService,
  ) {}

  async getRecipes(userId: string): Promise<{
    recipes: Array<{
      _id: string;
      name: string;
      description: string;
      icon: string;
      coinCost: number;
      ingredients: {
        itemId: string;
        count: number;
        name?: string;
        have: number;
      }[];
      resultType: string;
      element?: string | null;
      mishapChancePercent?: number;
      effectiveMishapChancePercent?: number;
      canCraft: boolean;
    }>;
  }> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select(
        'inventory balance element alchemyLevel alchemyExp alchemyAttemptsDate alchemyAttemptsToday alchemyCauldronTier',
      )
      .lean()
      .exec();
    const inventory = new Map<string, number>();
    if (user?.inventory) {
      for (const e of user.inventory) {
        inventory.set(e.itemId, (inventory.get(e.itemId) ?? 0) + e.count);
      }
    }

    const recipes = await this.recipeModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();

    const today = getStartOfDayUTC();
    const attemptsDate = (user as any)?.alchemyAttemptsDate
      ? new Date((user as any).alchemyAttemptsDate)
      : null;
    const attemptsToday =
      attemptsDate &&
      getStartOfDayUTC(attemptsDate).getTime() === today.getTime()
        ? ((user as any)?.alchemyAttemptsToday ?? 0)
        : 0;
    const alchemyLevel = (user as any)?.alchemyLevel ?? 1;
    const cauldronTier = (user as any)?.alchemyCauldronTier ?? 1;
    const userElement = (user as any)?.element ?? null;
    const craftsPerDay = clamp(1 + Math.floor(alchemyLevel / 5), 1, 3);
    const attemptsLeft = Math.max(0, craftsPerDay - attemptsToday);

    const result: Array<{
      _id: string;
      name: string;
      description: string;
      icon: string;
      coinCost: number;
      ingredients: { itemId: string; count: number; have: number }[];
      resultType: string;
      element?: string | null;
      mishapChancePercent?: number;
      effectiveMishapChancePercent?: number;
      canCraft: boolean;
    }> = [];
    for (const r of recipes) {
      const ingredients = (r.ingredients ?? []).map((ing: any) => ({
        itemId: ing.itemId,
        count: ing.count,
        have: inventory.get(ing.itemId) ?? 0,
      }));
      let canCraft = true;
      for (const ing of ingredients) {
        if (ing.have < ing.count) canCraft = false;
      }
      const coinCost = (r as any).coinCost ?? 0;
      if (((user as any)?.balance ?? 0) < coinCost) canCraft = false;
      if (attemptsLeft <= 0) canCraft = false;

      const recipeElement = (r as any).element ?? null;
      const elementBonus =
        recipeElement && userElement && recipeElement === userElement ? 1 : 0;
      const baseMishap = clamp((r as any).mishapChancePercent ?? 8, 0, 95);
      const levelReduce = Math.min(6, Math.floor((alchemyLevel - 1) / 4));
      const elementReduce = elementBonus ? 2 : 0;
      const cauldronReduce = Math.min(6, Math.max(0, (cauldronTier - 1) * 2));
      const effectiveMishapChancePercent = clamp(
        baseMishap - levelReduce - elementReduce - cauldronReduce,
        0,
        95,
      );
      result.push({
        _id: (r as any)._id.toString(),
        name: r.name,
        description: r.description ?? '',
        icon: r.icon ?? '',
        coinCost,
        ingredients,
        resultType: r.resultType ?? 'pill_common',
        element: (r as any).element ?? null,
        mishapChancePercent: baseMishap,
        effectiveMishapChancePercent,
        canCraft,
      });
    }
    return { recipes: result };
  }

  async getStatus(userId: string): Promise<{
    canCraft: boolean;
    lastPillCraftedAt: string | null;
    craftsPerDay: number;
    attemptsToday: number;
    attemptsLeft: number;
    alchemyLevel: number;
    alchemyExp: number;
    alchemyExpToNext: number;
    element: string | null;
    cauldronTier: number;
    stabilizers: { itemId: string; count: number };
    cauldronUpgrade: {
      fragmentItemId: string;
      have: number;
      need: number;
      canUpgrade: boolean;
    };
  }> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select(
        'lastPillCraftedAt alchemyLevel alchemyExp alchemyAttemptsDate alchemyAttemptsToday element inventory alchemyCauldronTier',
      )
      .lean()
      .exec();
    const today = getStartOfDayUTC();
    const attemptsDate = (user as any)?.alchemyAttemptsDate
      ? new Date((user as any).alchemyAttemptsDate)
      : null;
    const attemptsToday =
      attemptsDate &&
      getStartOfDayUTC(attemptsDate).getTime() === today.getTime()
        ? ((user as any)?.alchemyAttemptsToday ?? 0)
        : 0;
    const alchemyLevel = (user as any)?.alchemyLevel ?? 1;
    const craftsPerDay = clamp(1 + Math.floor(alchemyLevel / 5), 1, 3);
    const attemptsLeft = Math.max(0, craftsPerDay - attemptsToday);
    const canCraft = attemptsLeft > 0;
    return {
      canCraft,
      lastPillCraftedAt: user?.lastPillCraftedAt
        ? new Date(user.lastPillCraftedAt).toISOString()
        : null,
      craftsPerDay,
      attemptsToday,
      attemptsLeft,
      alchemyLevel,
      alchemyExp: (user as any)?.alchemyExp ?? 0,
      alchemyExpToNext: alchemyExpToNext(alchemyLevel),
      element: (user as any)?.element ?? null,
      cauldronTier: (user as any)?.alchemyCauldronTier ?? 1,
      stabilizers: {
        itemId: 'stabilizing_talisman',
        count: ((user as any)?.inventory ?? []).reduce(
          (sum: number, e: { itemId?: string; count?: number }) =>
            e.itemId === 'stabilizing_talisman'
              ? sum + (Number(e.count) || 0)
              : sum,
          0,
        ),
      },
      cauldronUpgrade: (() => {
        const fragmentItemId = 'mysterious_fragment';
        const have = ((user as any)?.inventory ?? []).reduce(
          (sum: number, e: { itemId?: string; count?: number }) =>
            e.itemId === fragmentItemId ? sum + (Number(e.count) || 0) : sum,
          0,
        );
        const tier = (user as any)?.alchemyCauldronTier ?? 1;
        const need = 3 + tier * 2;
        return {
          fragmentItemId,
          have,
          need,
          canUpgrade: have >= need && tier < 5,
        };
      })(),
    };
  }

  async craft(
    userId: string,
    recipeId: string,
  ): Promise<{
    success: boolean;
    quality: 'common' | 'quality' | 'legendary';
    rewards: { exp?: number; coins?: number };
    itemsGained?: { itemId: string; count: number }[];
    alchemy?: {
      level: number;
      exp: number;
      expToNext: number;
      attemptsLeft: number;
    };
    mishap?: {
      happened: boolean;
      preventedByStabilizer?: boolean;
      chancePercent?: number;
    };
  }> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const recipe = await this.recipeModel
      .findById(new Types.ObjectId(recipeId))
      .lean()
      .exec();
    if (!recipe || !(recipe as any).isActive) {
      throw new NotFoundException('Рецепт не найден');
    }

    const today = getStartOfDayUTC();
    const attemptsDate = user.alchemyAttemptsDate
      ? new Date(user.alchemyAttemptsDate)
      : null;
    const attemptsToday =
      attemptsDate &&
      getStartOfDayUTC(attemptsDate).getTime() === today.getTime()
        ? (user.alchemyAttemptsToday ?? 0)
        : 0;
    const alchemyLevel = user.alchemyLevel ?? 1;
    const cauldronTier = user.alchemyCauldronTier ?? 1;
    const craftsPerDay = clamp(1 + Math.floor(alchemyLevel / 5), 1, 3);
    const attemptsLeft = Math.max(0, craftsPerDay - attemptsToday);
    if (attemptsLeft <= 0) {
      throw new BadRequestException('Сегодня лимит варок исчерпан');
    }

    const coinCost = (recipe as any).coinCost ?? 0;
    if ((user.balance ?? 0) < coinCost) {
      throw new BadRequestException('Недостаточно монет');
    }

    const ingredients = (recipe as any).ingredients ?? [];
    for (const ing of ingredients) {
      const have = (user.inventory ?? []).reduce(
        (sum, e) => (e.itemId === ing.itemId ? sum + e.count : sum),
        0,
      );
      if (have < ing.count) {
        throw new BadRequestException(
          `Недостаточно ингредиентов: ${ing.itemId}`,
        );
      }
    }

    for (const ing of ingredients) {
      await this.gameItemsService.deductFromInventory(
        userId,
        ing.itemId,
        ing.count,
      );
    }
    if (coinCost > 0) {
      user.balance = (user.balance ?? 0) - coinCost;
      user.markModified('balance');
    }

    // Риск провала (механика “взрыва котла”)
    const recipeElement = (recipe as any).element ?? null;
    const userElement = (user as any).element ?? null;
    const elementBonus =
      recipeElement && userElement && recipeElement === userElement ? 1 : 0;
    const baseMishap = clamp((recipe as any).mishapChancePercent ?? 8, 0, 95);
    const levelReduce = Math.min(6, Math.floor((alchemyLevel - 1) / 4)); // уменьшаем риск с ростом мастерства
    const elementReduce = elementBonus ? 2 : 0;
    const cauldronReduce = Math.min(6, Math.max(0, (cauldronTier - 1) * 2));
    const mishapChance = clamp(
      baseMishap - levelReduce - elementReduce - cauldronReduce,
      0,
      95,
    );
    const mishapHappened = Math.random() < mishapChance / 100;

    let preventedByStabilizer = false;
    if (mishapHappened) {
      // Если есть стабилизатор в инвентаре — тратим и спасаем варку
      const stabilizerId = 'stabilizing_talisman';
      const haveStab = (user.inventory ?? []).reduce(
        (sum, e) => (e.itemId === stabilizerId ? sum + e.count : sum),
        0,
      );
      if (haveStab > 0) {
        await this.gameItemsService.deductFromInventory(
          userId,
          stabilizerId,
          1,
        );
        preventedByStabilizer = true;
      } else {
        // Провал: ингредиенты уже списаны, попытка тратится, даём немного мастерства/утешительных наград
        if (
          !attemptsDate ||
          getStartOfDayUTC(attemptsDate).getTime() !== today.getTime()
        ) {
          user.alchemyAttemptsDate = today;
          user.alchemyAttemptsToday = 0;
        }
        user.alchemyAttemptsToday = (user.alchemyAttemptsToday ?? 0) + 1;
        user.lastPillCraftedAt = new Date();

        user.alchemyLevel = user.alchemyLevel ?? 1;
        user.alchemyExp = (user.alchemyExp ?? 0) + 2;
        while (
          (user.alchemyExp ?? 0) >= alchemyExpToNext(user.alchemyLevel ?? 1)
        ) {
          user.alchemyExp =
            (user.alchemyExp ?? 0) - alchemyExpToNext(user.alchemyLevel ?? 1);
          user.alchemyLevel = (user.alchemyLevel ?? 1) + 1;
        }

        const newCraftsPerDay = clamp(
          1 + Math.floor((user.alchemyLevel ?? 1) / 5),
          1,
          3,
        );
        const left = Math.max(
          0,
          newCraftsPerDay - (user.alchemyAttemptsToday ?? 0),
        );

        // утешительные награды
        user.balance = (user.balance ?? 0) + 1;
        user.experience = (user.experience ?? 0) + 1;
        user.markModified('balance');
        user.markModified('experience');
        user.markModified('alchemyAttemptsDate');
        user.markModified('alchemyAttemptsToday');
        user.markModified('alchemyLevel');
        user.markModified('alchemyExp');
        user.markModified('lastPillCraftedAt');
        await user.save();

        return {
          success: false,
          quality: 'common',
          rewards: { exp: 1, coins: 1 },
          itemsGained: [],
          alchemy: {
            level: user.alchemyLevel ?? 1,
            exp: user.alchemyExp ?? 0,
            expToNext: alchemyExpToNext(user.alchemyLevel ?? 1),
            attemptsLeft: left,
          },
          mishap: {
            happened: true,
            preventedByStabilizer: false,
            chancePercent: mishapChance,
          },
        };
      }
    }

    const weights = (recipe as any).qualityWeights ?? {
      common: 70,
      quality: 25,
      legendary: 5,
    };
    // бонусы от стихии и уровня алхимика: легендарность растёт понемногу
    // recipeElement/userElement/elementBonus уже рассчитаны выше
    const cauldronQualityBonus = Math.min(
      8,
      Math.max(0, (cauldronTier - 1) * 2),
    );
    const cauldronLegendaryBonus = Math.min(
      6,
      Math.max(0, (cauldronTier - 1) * 1),
    );
    const legendaryBonus =
      Math.min(10, Math.floor((alchemyLevel - 1) / 3)) +
      (elementBonus ? 3 : 0) +
      cauldronLegendaryBonus;
    const qualityBonus =
      Math.min(15, Math.floor((alchemyLevel - 1) / 2)) +
      (elementBonus ? 5 : 0) +
      cauldronQualityBonus;
    const adjusted = {
      legendary: clamp((weights.legendary ?? 5) + legendaryBonus, 1, 40),
      quality: clamp((weights.quality ?? 25) + qualityBonus, 5, 60),
      common: Math.max(1, weights.common ?? 70),
    };
    // нормализуем common чтобы сумма не улетала
    const sumBase = adjusted.legendary + adjusted.quality + adjusted.common;
    const scale = 100 / (sumBase || 100);
    const scaled = {
      legendary: adjusted.legendary * scale,
      quality: adjusted.quality * scale,
      common: adjusted.common * scale,
    };
    const total = scaled.common + scaled.quality + scaled.legendary;
    const r = Math.random() * (total || 100);
    let quality: 'common' | 'quality' | 'legendary' = 'common';
    if (r < scaled.legendary) quality = 'legendary';
    else if (r < scaled.legendary + scaled.quality) quality = 'quality';

    // выдаём “пилюлю” как предмет в инвентарь (resultType + суффикс качества)
    const itemsGained: { itemId: string; count: number }[] = [];
    const resultBase = (recipe as any).resultType ?? 'pill_common';
    const resultItemId =
      quality === 'legendary'
        ? `${resultBase}_legendary`
        : quality === 'quality'
          ? `${resultBase}_quality`
          : `${resultBase}_common`;
    await this.gameItemsService.addToInventory(userId, resultItemId, 1);
    itemsGained.push({ itemId: resultItemId, count: 1 });

    const rewards: { exp?: number; coins?: number } = {};
    if (quality === 'common') {
      rewards.exp = 5;
      rewards.coins = 3;
    } else if (quality === 'quality') {
      rewards.exp = 15;
      rewards.coins = 10;
    } else {
      rewards.exp = 50;
      rewards.coins = 30;
    }
    user.experience = (user.experience ?? 0) + (rewards.exp ?? 0);
    user.balance = (user.balance ?? 0) + (rewards.coins ?? 0);
    // алхимия: попытка + мастерство
    if (
      !attemptsDate ||
      getStartOfDayUTC(attemptsDate).getTime() !== today.getTime()
    ) {
      user.alchemyAttemptsDate = today;
      user.alchemyAttemptsToday = 0;
    }
    user.alchemyAttemptsToday = (user.alchemyAttemptsToday ?? 0) + 1;
    user.lastPillCraftedAt = new Date();

    const masteryGain =
      quality === 'legendary' ? 18 : quality === 'quality' ? 10 : 6;
    user.alchemyLevel = user.alchemyLevel ?? 1;
    user.alchemyExp = (user.alchemyExp ?? 0) + masteryGain;
    while ((user.alchemyExp ?? 0) >= alchemyExpToNext(user.alchemyLevel ?? 1)) {
      user.alchemyExp =
        (user.alchemyExp ?? 0) - alchemyExpToNext(user.alchemyLevel ?? 1);
      user.alchemyLevel = (user.alchemyLevel ?? 1) + 1;
    }
    user.markModified('experience');
    user.markModified('balance');
    user.markModified('alchemyAttemptsDate');
    user.markModified('alchemyAttemptsToday');
    user.markModified('alchemyLevel');
    user.markModified('alchemyExp');
    user.markModified('lastPillCraftedAt');
    await user.save();

    const newCraftsPerDay = clamp(
      1 + Math.floor((user.alchemyLevel ?? 1) / 5),
      1,
      3,
    );
    const left = Math.max(
      0,
      newCraftsPerDay - (user.alchemyAttemptsToday ?? 0),
    );
    return {
      success: true,
      quality,
      rewards,
      itemsGained,
      alchemy: {
        level: user.alchemyLevel ?? 1,
        exp: user.alchemyExp ?? 0,
        expToNext: alchemyExpToNext(user.alchemyLevel ?? 1),
        attemptsLeft: left,
      },
      mishap: {
        happened: mishapHappened,
        preventedByStabilizer,
        chancePercent: mishapChance,
      },
    };
  }

  async upgradeCauldron(userId: string) {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    user.alchemyCauldronTier = user.alchemyCauldronTier ?? 1;
    if (user.alchemyCauldronTier >= 5)
      throw new BadRequestException('Котёл уже максимального уровня');
    const tier = user.alchemyCauldronTier;
    const fragmentItemId = 'mysterious_fragment';
    const need = 3 + tier * 2;

    const have = (user.inventory ?? []).reduce(
      (sum, e) => (e.itemId === fragmentItemId ? sum + e.count : sum),
      0,
    );
    if (have < need) throw new BadRequestException('Недостаточно фрагментов');
    await this.gameItemsService.deductFromInventory(
      userId,
      fragmentItemId,
      need,
    );

    user.alchemyCauldronTier = tier + 1;
    user.markModified('alchemyCauldronTier');
    await user.save();
    return { ok: true, tier: user.alchemyCauldronTier };
  }
}
