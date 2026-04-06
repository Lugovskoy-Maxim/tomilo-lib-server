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

  private readonly ALCHEMY_MATERIALS = [
    'spirit_grass',
    'hundred_year_herb',
    'beast_core_low',
    'spirit_stone_fragment',
    'iron_ore',
    'wolf_king_core',
    'thousand_year_ginseng',
    'phoenix_feather',
  ];

  private async ensureDefaultRecipes(): Promise<void> {
    const count = await this.recipeModel.countDocuments({}).exec();
    if (count > 0) return;

    const defaults: Array<{
      name: string;
      description: string;
      icon: string;
      coinCost: number;
      ingredients: { itemId: string; count: number }[];
      resultType: string;
      element?: 'fire' | 'water' | 'earth' | 'wood' | 'metal' | null;
      qualityWeights: { common: number; quality: number; legendary: number };
      mishapChancePercent: number;
      isActive: boolean;
      sortOrder: number;
    }> = [
      {
        name: 'Пилюля ци (базовая)',
        description: 'Простая пилюля из духовной травы. Восстанавливает ци.',
        icon: '',
        coinCost: 5,
        ingredients: [{ itemId: 'spirit_grass', count: 2 }],
        resultType: 'pill_common',
        element: null,
        qualityWeights: { common: 75, quality: 20, legendary: 5 },
        mishapChancePercent: 5,
        isActive: true,
        sortOrder: 0,
      },
      {
        name: 'Пилюля исцеления',
        description: 'Травяной отвар для заживления ран.',
        icon: '',
        coinCost: 15,
        ingredients: [
          { itemId: 'spirit_grass', count: 3 },
          { itemId: 'hundred_year_herb', count: 1 },
        ],
        resultType: 'pill_healing',
        element: 'wood',
        qualityWeights: { common: 70, quality: 25, legendary: 5 },
        mishapChancePercent: 10,
        isActive: true,
        sortOrder: 1,
      },
      {
        name: 'Пилюля восстановления ци',
        description: 'Быстро восполняет духовную силу.',
        icon: '',
        coinCost: 12,
        ingredients: [
          { itemId: 'spirit_grass', count: 2 },
          { itemId: 'spirit_stone_fragment', count: 1 },
        ],
        resultType: 'pill_energy',
        element: 'water',
        qualityWeights: { common: 72, quality: 23, legendary: 5 },
        mishapChancePercent: 8,
        isActive: true,
        sortOrder: 2,
      },
      {
        name: 'Пилюля сгущения ци',
        description: 'Помогает уплотнить ци в даньтяне.',
        icon: '',
        coinCost: 25,
        ingredients: [
          { itemId: 'hundred_year_herb', count: 2 },
          { itemId: 'beast_core_low', count: 1 },
          { itemId: 'spirit_stone_fragment', count: 1 },
        ],
        resultType: 'pill_condensation',
        element: 'earth',
        qualityWeights: { common: 65, quality: 28, legendary: 7 },
        mishapChancePercent: 15,
        isActive: true,
        sortOrder: 3,
      },
      {
        name: 'Отвар закалки тела',
        description: 'Укрепляет плоть и кости.',
        icon: '',
        coinCost: 30,
        ingredients: [
          { itemId: 'iron_ore', count: 2 },
          { itemId: 'beast_core_low', count: 2 },
          { itemId: 'hundred_year_herb', count: 1 },
        ],
        resultType: 'pill_tempering',
        element: 'metal',
        qualityWeights: { common: 68, quality: 26, legendary: 6 },
        mishapChancePercent: 18,
        isActive: true,
        sortOrder: 4,
      },
      {
        name: 'Пилюля прорыва',
        description: 'Увеличивает шанс прорыва в следующий слой.',
        icon: '',
        coinCost: 50,
        ingredients: [
          { itemId: 'thousand_year_ginseng', count: 1 },
          { itemId: 'wolf_king_core', count: 1 },
          { itemId: 'hundred_year_herb', count: 2 },
          { itemId: 'spirit_stone_fragment', count: 2 },
        ],
        resultType: 'pill_breakthrough',
        element: 'fire',
        qualityWeights: { common: 60, quality: 30, legendary: 10 },
        mishapChancePercent: 25,
        isActive: true,
        sortOrder: 5,
      },
      {
        name: 'Укрепляющая пилюля',
        description: 'Базовая поддержка организма духом зверя.',
        icon: '',
        coinCost: 20,
        ingredients: [
          { itemId: 'beast_core_low', count: 2 },
          { itemId: 'spirit_grass', count: 2 },
        ],
        resultType: 'pill_common',
        element: null,
        qualityWeights: { common: 74, quality: 21, legendary: 5 },
        mishapChancePercent: 12,
        isActive: true,
        sortOrder: 6,
      },
      {
        name: 'Духовный эликсир',
        description: 'Смесь камня и травы для усиления восприятия ци.',
        icon: '',
        coinCost: 35,
        ingredients: [
          { itemId: 'spirit_stone_fragment', count: 2 },
          { itemId: 'hundred_year_herb', count: 2 },
          { itemId: 'wolf_king_core', count: 1 },
        ],
        resultType: 'pill_condensation',
        element: null,
        qualityWeights: { common: 66, quality: 28, legendary: 6 },
        mishapChancePercent: 20,
        isActive: true,
        sortOrder: 7,
      },
      {
        name: 'Пилюля ядра зверя',
        description: 'Концентрированная сила зверя в пилюле.',
        icon: '',
        coinCost: 40,
        ingredients: [
          { itemId: 'wolf_king_core', count: 2 },
          { itemId: 'beast_core_low', count: 2 },
          { itemId: 'hundred_year_herb', count: 1 },
        ],
        resultType: 'pill_tempering',
        element: null,
        qualityWeights: { common: 64, quality: 29, legendary: 7 },
        mishapChancePercent: 22,
        isActive: true,
        sortOrder: 8,
      },
      {
        name: 'Высшая пилюля ци',
        description: 'Мощная пилюля с женьшенем и пером феникса.',
        icon: '',
        coinCost: 80,
        ingredients: [
          { itemId: 'thousand_year_ginseng', count: 1 },
          { itemId: 'phoenix_feather', count: 1 },
          { itemId: 'wolf_king_core', count: 1 },
          { itemId: 'spirit_stone_fragment', count: 2 },
        ],
        resultType: 'pill_breakthrough',
        element: null,
        qualityWeights: { common: 55, quality: 32, legendary: 13 },
        mishapChancePercent: 30,
        isActive: true,
        sortOrder: 9,
      },
    ];
    await this.recipeModel.insertMany(defaults);
  }

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
        icon?: string;
        have: number;
      }[];
      resultType: string;
      resultPreview?: {
        common?: { itemId: string; name?: string; icon?: string };
        quality?: { itemId: string; name?: string; icon?: string };
        legendary?: { itemId: string; name?: string; icon?: string };
      };
      element?: string | null;
      mishapChancePercent?: number;
      effectiveMishapChancePercent?: number;
      canCraft: boolean;
    }>;
  }> {
    await this.gameItemsService.ensureDefaultAlchemyMaterials();
    await this.gameItemsService.ensureDefaultAlchemyResultItems();
    await this.ensureDefaultRecipes();

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
    const allItems = await this.gameItemsService.findAllActive();
    const itemMetaById = new Map(
      allItems.map((item) => [
        item.id,
        { name: item.name, icon: item.icon ?? undefined },
      ]),
    );

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
      ingredients: {
        itemId: string;
        count: number;
        have: number;
        name?: string;
        icon?: string;
      }[];
      resultType: string;
      resultPreview?: {
        common?: { itemId: string; name?: string; icon?: string };
        quality?: { itemId: string; name?: string; icon?: string };
        legendary?: { itemId: string; name?: string; icon?: string };
      };
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
        name: itemMetaById.get(ing.itemId)?.name,
        icon: itemMetaById.get(ing.itemId)?.icon,
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
      const resultBase = r.resultType ?? 'pill_common';
      result.push({
        _id: (r as any)._id.toString(),
        name: r.name,
        description: r.description ?? '',
        icon: r.icon ?? '',
        coinCost,
        ingredients,
        resultType: resultBase,
        resultPreview: {
          common: {
            itemId: `${resultBase}_common`,
            name: itemMetaById.get(`${resultBase}_common`)?.name,
            icon: itemMetaById.get(`${resultBase}_common`)?.icon,
          },
          quality: {
            itemId: `${resultBase}_quality`,
            name: itemMetaById.get(`${resultBase}_quality`)?.name,
            icon: itemMetaById.get(`${resultBase}_quality`)?.icon,
          },
          legendary: {
            itemId: `${resultBase}_legendary`,
            name: itemMetaById.get(`${resultBase}_legendary`)?.name,
            icon: itemMetaById.get(`${resultBase}_legendary`)?.icon,
          },
        },
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
    serverNow: string;
    resetAt: string;
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
      serverNow: new Date().toISOString(),
      resetAt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
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
    itemsGained?: {
      itemId: string;
      count: number;
      name?: string;
      icon?: string;
    }[];
    balance?: number;
    rewardSummary?: {
      type: 'coins' | 'exp' | 'item';
      label: string;
      amount?: number;
      icon?: string;
    }[];
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
          balance: user.balance ?? 0,
          rewardSummary: [
            { type: 'exp', label: 'Опыт алхимии', amount: 1 },
            { type: 'coins', label: 'Монеты', amount: 1 },
          ],
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
    const itemsGained: {
      itemId: string;
      count: number;
      name?: string;
      icon?: string;
    }[] = [];
    const resultBase = (recipe as any).resultType ?? 'pill_common';
    const resultItemId =
      quality === 'legendary'
        ? `${resultBase}_legendary`
        : quality === 'quality'
          ? `${resultBase}_quality`
          : `${resultBase}_common`;
    await this.gameItemsService.addToInventory(userId, resultItemId, 1);
    const resultItem = await this.gameItemsService.findById(resultItemId);
    itemsGained.push({
      itemId: resultItemId,
      count: 1,
      name: resultItem?.name,
      icon: resultItem?.icon || undefined,
    });

    const baseRewards =
      quality === 'legendary'
        ? { exp: 50, coins: 30 }
        : quality === 'quality'
          ? { exp: 15, coins: 10 }
          : { exp: 5, coins: 3 };
    const resultMultiplier =
      resultBase === 'pill_breakthrough'
        ? 1.5
        : resultBase === 'pill_tempering' || resultBase === 'pill_condensation'
          ? 1.2
          : resultBase === 'pill_healing' || resultBase === 'pill_energy'
            ? 1.1
            : 1;
    const rewards: { exp?: number; coins?: number } = {
      exp: Math.max(1, Math.round(baseRewards.exp * resultMultiplier)),
      coins: Math.max(1, Math.round(baseRewards.coins * resultMultiplier)),
    };
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
      balance: user.balance ?? 0,
      rewardSummary: [
        ...(rewards.coins
          ? [{ type: 'coins' as const, label: 'Монеты', amount: rewards.coins }]
          : []),
        ...(rewards.exp
          ? [{ type: 'exp' as const, label: 'Опыт', amount: rewards.exp }]
          : []),
        ...itemsGained.map((item) => ({
          type: 'item' as const,
          label: item.name ?? item.itemId,
          amount: item.count,
          icon: item.icon,
        })),
      ],
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

  /**
   * Генерирует случайный ассортимент для лавки алхимии (3-5 товаров).
   * Каждый товар — материал из ALCHEMY_MATERIALS с количеством 1-3 и ценой 10-50 монет.
   * Также добавляет возможность прямой покупки (isDirectPurchase = false по умолчанию).
   */
  private generateShopAssortment(): Array<{
    itemId: string;
    count: number;
    priceCoins: number;
    purchased: boolean;
    isDirectPurchase: boolean;
  }> {
    const count = Math.floor(Math.random() * 3) + 3; // 3-5 товаров
    const assortment: Array<{
      itemId: string;
      count: number;
      priceCoins: number;
      purchased: boolean;
      isDirectPurchase: boolean;
    }> = [];
    const materials = [...this.ALCHEMY_MATERIALS];
    // перемешиваем
    for (let i = materials.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [materials[i], materials[j]] = [materials[j], materials[i]];
    }
    for (let i = 0; i < count; i++) {
      const itemId = materials[i % materials.length];
      const count = Math.floor(Math.random() * 3) + 1; // 1-3
      const priceCoins = Math.floor(Math.random() * 41) + 10; // 10-50
      assortment.push({
        itemId,
        count,
        priceCoins,
        purchased: false,
        isDirectPurchase: false,
      });
    }
    return assortment;
  }

  /**
   * Получить текущий ассортимент лавки алхимии для пользователя.
   * Если ассортимент устарел (alchemyShopDate не сегодня) или отсутствует — генерируется новый.
   */
  async getAlchemyShop(userId: string): Promise<{
    assortment: Array<{
      itemId: string;
      count: number;
      priceCoins: number;
      purchased: boolean;
      isDirectPurchase: boolean;
      name?: string;
      icon?: string;
    }>;
    shopDate: string;
    canRefresh: boolean;
    refreshCost: number;
  }> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const today = getStartOfDayUTC();
    const shopDate = user.alchemyShopDate
      ? new Date(user.alchemyShopDate)
      : null;
    const isOutdated =
      !shopDate || getStartOfDayUTC(shopDate).getTime() !== today.getTime();

    if (
      isOutdated ||
      !user.alchemyShopAssortment ||
      user.alchemyShopAssortment.length === 0
    ) {
      // генерируем новый ассортимент
      user.alchemyShopAssortment = this.generateShopAssortment();
      user.alchemyShopDate = today;
      user.markModified('alchemyShopAssortment');
      user.markModified('alchemyShopDate');
      await user.save();
    }

    // обогащаем метаданными предметов
    const allItems = await this.gameItemsService.findAllActive();
    const itemMetaById = new Map(
      allItems.map((item) => [
        item.id,
        { name: item.name, icon: item.icon ?? undefined },
      ]),
    );

    const enriched = (user.alchemyShopAssortment ?? []).map((entry) => ({
      ...entry,
      name: itemMetaById.get(entry.itemId)?.name,
      icon: itemMetaById.get(entry.itemId)?.icon,
    }));

    return {
      assortment: enriched,
      shopDate: (user.alchemyShopDate ?? today).toISOString(),
      canRefresh: true,
      refreshCost: 50, // стоимость обновления ассортимента
    };
  }

  /**
   * Принудительно обновить ассортимент лавки за монеты.
   */
  async refreshAlchemyShop(userId: string): Promise<{
    ok: boolean;
    newAssortment: Array<{
      itemId: string;
      count: number;
      priceCoins: number;
      purchased: boolean;
      isDirectPurchase: boolean;
      name?: string;
      icon?: string;
    }>;
    balance: number;
  }> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const refreshCost = 50;
    if ((user.balance ?? 0) < refreshCost) {
      throw new BadRequestException('Недостаточно монет для обновления');
    }

    user.balance = (user.balance ?? 0) - refreshCost;
    user.alchemyShopAssortment = this.generateShopAssortment();
    user.alchemyShopDate = new Date();
    user.markModified('balance');
    user.markModified('alchemyShopAssortment');
    user.markModified('alchemyShopDate');
    await user.save();

    // обогащаем метаданными
    const allItems = await this.gameItemsService.findAllActive();
    const itemMetaById = new Map(
      allItems.map((item) => [
        item.id,
        { name: item.name, icon: item.icon ?? undefined },
      ]),
    );

    const enriched = (user.alchemyShopAssortment ?? []).map((entry) => ({
      ...entry,
      name: itemMetaById.get(entry.itemId)?.name,
      icon: itemMetaById.get(entry.itemId)?.icon,
    }));

    return {
      ok: true,
      newAssortment: enriched,
      balance: user.balance ?? 0,
    };
  }

  /**
   * Купить товар из лавки алхимии.
   * Если isDirectPurchase = true, цена увеличивается в 5 раз.
   * @param index индекс товара в массиве assortment (0-based)
   * @param directPurchase если true, покупает напрямую за 5x цену (без роллов)
   */
  async buyAlchemyItem(
    userId: string,
    index: number,
    directPurchase: boolean = false,
  ): Promise<{
    ok: boolean;
    itemId: string;
    count: number;
    pricePaid: number;
    balance: number;
    purchased: boolean;
  }> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const assortment = user.alchemyShopAssortment ?? [];
    if (index < 0 || index >= assortment.length) {
      throw new BadRequestException('Неверный индекс товара');
    }
    const entry = assortment[index];
    if (entry.purchased) {
      throw new BadRequestException('Товар уже куплен');
    }

    let price = entry.priceCoins;
    if (directPurchase) {
      price = entry.priceCoins * 5;
      // помечаем как купленный напрямую
      entry.isDirectPurchase = true;
    }

    if ((user.balance ?? 0) < price) {
      throw new BadRequestException('Недостаточно монет');
    }

    // списываем монеты
    user.balance = (user.balance ?? 0) - price;
    // добавляем предмет в инвентарь
    await this.gameItemsService.addToInventory(
      userId,
      entry.itemId,
      entry.count,
    );
    // помечаем как купленный
    entry.purchased = true;
    user.markModified('balance');
    user.markModified('alchemyShopAssortment');
    await user.save();

    return {
      ok: true,
      itemId: entry.itemId,
      count: entry.count,
      pricePaid: price,
      balance: user.balance ?? 0,
      purchased: true,
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
