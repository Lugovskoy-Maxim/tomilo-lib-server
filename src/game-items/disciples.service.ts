import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import {
  Character,
  CharacterDocument,
  CharacterModerationStatus,
  CharacterRole,
} from '../schemas/character.schema';
import {
  CharacterCard,
  CharacterCardDocument,
} from '../schemas/character-card.schema';
import {
  DisciplesConfig,
  DisciplesConfigDocument,
} from '../schemas/disciples-config.schema';
import { Technique, TechniqueDocument } from '../schemas/technique.schema';
import { GameItemsService } from './game-items.service';
import { CardsService } from './cards.service';

function getStartOfDayUTC(d: Date = new Date()): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Опыт до следующего уровня ученика: плавный рост, без «лестницы» на низких уровнях */
function expToNextLevel(level: number): number {
  const L = Math.max(1, level);
  return Math.max(32, Math.floor(36 + L * 22 + L * L * 0.14));
}

function libraryExpToNext(level: number): number {
  const L = Math.max(1, level);
  return Math.max(28, Math.floor(32 + L * 20 + L * L * 0.1));
}

/** Разброс atk/def/spd/hp вокруг базы при призыве ученика */
const RECRUIT_STAT_SPREAD = 5;
/** Доп. к базовому уровню статов для персонажей с ролью «главный герой» */
const RECRUIT_MAIN_CORE_BONUS = 3;
/** Доп. к середине HP при призыве главного героя */
const RECRUIT_MAIN_HP_BONUS = 5;

/** Ровно столько активных учеников — проверяем отрядные бафы в бою */
const SQUAD_SYNERGY_ROSTER_SIZE = 3;

/** Все трое из одного тайтла: ровный бонус ко всем боевым суммарным статам */
const SYNERGY_SAME_TITLE = {
  attack: 1.06,
  defense: 1.06,
  speed: 1.06,
  hp: 1.06,
} as const;

/** Все трое с ролью «антагонист»: упор на атаку и скорость */
const SYNERGY_ALL_ANTAGONIST = {
  attack: 1.1,
  defense: 1.04,
  speed: 1.08,
  hp: 1.03,
} as const;

/** Все трое с ролью «главный герой»: сбалансированно + запас ОЗ */
const SYNERGY_ALL_MAIN = {
  attack: 1.05,
  defense: 1.05,
  speed: 1.05,
  hp: 1.08,
} as const;

/** Доля опыта основного ученика при тренировке (остальное делится между всеми остальными) */
const TRAINING_PRIMARY_EXP_SHARE = 0.42;
/** Доля опыта основного в вылазках, боях, колесе */
const GAME_PRIMARY_EXP_SHARE = 0.55;

type DiscipleGameShopOffer =
  | {
      offerId: string;
      label: string;
      priceCoins: number;
      kind: 'item';
      itemId: string;
      count: number;
    }
  | {
      offerId: string;
      label: string;
      priceCoins: number;
      kind: 'library_exp';
      libraryExp: number;
    };

type Disciple = {
  characterId: Types.ObjectId;
  titleId: Types.ObjectId;
  recruitedAt: Date;
  attack: number;
  defense: number;
  speed: number;
  hp: number;
  level?: number;
  exp?: number;
  rank?: string;
  techniquesLearned?: string[];
  techniquesEquipped?: string[];
  inWarehouse?: boolean;
};

const DISCIPLE_GAME_SHOP_OFFERS: DiscipleGameShopOffer[] = [
  {
    offerId: 'stabilizer_2',
    kind: 'item',
    label: 'Стабилизаторы алхимии ×2',
    itemId: 'stabilizing_talisman',
    count: 2,
    priceCoins: 70,
  },
  {
    offerId: 'fragment_2',
    kind: 'item',
    label: 'Загадочные осколки ×2',
    itemId: 'mysterious_fragment',
    count: 2,
    priceCoins: 100,
  },
  {
    offerId: 'healing_pill_4',
    kind: 'item',
    label: 'Пилюли исцеления ×4',
    itemId: 'healing_pill',
    count: 4,
    priceCoins: 55,
  },
  {
    offerId: 'basic_talisman_2',
    kind: 'item',
    label: 'Базовые талисманы ×2',
    itemId: 'basic_talisman',
    count: 2,
    priceCoins: 48,
  },
  {
    offerId: 'defense_talisman_1',
    kind: 'item',
    label: 'Талисман защиты ×1',
    itemId: 'defense_talisman',
    count: 1,
    priceCoins: 65,
  },
  {
    offerId: 'heavenly_thunder_1',
    kind: 'item',
    label: 'Талисман небесной грозы ×1',
    itemId: 'heavenly_thunder_talisman',
    count: 1,
    priceCoins: 95,
  },
  {
    offerId: 'resurrection_fragment_1',
    kind: 'item',
    label: 'Осколок воскрешения ×1',
    itemId: 'resurrection_fragment',
    count: 1,
    priceCoins: 120,
  },
  {
    offerId: 'expedition_talisman_1',
    kind: 'item',
    label: 'Талисман вылазки ×1',
    itemId: 'expedition_talisman',
    count: 1,
    priceCoins: 85,
  },
  {
    offerId: 'library_scroll',
    kind: 'library_exp',
    label: 'Свиток знаний (опыт библиотеки)',
    libraryExp: 45,
    priceCoins: 130,
  },
];

type ItemExchangeRecipeDef = {
  recipeId: string;
  label: string;
  description?: string;
  consume: { itemId: string; count: number }[];
  grant: { itemId: string; count: number }[];
};

/** Обмен ингредиентов игры (лавка / алхимия / бои) */
const DISCIPLE_ITEM_EXCHANGE_RECIPES: ItemExchangeRecipeDef[] = [
  {
    recipeId: 'fragments_to_stabilizer',
    label: 'Стабилизатор из осколков',
    description: '3 загадочных осколка → 1 стабилизатор алхимии',
    consume: [{ itemId: 'mysterious_fragment', count: 3 }],
    grant: [{ itemId: 'stabilizing_talisman', count: 1 }],
  },
  {
    recipeId: 'basic_to_defense',
    label: 'Талисман защиты',
    description: '2 базовых талисмана → 1 талисман защиты',
    consume: [{ itemId: 'basic_talisman', count: 2 }],
    grant: [{ itemId: 'defense_talisman', count: 1 }],
  },
  {
    recipeId: 'fragments_basic_to_expedition',
    label: 'Талисман вылазки',
    description: '2 осколка + 1 базовый талисман → 1 талисман вылазки',
    consume: [
      { itemId: 'mysterious_fragment', count: 2 },
      { itemId: 'basic_talisman', count: 1 },
    ],
    grant: [{ itemId: 'expedition_talisman', count: 1 }],
  },
  {
    recipeId: 'healing_basic_to_thunder',
    label: 'Талисман небесной грозы',
    description: '4 пилюли исцеления + 1 базовый талисман → 1 талисман грозы',
    consume: [
      { itemId: 'healing_pill', count: 4 },
      { itemId: 'basic_talisman', count: 1 },
    ],
    grant: [{ itemId: 'heavenly_thunder_talisman', count: 1 }],
  },
];

function rankFromLevel(level: number): string {
  if (level >= 41) return 'S';
  if (level >= 31) return 'A';
  if (level >= 21) return 'B';
  if (level >= 16) return 'C';
  if (level >= 11) return 'D';
  if (level >= 6) return 'E';
  return 'F';
}

/** Случайная длительность экспедиции в мс: easy 20–60 с, normal 45–90 с, hard 60–120 с */
function randomExpeditionDurationMs(
  difficulty: 'easy' | 'normal' | 'hard',
): number {
  const ranges = {
    easy: [20, 60],
    normal: [45, 90],
    hard: [60, 120],
  };
  const [min, max] = ranges[difficulty];
  return min * 1000 + Math.floor(Math.random() * (max - min + 1) * 1000);
}

function divisionFromRating(rating: number): string {
  if (rating >= 2000) return 'Легенда';
  if (rating >= 1600) return 'Мастер';
  if (rating >= 1200) return 'Золото';
  if (rating >= 800) return 'Серебро';
  return 'Бронза';
}

type BattleSupportItemId =
  | 'healing_pill'
  | 'basic_talisman'
  | 'defense_talisman'
  | 'heavenly_thunder_talisman'
  | 'resurrection_fragment';

type BattleSupportEffectConfig = {
  label: string;
  shield?: number;
  emergencyHealPercent?: number;
  emergencyHealThresholdPercent?: number;
  preDamage?: number;
  revivePercent?: number;
};

type BattleSupportState = {
  shield: number;
  preDamage: number;
  emergencyHealPercent: number;
  emergencyHealThresholdPercent: number;
  revivePercent: number;
  usedEmergencyHeal: boolean;
  usedRevive: boolean;
  consumed: Array<{
    itemId: BattleSupportItemId;
    count: number;
    name?: string;
    icon?: string;
  }>;
};

const BATTLE_SUPPORT_ITEMS: Record<
  BattleSupportItemId,
  BattleSupportEffectConfig
> = {
  healing_pill: {
    label: 'Пилюля исцеления',
    emergencyHealPercent: 0.3,
    emergencyHealThresholdPercent: 0.55,
  },
  basic_talisman: {
    label: 'Базовый талисман',
    shield: 20,
  },
  defense_talisman: {
    label: 'Талисман защиты',
    shield: 42,
  },
  heavenly_thunder_talisman: {
    label: 'Талисман небесной грозы',
    preDamage: 32,
  },
  resurrection_fragment: {
    label: 'Осколок воскрешения',
    revivePercent: 0.35,
  },
};

@Injectable()
export class DisciplesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Character.name)
    private characterModel: Model<CharacterDocument>,
    @InjectModel(CharacterCard.name)
    private characterCardModel: Model<CharacterCardDocument>,
    @InjectModel(DisciplesConfig.name)
    private disciplesConfigModel: Model<DisciplesConfigDocument>,
    @InjectModel(Technique.name)
    private techniqueModel: Model<TechniqueDocument>,
    private gameItemsService: GameItemsService,
    private cardsService: CardsService,
  ) {}

  private async getConfig(): Promise<DisciplesConfigDocument> {
    let config = (await this.disciplesConfigModel
      .findOne({ id: 'default' })
      .lean()
      .exec()) as DisciplesConfigDocument | null;
    if (!config) {
      await this.disciplesConfigModel.create({
        id: 'default',
        rerollCostCoins: 50,
        trainCostCoins: 15,
        maxDisciples: 3,
        maxBattlesPerDay: 3,
        rerollCandidateTtlMinutes: 10,
        characterPool: 'all',
        expeditionCooldownHours: 24,
        expeditionCostCoinsEasy: 0,
        expeditionCostCoinsNormal: 25,
        expeditionCostCoinsHard: 60,
      });
      config = (await this.disciplesConfigModel
        .findOne({ id: 'default' })
        .lean()
        .exec()) as unknown as DisciplesConfigDocument;
    }
    return config;
  }

  /**
   * Проверяет и увеличивает счётчик дневных боев для пользователя.
   * Если пользователь - админ (role === 'admin'), ограничение не применяется.
   * @param user Документ пользователя
   * @param config Конфиг (для maxBattlesPerDay)
   * @throws BadRequestException если превышен лимит
   */
  /** Сколько боёв уже учтено «сегодня» (UTC), с автосбросом по дате — для профиля и лимита */
  private effectiveDailyBattlesCount(user: {
    dailyBattlesDate?: Date | null;
    dailyBattlesCount?: number;
  }): number {
    const now = new Date();
    const todayStart = getStartOfDayUTC(now);
    const lastReset = user.dailyBattlesDate
      ? new Date(user.dailyBattlesDate)
      : null;
    if (!lastReset || lastReset < todayStart) return 0;
    return user.dailyBattlesCount ?? 0;
  }

  private checkAndIncrementDailyBattles(
    user: UserDocument,
    config: DisciplesConfigDocument,
  ): void {
    // Админы без ограничений
    if (user.role === 'admin') {
      return;
    }

    const now = new Date();
    const todayStart = getStartOfDayUTC(now);
    const lastReset = user.dailyBattlesDate
      ? new Date(user.dailyBattlesDate)
      : null;

    // Если дата сброса не сегодня, сбрасываем счетчик
    if (!lastReset || lastReset < todayStart) {
      user.dailyBattlesCount = 0;
      user.dailyBattlesDate = todayStart;
    }

    const maxBattles = config.maxBattlesPerDay ?? 5;
    if ((user.dailyBattlesCount ?? 0) >= maxBattles) {
      throw new BadRequestException(
        `Достигнут дневной лимит боев (${maxBattles}). Завтра можно будет снова сражаться.`,
      );
    }

    user.dailyBattlesCount = (user.dailyBattlesCount ?? 0) + 1;
    user.markModified('dailyBattlesCount');
    user.markModified('dailyBattlesDate');
  }

  private getInventoryCount(
    inventory: Array<{ itemId?: string; count?: number }> | undefined,
    itemId: string,
  ): number {
    return (inventory ?? []).reduce(
      (sum, entry) =>
        entry.itemId === itemId ? sum + Math.max(0, entry.count ?? 0) : sum,
      0,
    );
  }

  private async consumeBattleSupportItems(
    userId: string,
    inventory: Array<{ itemId?: string; count?: number }> | undefined,
    supportItemIds?: string[],
  ): Promise<BattleSupportState> {
    // Проверяем, что все переданные предметы являются допустимыми для боя
    const invalidItems = (supportItemIds ?? []).filter(
      (id) => !(id in BATTLE_SUPPORT_ITEMS),
    );
    if (invalidItems.length > 0) {
      throw new BadRequestException(
        `Следующие предметы нельзя использовать в бою: ${invalidItems.join(', ')}`,
      );
    }

    const requested = Array.from(
      new Set(
        (supportItemIds ?? []).filter(
          (id): id is BattleSupportItemId => id in BATTLE_SUPPORT_ITEMS,
        ),
      ),
    ).slice(0, 3);

    const state: BattleSupportState = {
      shield: 0,
      preDamage: 0,
      emergencyHealPercent: 0,
      emergencyHealThresholdPercent: 0.5,
      revivePercent: 0,
      usedEmergencyHeal: false,
      usedRevive: false,
      consumed: [],
    };

    for (const itemId of requested) {
      if (this.getInventoryCount(inventory, itemId) <= 0) {
        throw new BadRequestException(`Недостаточно предмета: ${itemId}`);
      }
    }

    for (const itemId of requested) {
      const consumed = await this.gameItemsService.deductFromInventory(
        userId,
        itemId,
        1,
      );
      if (!consumed) {
        throw new BadRequestException(
          `Не удалось использовать предмет: ${itemId}`,
        );
      }
      const meta = await this.gameItemsService.findById(itemId);
      const effect = BATTLE_SUPPORT_ITEMS[itemId];
      state.shield += effect.shield ?? 0;
      state.preDamage += effect.preDamage ?? 0;
      if ((effect.emergencyHealPercent ?? 0) > state.emergencyHealPercent) {
        state.emergencyHealPercent = effect.emergencyHealPercent ?? 0;
        state.emergencyHealThresholdPercent =
          effect.emergencyHealThresholdPercent ?? 0.5;
      }
      if ((effect.revivePercent ?? 0) > state.revivePercent) {
        state.revivePercent = effect.revivePercent ?? 0;
      }
      state.consumed.push({
        itemId,
        count: 1,
        name: meta?.name ?? effect.label,
        icon: meta?.icon ?? undefined,
      });
    }

    return state;
  }

  private cp(
    stats: { attack: number; defense: number; speed: number; hp: number },
    formula: { attack: number; defense: number; speed: number; hp: number },
  ): number {
    return (
      stats.attack * (formula.attack ?? 1.2) +
      stats.defense * (formula.defense ?? 1) +
      stats.speed * (formula.speed ?? 0.8) +
      stats.hp * (formula.hp ?? 0.3)
    );
  }

  private randomStat(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /**
   * Статы при вербовке: atk/def/spd близки друг к другу (±RECRUIT_STAT_SPREAD от общей базы),
   * HP — от середины своего диапазона с тем же разбросом. Главные герои чуть сильнее.
   */
  private rollBalancedRecruitStats(
    ranges: {
      attackMin: number;
      attackMax: number;
      defenseMin: number;
      defenseMax: number;
      speedMin: number;
      speedMax: number;
      hpMin: number;
      hpMax: number;
    },
    isMainHero: boolean,
  ): {
    attack: number;
    defense: number;
    speed: number;
    hp: number;
  } {
    const clamp = (v: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(hi, Math.round(v)));
    const coreLow = Math.max(
      ranges.attackMin,
      ranges.defenseMin,
      ranges.speedMin,
    );
    const coreHigh = Math.min(
      ranges.attackMax,
      ranges.defenseMax,
      ranges.speedMax,
    );
    let baseCore: number;
    if (coreLow <= coreHigh) {
      baseCore = this.randomStat(coreLow, coreHigh);
    } else {
      baseCore = Math.round((coreLow + coreHigh) / 2);
    }
    const mainBoost = isMainHero ? RECRUIT_MAIN_CORE_BONUS : 0;
    const coreJitter = this.randomStat(
      -RECRUIT_STAT_SPREAD,
      RECRUIT_STAT_SPREAD,
    );
    const coreRaw = baseCore + mainBoost + coreJitter;
    const attack = clamp(coreRaw, ranges.attackMin, ranges.attackMax);
    const defense = clamp(coreRaw, ranges.defenseMin, ranges.defenseMax);
    const speed = clamp(coreRaw, ranges.speedMin, ranges.speedMax);
    const hpMid = (ranges.hpMin + ranges.hpMax) / 2;
    const hpMain = isMainHero ? RECRUIT_MAIN_HP_BONUS : 0;
    const hpJitter = this.randomStat(-RECRUIT_STAT_SPREAD, RECRUIT_STAT_SPREAD);
    const hp = clamp(hpMid + hpMain + hpJitter, ranges.hpMin, ranges.hpMax);
    return { attack, defense, speed, hp };
  }

  private discipleCharId(d: any): string {
    const c = d?.characterId;
    if (c == null) return '';
    if (typeof c === 'object' && c !== null && 'toString' in c) {
      return (c as { toString(): string }).toString();
    }
    return String(c);
  }

  /** Ученики в активном отряде (не на складе) */
  private activeDisciples(user: UserDocument): Disciple[] {
    return (user.disciples ?? []).filter((d: any) => !d.inWarehouse);
  }

  private resolvePrimaryCharacterId(user: UserDocument): string | null {
    const active = this.activeDisciples(user);
    if (active.length === 0) return null;
    const pref = user.primaryDiscipleCharacterId;
    const prefStr = pref?.toString?.() ?? (pref ? String(pref) : '');
    if (prefStr) {
      const hit = active.find((d) => this.discipleCharId(d) === prefStr);
      if (hit) return prefStr;
    }
    return this.discipleCharId(active[0]);
  }

  private getLeadActiveDisciple(user: UserDocument): Disciple | null {
    const active = this.activeDisciples(user);
    if (active.length === 0) return null;
    const primary = this.resolvePrimaryCharacterId(user);
    if (primary) {
      const d = active.find((x) => this.discipleCharId(x) === primary);
      if (d) return d;
    }
    return active[0];
  }

  private recomputeCombatRating(
    user: UserDocument,
    formula: { attack: number; defense: number; speed: number; hp: number },
  ): void {
    let totalCp = 0;
    for (const d of this.activeDisciples(user)) {
      totalCp += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }
    user.combatRating = Math.round(totalCp);
  }

  private applyExpPoolToMembers(
    members: any[],
    primaryCid: string | null,
    totalExp: number,
    primaryShare: number,
  ): string[] {
    const logs: string[] = [];
    const n = members.length;
    if (n === 0 || totalExp <= 0) return logs;

    let primaryIdx = 0;
    if (primaryCid) {
      const idx = members.findIndex(
        (m) => this.discipleCharId(m) === primaryCid,
      );
      if (idx >= 0) primaryIdx = idx;
    }

    let primaryExp: number;
    let rest: number;
    if (n === 1) {
      primaryExp = totalExp;
      rest = 0;
    } else {
      primaryExp = Math.max(1, Math.floor(totalExp * primaryShare));
      rest = totalExp - primaryExp;
    }
    const otherIdx = members.map((_, i) => i).filter((i) => i !== primaryIdx);
    const k = otherIdx.length;
    const perOther = k > 0 ? Math.floor(rest / k) : 0;
    const distributed = primaryExp + perOther * k;
    const remainder = totalExp - distributed;
    const amounts: number[] = new Array(n).fill(0);
    amounts[primaryIdx] = primaryExp + remainder;
    for (const i of otherIdx) {
      amounts[i] = perOther;
    }

    for (let i = 0; i < n; i++) {
      const add = amounts[i];
      if (add <= 0) continue;
      const d = members[i];
      let lvl = d.level ?? 1;
      let exp = d.exp ?? 0;
      exp += add;
      while (exp >= expToNextLevel(lvl)) {
        exp -= expToNextLevel(lvl);
        lvl += 1;
      }
      d.level = lvl;
      d.exp = exp;
      d.rank = rankFromLevel(lvl);
      logs.push(`Опыт ученика +${add} (ур. ${lvl})`);
    }
    return logs;
  }

  private applyGameExpToUser(
    user: UserDocument,
    totalExp: number,
    mode: 'active' | 'all',
    primaryShare: number,
  ): string[] {
    const list =
      mode === 'active'
        ? this.activeDisciples(user)
        : [...(user.disciples ?? [])];
    const primary = this.resolvePrimaryCharacterId(user);
    return this.applyExpPoolToMembers(list, primary, totalExp, primaryShare);
  }

  private addLibraryExp(user: UserDocument, amount: number): string[] {
    const logs: string[] = [];
    if (amount <= 0) return logs;
    let lvl = user.libraryLevel ?? 1;
    let exp = user.libraryExp ?? 0;
    exp += amount;
    while (exp >= libraryExpToNext(lvl)) {
      exp -= libraryExpToNext(lvl);
      lvl += 1;
      logs.push(`Библиотека: новый уровень ${lvl}`);
    }
    user.libraryLevel = lvl;
    user.libraryExp = exp;
    user.markModified('libraryLevel');
    user.markModified('libraryExp');
    return logs;
  }

  /** Опыт учеников с колеса (документ уже загружен, save снаружи) */
  applyWheelXpToLoadedUser(user: UserDocument, amount: number): void {
    if (amount <= 0) return;
    this.applyGameExpToUser(user, amount, 'active', GAME_PRIMARY_EXP_SHARE);
    user.markModified('disciples');
  }

  private async resolveCardMedia(
    characterId: string,
    level: number,
    userId?: string,
  ) {
    if (!Types.ObjectId.isValid(characterId)) {
      return null;
    }
    if (userId) {
      const ownedCard = await this.cardsService.resolveCardMediaForUser(
        userId,
        characterId,
      );
      if (ownedCard) return ownedCard;
    }
    const card = await this.characterCardModel
      .findOne({
        characterId: new Types.ObjectId(characterId),
        minLevel: { $lte: level },
        maxLevel: { $gte: level },
      })
      .select('mediaUrl mediaType label')
      .lean()
      .exec();
    if (card) {
      return {
        mediaUrl: (card as any).mediaUrl,
        mediaType: (card as any).mediaType,
        label: (card as any).label ?? '',
      };
    }
    return null;
  }

  /** Состав для resultScreen: имя, уровень, id и карточка для превью в UI */
  private async teamsForResultScreen(
    roster: Array<{
      characterId: string;
      displayName: string;
      level: number;
    }>,
    cardOwnerUserId?: string,
  ): Promise<
    Array<{
      name: string;
      level: number;
      characterId: string;
      cardMedia: {
        mediaUrl?: string;
        mediaType?: string;
        label?: string;
      } | null;
    }>
  > {
    return Promise.all(
      roster.map(async (m) => ({
        name: m.displayName,
        level: m.level,
        characterId: m.characterId,
        cardMedia: await this.resolveCardMedia(
          m.characterId,
          m.level,
          cardOwnerUserId,
        ),
      })),
    );
  }

  private async ensureDefaultTechniqueSeeded(): Promise<void> {
    const defaults: Array<{
      id: string;
      name: string;
      description: string;
      type: 'attack' | 'movement' | 'heal' | 'buff' | 'debuff' | 'ultimate';
      power: number;
      cooldownTurns: number;
      requiredLevel: number;
      requiredRank: string;
      learnCostCoins: number;
    }> = [
      {
        id: 'basic_strike',
        name: 'Базовый удар',
        description: 'Простой удар ци.',
        type: 'attack',
        power: 12,
        cooldownTurns: 0,
        requiredLevel: 1,
        requiredRank: 'F',
        learnCostCoins: 0,
      },
      {
        id: 'swift_step',
        name: 'Стремительный шаг',
        description: 'Уклонение и рывок.',
        type: 'movement',
        power: 6,
        cooldownTurns: 2,
        requiredLevel: 5,
        requiredRank: 'E',
        learnCostCoins: 60,
      },
      {
        id: 'healing_breath',
        name: 'Дыхание восстановления',
        description: 'Лечит ученика в бою.',
        type: 'heal',
        power: 18,
        cooldownTurns: 3,
        requiredLevel: 10,
        requiredRank: 'D',
        learnCostCoins: 120,
      },
      {
        id: 'piercing_technique',
        name: 'Пробивающая техника',
        description: 'Сильная атака.',
        type: 'attack',
        power: 26,
        cooldownTurns: 2,
        requiredLevel: 15,
        requiredRank: 'C',
        learnCostCoins: 220,
      },
      {
        id: 'domain_burst',
        name: 'Вспышка домена',
        description: 'Ульта: мощный выброс энергии.',
        type: 'ultimate',
        power: 45,
        cooldownTurns: 5,
        requiredLevel: 25,
        requiredRank: 'B',
        learnCostCoins: 400,
      },
      // Атакующие
      {
        id: 'flame_palm',
        name: 'Ладонь пламени',
        description: 'Огненная атака, поджигает противника.',
        type: 'attack',
        power: 22,
        cooldownTurns: 1,
        requiredLevel: 3,
        requiredRank: 'F',
        learnCostCoins: 40,
      },
      {
        id: 'ice_needle',
        name: 'Ледяная игла',
        description: 'Пробивающий удар холодом.',
        type: 'attack',
        power: 20,
        cooldownTurns: 0,
        requiredLevel: 4,
        requiredRank: 'F',
        learnCostCoins: 50,
      },
      {
        id: 'thunder_fist',
        name: 'Громовой кулак',
        description: 'Удар, насыщенный молнией.',
        type: 'attack',
        power: 28,
        cooldownTurns: 2,
        requiredLevel: 8,
        requiredRank: 'E',
        learnCostCoins: 90,
      },
      {
        id: 'shadow_strike',
        name: 'Удар тени',
        description: 'Атака из тени, сложно предугадать.',
        type: 'attack',
        power: 24,
        cooldownTurns: 1,
        requiredLevel: 6,
        requiredRank: 'E',
        learnCostCoins: 70,
      },
      {
        id: 'bone_crusher',
        name: 'Костолом',
        description: 'Сокрушительный удар по корпусу.',
        type: 'attack',
        power: 32,
        cooldownTurns: 3,
        requiredLevel: 12,
        requiredRank: 'D',
        learnCostCoins: 150,
      },
      {
        id: 'spirit_slash',
        name: 'Духовный рассекатель',
        description: 'Удар оружием духа.',
        type: 'attack',
        power: 30,
        cooldownTurns: 2,
        requiredLevel: 11,
        requiredRank: 'D',
        learnCostCoins: 140,
      },
      {
        id: 'dragon_roar',
        name: 'Рёв дракона',
        description: 'Оглушающий выброс ци.',
        type: 'attack',
        power: 38,
        cooldownTurns: 4,
        requiredLevel: 18,
        requiredRank: 'C',
        learnCostCoins: 260,
      },
      {
        id: 'phoenix_dive',
        name: 'Пике феникса',
        description: 'Падение с неба, охваченное пламенем.',
        type: 'attack',
        power: 42,
        cooldownTurns: 4,
        requiredLevel: 20,
        requiredRank: 'C',
        learnCostCoins: 300,
      },
      {
        id: 'void_rend',
        name: 'Разрыв пустоты',
        description: 'Разрушающий удар пространством.',
        type: 'attack',
        power: 48,
        cooldownTurns: 5,
        requiredLevel: 28,
        requiredRank: 'B',
        learnCostCoins: 450,
      },
      {
        id: 'soul_harvest',
        name: 'Жатва душ',
        description: 'Тёмная атака, забирает силу врага.',
        type: 'attack',
        power: 44,
        cooldownTurns: 4,
        requiredLevel: 22,
        requiredRank: 'C',
        learnCostCoins: 340,
      },
      {
        id: 'starfall',
        name: 'Падение звезды',
        description: 'Призыв небесной энергии на врага.',
        type: 'attack',
        power: 36,
        cooldownTurns: 3,
        requiredLevel: 16,
        requiredRank: 'D',
        learnCostCoins: 200,
      },
      {
        id: 'thousand_cuts',
        name: 'Тысяча порезов',
        description: 'Серия быстрых ударов.',
        type: 'attack',
        power: 34,
        cooldownTurns: 2,
        requiredLevel: 14,
        requiredRank: 'D',
        learnCostCoins: 180,
      },
      // Защитные / движение
      {
        id: 'iron_skin',
        name: 'Железная кожа',
        description: 'Укрепление тела, снижает входящий урон.',
        type: 'buff',
        power: 8,
        cooldownTurns: 3,
        requiredLevel: 5,
        requiredRank: 'E',
        learnCostCoins: 65,
      },
      {
        id: 'wind_dash',
        name: 'Порыв ветра',
        description: 'Мгновенный рывок в сторону.',
        type: 'movement',
        power: 10,
        cooldownTurns: 2,
        requiredLevel: 7,
        requiredRank: 'E',
        learnCostCoins: 80,
      },
      {
        id: 'mirror_step',
        name: 'Зеркальный шаг',
        description: 'Уклонение с отражением траектории атаки.',
        type: 'movement',
        power: 12,
        cooldownTurns: 3,
        requiredLevel: 9,
        requiredRank: 'D',
        learnCostCoins: 100,
      },
      {
        id: 'earth_wall',
        name: 'Стена земли',
        description: 'Призыв барьера из ци земли.',
        type: 'buff',
        power: 14,
        cooldownTurns: 4,
        requiredLevel: 13,
        requiredRank: 'D',
        learnCostCoins: 160,
      },
      {
        id: 'blink',
        name: 'Мерцание',
        description: 'Краткое телепортационное смещение.',
        type: 'movement',
        power: 6,
        cooldownTurns: 4,
        requiredLevel: 17,
        requiredRank: 'C',
        learnCostCoins: 240,
      },
      {
        id: 'counter_stance',
        name: 'Стойка контратаки',
        description: 'Готовность отразить удар и ответить.',
        type: 'buff',
        power: 18,
        cooldownTurns: 3,
        requiredLevel: 21,
        requiredRank: 'C',
        learnCostCoins: 320,
      },
      {
        id: 'golden_bell',
        name: 'Золотой колокол',
        description: 'Защитная оболочка ци вокруг тела.',
        type: 'buff',
        power: 22,
        cooldownTurns: 5,
        requiredLevel: 26,
        requiredRank: 'B',
        learnCostCoins: 420,
      },
      {
        id: 'phantom_dodge',
        name: 'Призрачное уклонение',
        description: 'Тело становится полупрозрачным, атаки проходят мимо.',
        type: 'movement',
        power: 16,
        cooldownTurns: 5,
        requiredLevel: 24,
        requiredRank: 'B',
        learnCostCoins: 380,
      },
      // Лечение
      {
        id: 'vitality_stream',
        name: 'Поток жизненной силы',
        description: 'Восстановление за счёт внутренней энергии.',
        type: 'heal',
        power: 22,
        cooldownTurns: 2,
        requiredLevel: 6,
        requiredRank: 'E',
        learnCostCoins: 75,
      },
      {
        id: 'herb_mastery',
        name: 'Искусство трав',
        description: 'Быстрое применение лечебных свойств трав.',
        type: 'heal',
        power: 26,
        cooldownTurns: 3,
        requiredLevel: 11,
        requiredRank: 'D',
        learnCostCoins: 130,
      },
      {
        id: 'spirit_well',
        name: 'Колодец духа',
        description: 'Черпание силы из духовного источника.',
        type: 'heal',
        power: 32,
        cooldownTurns: 4,
        requiredLevel: 16,
        requiredRank: 'D',
        learnCostCoins: 190,
      },
      {
        id: 'rejuvenation',
        name: 'Омоложение',
        description: 'Ускоренная регенерация тканей.',
        type: 'heal',
        power: 38,
        cooldownTurns: 4,
        requiredLevel: 20,
        requiredRank: 'C',
        learnCostCoins: 290,
      },
      {
        id: 'life_bloom',
        name: 'Цветение жизни',
        description: 'Всплеск целительной энергии.',
        type: 'heal',
        power: 44,
        cooldownTurns: 5,
        requiredLevel: 25,
        requiredRank: 'B',
        learnCostCoins: 410,
      },
      {
        id: 'soul_mend',
        name: 'Починка души',
        description: 'Глубокое исцеление духа и тела.',
        type: 'heal',
        power: 50,
        cooldownTurns: 5,
        requiredLevel: 30,
        requiredRank: 'A',
        learnCostCoins: 500,
      },
      // Дебаффы (в бою дают урон по текущей логике)
      {
        id: 'poison_sting',
        name: 'Ядовитое жало',
        description: 'Отравление, ослабляет противника.',
        type: 'debuff',
        power: 18,
        cooldownTurns: 2,
        requiredLevel: 4,
        requiredRank: 'F',
        learnCostCoins: 45,
      },
      {
        id: 'weakness_strike',
        name: 'Удар по слабости',
        description: 'Снижает защиту врага на время.',
        type: 'debuff',
        power: 20,
        cooldownTurns: 2,
        requiredLevel: 8,
        requiredRank: 'E',
        learnCostCoins: 85,
      },
      {
        id: 'curse_mark',
        name: 'Печать проклятия',
        description: 'Накладывает метку, усиливающую получаемый урон.',
        type: 'debuff',
        power: 26,
        cooldownTurns: 3,
        requiredLevel: 12,
        requiredRank: 'D',
        learnCostCoins: 155,
      },
      {
        id: 'spirit_drain',
        name: 'Вытягивание духа',
        description: 'Забирает часть силы противника.',
        type: 'debuff',
        power: 30,
        cooldownTurns: 3,
        requiredLevel: 15,
        requiredRank: 'D',
        learnCostCoins: 210,
      },
      {
        id: 'binding_chains',
        name: 'Оковы ци',
        description: 'Сковывает движения и ослабляет.',
        type: 'debuff',
        power: 34,
        cooldownTurns: 4,
        requiredLevel: 19,
        requiredRank: 'C',
        learnCostCoins: 270,
      },
      {
        id: 'fear_gaze',
        name: 'Взгляд страха',
        description: 'Психологическая атака, снижает боевой дух.',
        type: 'debuff',
        power: 28,
        cooldownTurns: 3,
        requiredLevel: 17,
        requiredRank: 'C',
        learnCostCoins: 230,
      },
      // Баффы (в бою дают урон по текущей логике, можно трактовать как усиленный удар)
      {
        id: 'battle_rage',
        name: 'Боевая ярость',
        description: 'Всплеск ярости, увеличивает урон следующей атаки.',
        type: 'buff',
        power: 24,
        cooldownTurns: 2,
        requiredLevel: 10,
        requiredRank: 'D',
        learnCostCoins: 125,
      },
      {
        id: 'sharp_edge',
        name: 'Острое лезвие',
        description: 'Ци усиливает оружие, повышая пробитие.',
        type: 'buff',
        power: 28,
        cooldownTurns: 2,
        requiredLevel: 14,
        requiredRank: 'D',
        learnCostCoins: 175,
      },
      {
        id: 'berserker',
        name: 'Режим берсерка',
        description: 'Рискованное усиление атаки ценой защиты.',
        type: 'buff',
        power: 36,
        cooldownTurns: 4,
        requiredLevel: 22,
        requiredRank: 'C',
        learnCostCoins: 330,
      },
      {
        id: 'divine_favor',
        name: 'Благоволение небес',
        description: 'Временное усиление всех параметров.',
        type: 'buff',
        power: 32,
        cooldownTurns: 4,
        requiredLevel: 18,
        requiredRank: 'C',
        learnCostCoins: 250,
      },
      {
        id: 'overdrive',
        name: 'Перегрузка',
        description: 'Краткий выброс всей накопленной ци.',
        type: 'buff',
        power: 40,
        cooldownTurns: 5,
        requiredLevel: 27,
        requiredRank: 'B',
        learnCostCoins: 440,
      },
      // Ультимейты
      {
        id: 'heavenly_wrath',
        name: 'Гнев небес',
        description: 'Призыв карающей небесной силы.',
        type: 'ultimate',
        power: 52,
        cooldownTurns: 6,
        requiredLevel: 28,
        requiredRank: 'B',
        learnCostCoins: 460,
      },
      {
        id: 'inferno',
        name: 'Инферно',
        description: 'Огненная буря вокруг противника.',
        type: 'ultimate',
        power: 55,
        cooldownTurns: 6,
        requiredLevel: 30,
        requiredRank: 'A',
        learnCostCoins: 500,
      },
      {
        id: 'void_annihilation',
        name: 'Аннигиляция пустоты',
        description: 'Полное уничтожение в области пустоты.',
        type: 'ultimate',
        power: 58,
        cooldownTurns: 6,
        requiredLevel: 32,
        requiredRank: 'A',
        learnCostCoins: 520,
      },
      {
        id: 'celestial_slash',
        name: 'Небесный удар',
        description: 'Один сокрушительный удар свыше.',
        type: 'ultimate',
        power: 50,
        cooldownTurns: 5,
        requiredLevel: 26,
        requiredRank: 'B',
        learnCostCoins: 430,
      },
      {
        id: 'soul_devour',
        name: 'Пожирание души',
        description: 'Тёмная ульта, забирает жизнь врага.',
        type: 'ultimate',
        power: 54,
        cooldownTurns: 6,
        requiredLevel: 29,
        requiredRank: 'A',
        learnCostCoins: 480,
      },
      {
        id: 'eternal_flame',
        name: 'Вечное пламя',
        description: 'Пламя, которое не гаснет, пока цель не падёт.',
        type: 'ultimate',
        power: 56,
        cooldownTurns: 6,
        requiredLevel: 31,
        requiredRank: 'A',
        learnCostCoins: 510,
      },
      {
        id: 'supreme_sword',
        name: 'Меч верховного',
        description: 'Воплощение абсолютного меча.',
        type: 'ultimate',
        power: 60,
        cooldownTurns: 6,
        requiredLevel: 33,
        requiredRank: 'S',
        learnCostCoins: 550,
      },
    ];
    const techniqueLibraryRequirement: Record<string, number> = {
      swift_step: 2,
      thunder_fist: 2,
      iron_skin: 2,
      bone_crusher: 3,
      dragon_roar: 3,
      domain_burst: 4,
      void_annihilation: 5,
      heavenly_wrath: 5,
      soul_mend: 6,
      supreme_sword: 7,
    };
    for (const t of defaults) {
      await this.techniqueModel.updateOne(
        { id: t.id },
        {
          $set: {
            ...t,
            characterId: null,
            requiredLibraryLevel: techniqueLibraryRequirement[t.id] ?? 1,
          },
        },
        { upsert: true },
      );
    }
  }

  private rankValue(rank: string): number {
    const map: Record<string, number> = {
      F: 1,
      E: 2,
      D: 3,
      C: 4,
      B: 5,
      A: 6,
      S: 7,
    };
    return map[rank] ?? 0;
  }

  /** Каталог техник по уровню/рангу персонажа (без фильтра по библиотеке — блокировка только при изучении). */
  private async listAvailableTechniques(
    characterId: string,
    level: number,
    rank: string,
  ) {
    await this.ensureDefaultTechniqueSeeded();
    const rankVal = this.rankValue(rank);
    const all = await this.techniqueModel
      .find({
        $or: [
          { characterId: null },
          { characterId: new Types.ObjectId(characterId) },
        ],
        requiredLevel: { $lte: level },
      })
      .select(
        'id name description type power cooldownTurns requiredLevel requiredRank requiredLibraryLevel learnCostCoins iconUrl',
      )
      .lean()
      .exec();
    const filtered = (
      all as Array<{ requiredRank?: string; requiredLibraryLevel?: number }>
    ).filter((t) => this.rankValue(t.requiredRank ?? 'F') <= rankVal);
    return filtered;
  }

  private async simulateBattleWithTechniques(
    userSide: {
      characterId: string;
      equipped: string[];
      stats: {
        attack: number;
        defense: number;
        speed: number;
        hp: number;
        maxHpPool: number;
      };
      /** Покомпонентные статы (после синергии отряда) — урон/лечение считаются от исполнителя техники */
      roster?: Array<{
        characterId: string;
        displayName: string;
        attack: number;
        defense: number;
        speed: number;
        hp: number;
        techniquesEquipped: string[];
      }>;
      rosterLine: string;
      techniqueOwners: Map<
        string,
        { displayName: string; characterId: string }
      >;
      sideLabel: string;
    },
    opponentSide: {
      characterId: string;
      equipped: string[];
      stats: {
        attack: number;
        defense: number;
        speed: number;
        hp: number;
        maxHpPool: number;
      };
      roster?: Array<{
        characterId: string;
        displayName: string;
        attack: number;
        defense: number;
        speed: number;
        hp: number;
        techniquesEquipped: string[];
      }>;
      rosterLine: string;
      techniqueOwners: Map<
        string,
        { displayName: string; characterId: string }
      >;
      sideLabel: string;
    },
    supportState?: BattleSupportState,
  ) {
    await this.ensureDefaultTechniqueSeeded();
    const techIds = Array.from(
      new Set([...userSide.equipped, ...opponentSide.equipped, 'basic_strike']),
    );
    const techs = await this.techniqueModel
      .find({ id: { $in: techIds } })
      .lean()
      .exec();
    const techMap = new Map<string, any>();
    for (const t of techs as any[]) techMap.set(t.id, t);

    const maxUser = Math.max(80, Math.round(userSide.stats.maxHpPool));
    const maxOpp = Math.max(80, Math.round(opponentSide.stats.maxHpPool));
    let hpUser = maxUser;
    let hpOpp = maxOpp;

    const log: any[] = [];
    const cd: Record<string, number> = {};
    const support = supportState ?? {
      shield: 0,
      preDamage: 0,
      emergencyHealPercent: 0,
      emergencyHealThresholdPercent: 0.5,
      revivePercent: 0,
      usedEmergencyHeal: false,
      usedRevive: false,
      consumed: [],
    };

    const rosterDetail = (side: typeof userSide): string => {
      if (!side.roster?.length) return '';
      const parts = side.roster.map(
        (m) =>
          `${m.displayName} (ATK ${m.attack}, DEF ${m.defense}, SPD ${m.speed}, HP ${m.hp})`,
      );
      return ` · бойцы: ${parts.join('; ')}`;
    };

    log.push({
      turn: 0,
      actor: 'system',
      action: 'battle_start',
      message: `${userSide.sideLabel}: ${userSide.rosterLine} · суммарно ATK ${userSide.stats.attack}, DEF ${userSide.stats.defense}, SPD ${userSide.stats.speed}, запас ОЗ ${maxUser}${rosterDetail(userSide)}`,
      opponentSummary: `${opponentSide.sideLabel}: ${opponentSide.rosterLine} · суммарно ATK ${opponentSide.stats.attack}, DEF ${opponentSide.stats.defense}, SPD ${opponentSide.stats.speed}, запас ОЗ ${maxOpp}${rosterDetail(opponentSide)}`,
      userRosterLine: userSide.rosterLine,
      opponentRosterLine: opponentSide.rosterLine,
      hpUser,
      hpOpp,
    });

    if (support.consumed.length > 0) {
      log.push({
        turn: 0,
        actor: 'user',
        action: 'support_items',
        performerName: userSide.sideLabel,
        items: support.consumed,
      });
    }

    if (support.preDamage > 0) {
      hpOpp = Math.max(0, hpOpp - support.preDamage);
      log.push({
        turn: 0,
        actor: 'user',
        action: 'item_damage',
        performerName: userSide.sideLabel,
        itemId: 'heavenly_thunder_talisman',
        value: support.preDamage,
        hpUser,
        hpOpp,
      });
      if (hpOpp <= 0) {
        return {
          win: true,
          log,
          final: { hpUser, hpOpp, maxUser, maxOpp },
          supportEffects: {
            consumed: support.consumed,
            shieldLeft: support.shield,
          },
        };
      }
    }

    /**
     * Выбор техники на ход: среди не на кулдауне случайно, но если есть что-то кроме basic_strike — только из этого пула.
     * Раньше брался первый элемент списка экипировки → почти всегда «Базовый удар» (кд 0).
     */
    const pick = (equipped: string[]) => {
      const raw = equipped.length ? equipped : ['basic_strike'];
      const list = [...new Set(raw)];
      const available = list.filter((id) => (cd[id] ?? 0) <= 0);
      if (available.length === 0) return 'basic_strike';
      const nonBasic = available.filter((id) => id !== 'basic_strike');
      const pool = nonBasic.length > 0 ? nonBasic : available;
      return pool[Math.floor(Math.random() * pool.length)];
    };

    let userBuffShield = 0;
    let oppBuffShield = 0;
    let userDodgeNext = false;
    let oppDodgeNext = false;
    let oppDamageTakenMultiplier = 1;
    let userDamageTakenMultiplier = 1;

    const applyUserDamageToOpponent = (
      dmg: number,
      turnNum: number,
      techniqueId: string,
      techniqueName: string,
      performerName: string,
    ) => {
      let total = Math.max(1, Math.round(dmg * oppDamageTakenMultiplier));
      oppDamageTakenMultiplier = 1;
      const absorbedByShield = Math.min(oppBuffShield, total);
      oppBuffShield = Math.max(0, oppBuffShield - absorbedByShield);
      total -= absorbedByShield;
      hpOpp = Math.max(0, hpOpp - total);
      log.push({
        turn: turnNum,
        actor: 'user',
        action: 'damage',
        techniqueId,
        techniqueName,
        performerName,
        /** Фактическое снятие ОЗ у цели (после щита-баффа противника) */
        value: total,
        absorbedByShield: absorbedByShield || undefined,
        hpUser,
        hpOpp,
      });
    };
    const applyOpponentDamageToUser = (
      dmg: number,
      turnNum: number,
      techniqueId: string,
      techniqueName: string,
      performerName: string,
    ) => {
      let total = Math.max(1, Math.round(dmg * userDamageTakenMultiplier));
      userDamageTakenMultiplier = 1;
      if (userDodgeNext) {
        total = Math.max(1, Math.floor(total * 0.35));
        userDodgeNext = false;
      }
      let absorbed = 0;
      if (userBuffShield > 0) {
        const ab = Math.min(userBuffShield, total);
        userBuffShield = Math.max(0, userBuffShield - ab);
        absorbed += ab;
        total -= ab;
      }
      if (support.shield > 0 && total > 0) {
        const s = Math.min(support.shield, total);
        support.shield -= s;
        absorbed += s;
        total -= s;
      }
      hpUser = Math.max(0, hpUser - total);
      log.push({
        turn: turnNum,
        actor: 'opponent',
        action: 'damage',
        techniqueId,
        techniqueName,
        performerName,
        value: total,
        absorbed: absorbed || undefined,
        hpUser,
        hpOpp,
      });
    };

    for (let turn = 1; turn <= 12; turn++) {
      for (const k of Object.keys(cd)) cd[k] = Math.max(0, (cd[k] ?? 0) - 1);

      const uId = pick(userSide.equipped);
      const uT = techMap.get(uId) ?? techMap.get('basic_strike');
      if (uT?.cooldownTurns) cd[uId] = uT.cooldownTurns;
      const uPerform = this.resolvePerformerForTechnique(userSide, uId);
      const uStats = uPerform.stats;
      const uPerf = uPerform.displayName;

      if (uT?.type === 'heal') {
        const heal = Math.max(
          6,
          Math.round(
            (uT.power ?? 10) * (1 + uStats.defense / 58) + uStats.hp * 0.07,
          ),
        );
        hpUser = Math.min(maxUser, hpUser + heal);
        log.push({
          turn,
          actor: 'user',
          action: 'heal',
          techniqueId: uId,
          techniqueName: uT?.name,
          performerName: uPerf,
          value: heal,
          hpUser,
          hpOpp,
        });
      } else if (uT?.type === 'buff') {
        const shieldGain = Math.round(
          (uT.power ?? 10) * 2.1 + uStats.defense * 0.55 + uStats.speed * 0.22,
        );
        userBuffShield += Math.max(6, shieldGain);
        log.push({
          turn,
          actor: 'user',
          action: 'buff',
          techniqueId: uId,
          techniqueName: uT?.name,
          performerName: uPerf,
          value: shieldGain,
          shieldTotal: userBuffShield,
          hpUser,
          hpOpp,
        });
      } else if (uT?.type === 'debuff') {
        oppDamageTakenMultiplier = 1 + (uT.power ?? 10) / 72;
        log.push({
          turn,
          actor: 'user',
          action: 'debuff',
          techniqueId: uId,
          techniqueName: uT?.name,
          performerName: uPerf,
          value: oppDamageTakenMultiplier,
          hpUser,
          hpOpp,
        });
        const dmg = this.computeStrikeDamage(
          (uT.power ?? 10) * 0.62,
          uStats.attack,
          uStats.speed,
          opponentSide.stats.defense,
          opponentSide.stats.speed,
        );
        applyUserDamageToOpponent(dmg, turn, uId, uT?.name, uPerf);
      } else if (uT?.type === 'movement') {
        userDodgeNext = true;
        log.push({
          turn,
          actor: 'user',
          action: 'movement',
          techniqueId: uId,
          techniqueName: uT?.name,
          performerName: uPerf,
          dodgeNext: true,
          hpUser,
          hpOpp,
        });
      } else {
        let dmg = this.computeStrikeDamage(
          uT.power ?? 10,
          uStats.attack,
          uStats.speed,
          opponentSide.stats.defense,
          opponentSide.stats.speed,
        );
        if (oppDodgeNext) {
          dmg = Math.max(2, Math.floor(dmg * 0.52));
          oppDodgeNext = false;
        }
        applyUserDamageToOpponent(dmg, turn, uId, uT?.name, uPerf);
      }
      if (hpOpp <= 0) break;

      const oId = pick(opponentSide.equipped);
      const oT = techMap.get(oId) ?? techMap.get('basic_strike');
      if (oT?.cooldownTurns) cd[oId] = oT.cooldownTurns;
      const oPerform = this.resolvePerformerForTechnique(opponentSide, oId);
      const oStats = oPerform.stats;
      const oPerf = oPerform.displayName;

      if (oT?.type === 'heal') {
        const heal = Math.max(
          6,
          Math.round(
            (oT.power ?? 10) * (1 + oStats.defense / 58) + oStats.hp * 0.07,
          ),
        );
        hpOpp = Math.min(maxOpp, hpOpp + heal);
        log.push({
          turn,
          actor: 'opponent',
          action: 'heal',
          techniqueId: oId,
          techniqueName: oT?.name,
          performerName: oPerf,
          value: heal,
          hpUser,
          hpOpp,
        });
      } else if (oT?.type === 'buff') {
        const shieldGain = Math.round(
          (oT.power ?? 10) * 2.1 + oStats.defense * 0.55 + oStats.speed * 0.22,
        );
        oppBuffShield += Math.max(6, shieldGain);
        log.push({
          turn,
          actor: 'opponent',
          action: 'buff',
          techniqueId: oId,
          techniqueName: oT?.name,
          performerName: oPerf,
          value: shieldGain,
          shieldTotal: oppBuffShield,
          hpUser,
          hpOpp,
        });
      } else if (oT?.type === 'debuff') {
        userDamageTakenMultiplier = 1 + (oT.power ?? 10) / 72;
        log.push({
          turn,
          actor: 'opponent',
          action: 'debuff',
          techniqueId: oId,
          techniqueName: oT?.name,
          performerName: oPerf,
          value: userDamageTakenMultiplier,
          hpUser,
          hpOpp,
        });
        const dmg = this.computeStrikeDamage(
          (oT.power ?? 10) * 0.62,
          oStats.attack,
          oStats.speed,
          userSide.stats.defense,
          userSide.stats.speed,
        );
        applyOpponentDamageToUser(dmg, turn, oId, oT?.name, oPerf);
      } else if (oT?.type === 'movement') {
        oppDodgeNext = true;
        log.push({
          turn,
          actor: 'opponent',
          action: 'movement',
          techniqueId: oId,
          techniqueName: oT?.name,
          performerName: oPerf,
          dodgeNext: true,
          hpUser,
          hpOpp,
        });
      } else {
        let dmg = this.computeStrikeDamage(
          oT.power ?? 10,
          oStats.attack,
          oStats.speed,
          userSide.stats.defense,
          userSide.stats.speed,
        );
        if (userDodgeNext) {
          dmg = Math.max(2, Math.floor(dmg * 0.52));
          userDodgeNext = false;
        }
        applyOpponentDamageToUser(dmg, turn, oId, oT?.name, oPerf);
      }
      if (
        hpUser > 0 &&
        !support.usedEmergencyHeal &&
        support.emergencyHealPercent > 0 &&
        hpUser <= Math.round(maxUser * support.emergencyHealThresholdPercent)
      ) {
        const heal = Math.max(
          1,
          Math.round(maxUser * support.emergencyHealPercent),
        );
        hpUser = Math.min(maxUser, hpUser + heal);
        support.usedEmergencyHeal = true;
        log.push({
          turn,
          actor: 'user',
          action: 'item_heal',
          itemId: 'healing_pill',
          performerName: userSide.sideLabel,
          value: heal,
          hpUser,
          hpOpp,
        });
      }
      if (hpUser <= 0 && !support.usedRevive && support.revivePercent > 0) {
        const heal = Math.max(1, Math.round(maxUser * support.revivePercent));
        hpUser = Math.min(maxUser, heal);
        support.usedRevive = true;
        log.push({
          turn,
          actor: 'user',
          action: 'item_revive',
          itemId: 'resurrection_fragment',
          performerName: userSide.sideLabel,
          value: heal,
          hpUser,
          hpOpp,
        });
      }
      if (hpUser <= 0) break;
    }

    const win =
      hpOpp <= 0
        ? true
        : hpUser <= 0
          ? false
          : hpUser > hpOpp ||
            (hpUser === hpOpp &&
              userSide.stats.speed >= opponentSide.stats.speed);
    return {
      win,
      log,
      final: { hpUser, hpOpp, maxUser, maxOpp },
      supportEffects: {
        consumed: support.consumed,
        shieldLeft: support.shield,
        usedEmergencyHeal: support.usedEmergencyHeal,
        usedRevive: support.usedRevive,
      },
    };
  }

  async getProfileDisciples(userId: string) {
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
      .select(
        'disciples maxDisciples primaryDiscipleCharacterId libraryLevel libraryExp lastTrainingAt combatRating lastBattleAt lastRerollCandidate balance lastWeeklyBattleAt weeklyRating weeklyWins weeklyLosses role dailyBattlesCount dailyBattlesDate',
      )
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');

    const config = await this.getConfig();
    const maxDisciples =
      config.maxDisciples && config.maxDisciples > 0 ? config.maxDisciples : 3;
    const today = getStartOfDayUTC();
    const lastTrainingAt = user.lastTrainingAt
      ? new Date(user.lastTrainingAt)
      : null;
    const canTrain =
      !lastTrainingAt ||
      getStartOfDayUTC(lastTrainingAt).getTime() < today.getTime();
    const maxBattlesPerDay = config.maxBattlesPerDay ?? 5;
    const battlesToday = this.effectiveDailyBattlesCount(user as any);
    const isAdmin = (user as { role?: string }).role === 'admin';
    const canBattle = isAdmin || battlesToday < maxBattlesPerDay;

    const lastWeekly = (user as any).lastWeeklyBattleAt
      ? new Date((user as any).lastWeeklyBattleAt)
      : null;
    const canWeeklyBattle =
      !lastWeekly || Date.now() - lastWeekly.getTime() >= WEEK_MS;
    const nextWeeklyBattleAt = lastWeekly
      ? new Date(lastWeekly.getTime() + WEEK_MS).toISOString()
      : null;
    const weeklyRating = (user as any).weeklyRating ?? 1000;
    const weeklyWins = (user as any).weeklyWins ?? 0;
    const weeklyLosses = (user as any).weeklyLosses ?? 0;

    const disciples = await Promise.all(
      (user.disciples ?? []).map(async (d: any) => {
        const lvl = d.level ?? 1;
        const exp = d.exp ?? 0;
        const expNext = expToNextLevel(lvl);
        const rank = d.rank ?? rankFromLevel(lvl);
        return {
          characterId: d.characterId?._id?.toString(),
          titleId: d.titleId?._id?.toString(),
          name: d.characterId?.name,
          avatar: d.characterId?.avatar,
          titleName: d.titleId?.name,
          recruitedAt: d.recruitedAt,
          inWarehouse: d.inWarehouse === true,
          level: lvl,
          exp,
          expToNext: expNext,
          rank,
          attack: d.attack,
          defense: d.defense,
          speed: d.speed,
          hp: d.hp,
          cp: this.cp(
            { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
            config.cpFormula ?? {
              attack: 1.2,
              defense: 1,
              speed: 0.8,
              hp: 0.3,
            },
          ),
          cardMedia: d.characterId?._id
            ? await this.resolveCardMedia(
                d.characterId._id.toString(),
                lvl,
                userId,
              )
            : null,
        };
      }),
    );

    const u = user as {
      primaryDiscipleCharacterId?: Types.ObjectId | null;
      libraryLevel?: number;
      libraryExp?: number;
    };
    const primaryDiscipleCharacterId =
      u.primaryDiscipleCharacterId?.toString?.() ?? null;
    const libraryLevel = u.libraryLevel ?? 1;
    const libraryExp = u.libraryExp ?? 0;

    return {
      disciples,
      maxDisciples,
      primaryDiscipleCharacterId,
      library: {
        level: libraryLevel,
        exp: libraryExp,
        expToNext: libraryExpToNext(libraryLevel),
      },
      combatRating: user.combatRating ?? 0,
      canTrain,
      canBattle,
      dailyBattlesCount: battlesToday,
      maxBattlesPerDay,
      role: (user as { role?: string }).role,
      weekly: {
        canWeeklyBattle,
        nextWeeklyBattleAt,
        weeklyRating,
        weeklyDivision: divisionFromRating(weeklyRating),
        weeklyWins,
        weeklyLosses,
      },
      balance: user.balance ?? 0,
      rerollCostCoins: config.rerollCostCoins,
      trainCostCoins: config.trainCostCoins,
      characterPool:
        (config as { characterPool?: string }).characterPool ?? 'all',
      lastRerollCandidate: user.lastRerollCandidate ?? null,
    };
  }

  async reroll(userId: string): Promise<{
    candidate: {
      characterId: string;
      titleId: string;
      name: string;
      avatar?: string;
      titleName?: string;
      attack: number;
      defense: number;
      speed: number;
      hp: number;
    };
    balance: number;
  }> {
    const config = await this.getConfig();
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const cost = config.rerollCostCoins ?? 50;
    if ((user.balance ?? 0) < cost) {
      throw new BadRequestException('Недостаточно монет для призыва');
    }

    let characterIds: Types.ObjectId[] = [];
    if (config.characterPool === 'bookmarks' && user.bookmarks?.length) {
      const titleIds = [
        ...new Set(user.bookmarks.map((b) => b.titleId.toString())),
      ];
      const chars = await this.characterModel
        .find({
          titleId: { $in: titleIds.map((id) => new Types.ObjectId(id)) },
          status: CharacterModerationStatus.APPROVED,
        })
        .select('_id')
        .lean()
        .exec();
      characterIds = (chars as { _id: Types.ObjectId }[]).map((c) => c._id);
    }
    if (characterIds.length === 0) {
      const chars = await this.characterModel
        .find({ status: CharacterModerationStatus.APPROVED })
        .select('_id titleId')
        .lean()
        .exec();
      characterIds = (chars as { _id: Types.ObjectId }[]).map((c) => c._id);
    } else if (
      config.characterPool === 'bookmarks' &&
      characterIds.length > 0 &&
      characterIds.length < 28
    ) {
      // Узкий пул закладок — добавляем одобренных из всего каталога, чтобы не «застревать» на 3–5 героях
      const allChars = await this.characterModel
        .find({ status: CharacterModerationStatus.APPROVED })
        .select('_id')
        .lean()
        .exec();
      const seen = new Set(characterIds.map((id) => id.toString()));
      for (const c of allChars as { _id: Types.ObjectId }[]) {
        const s = c._id.toString();
        if (!seen.has(s)) {
          seen.add(s);
          characterIds.push(c._id);
        }
      }
    }
    if (characterIds.length === 0) {
      throw new BadRequestException('Нет доступных персонажей для призыва');
    }

    const existingDiscipleIds = new Set(
      (user.disciples ?? []).map((d: { characterId?: unknown }) => {
        const c = d.characterId;
        if (c == null) return '';
        if (typeof c === 'object' && c !== null && 'toString' in c)
          return (c as { toString(): string }).toString();
        if (typeof c === 'string') return c;
        if (typeof c === 'number' || typeof c === 'boolean') return String(c);
        return '';
      }),
    );
    const available = characterIds.filter(
      (id) => !existingDiscipleIds.has(id.toString()),
    );
    const pool = available.length ? available : characterIds;
    const randomCharId = pool[Math.floor(Math.random() * pool.length)];

    const character = await this.characterModel
      .findById(randomCharId)
      .populate('titleId', 'name')
      .lean()
      .exec();
    if (!character) throw new NotFoundException('Character not found');

    const ranges = config.statRanges ?? {
      attackMin: 5,
      attackMax: 15,
      defenseMin: 5,
      defenseMax: 15,
      speedMin: 3,
      speedMax: 12,
      hpMin: 20,
      hpMax: 50,
    };
    const isMainHero =
      (character as { role?: string }).role === CharacterRole.MAIN;
    const { attack, defense, speed, hp } = this.rollBalancedRecruitStats(
      ranges,
      isMainHero,
    );

    user.balance = (user.balance ?? 0) - cost;
    user.lastRerollCandidate = {
      characterId: (character as any)._id,
      titleId: (character as any).titleId?._id ?? (character as any).titleId,
      attack,
      defense,
      speed,
      hp,
      at: new Date(),
    };
    user.markModified('balance');
    user.markModified('lastRerollCandidate');
    await user.save();

    return {
      candidate: {
        characterId: (character as any)._id.toString(),
        titleId: (
          (character as any).titleId?._id ?? (character as any).titleId
        )?.toString(),
        name: (character as any).name,
        avatar: (character as any).avatar,
        titleName: (character as any).titleId?.name,
        attack,
        defense,
        speed,
        hp,
      },
      balance: user.balance,
    };
  }

  async recruit(
    userId: string,
    characterId: string,
  ): Promise<{ disciples: any[]; balance: number }> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const config = await this.getConfig();

    const candidate = user.lastRerollCandidate;
    if (!candidate)
      throw new BadRequestException('Нет кандидата. Сначала сделайте призыв.');
    const candidateCharId =
      candidate.characterId?.toString?.() ??
      (candidate as any).characterId?.toString();
    if (candidateCharId !== characterId) {
      throw new BadRequestException(
        'Кандидат не совпадает с последним призывом',
      );
    }
    const ttlMs = (config.rerollCandidateTtlMinutes ?? 10) * 60 * 1000;
    if (Date.now() - new Date(candidate.at).getTime() > ttlMs) {
      user.lastRerollCandidate = undefined;
      user.markModified('lastRerollCandidate');
      await user.save();
      throw new BadRequestException('Время действия кандидата истекло');
    }

    const disciples = [...(user.disciples ?? [])];
    const alreadyHas = disciples.some(
      (d: any) =>
        (d.characterId?.toString?.() ?? String(d.characterId)) ===
        (candidate.characterId?.toString?.() ?? String(candidate.characterId)),
    );
    if (alreadyHas) {
      throw new BadRequestException('Этот персонаж уже в отряде');
    }
    const maxActive =
      config.maxDisciples && config.maxDisciples > 0 ? config.maxDisciples : 99;
    const activeRecruitCount = disciples.filter(
      (d: any) => !d.inWarehouse,
    ).length;
    const inWarehouse = activeRecruitCount >= maxActive;
    disciples.push({
      characterId: candidate.characterId,
      titleId: candidate.titleId,
      recruitedAt: new Date(),
      attack: candidate.attack,
      defense: candidate.defense,
      speed: candidate.speed,
      hp: candidate.hp,
      level: 1,
      exp: 0,
      rank: 'F',
      inWarehouse,
    });
    user.disciples = disciples;
    user.lastRerollCandidate = undefined;
    if (!user.primaryDiscipleCharacterId && !inWarehouse) {
      user.primaryDiscipleCharacterId = candidate.characterId;
      user.markModified('primaryDiscipleCharacterId');
    }
    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    let totalCp = 0;
    for (const d of user.disciples) {
      if (d.inWarehouse) continue;
      totalCp += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }
    user.combatRating = Math.round(totalCp);
    user.markModified('disciples');
    user.markModified('lastRerollCandidate');
    user.markModified('combatRating');
    await user.save();

    return {
      disciples: user.disciples,
      balance: user.balance ?? 0,
    };
  }

  async dismiss(userId: string, characterId: string): Promise<void> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const before = user.disciples?.length ?? 0;
    const dismissedWasPrimary =
      user.primaryDiscipleCharacterId?.toString() === characterId;
    user.disciples = (user.disciples ?? []).filter(
      (d: any) =>
        (d.characterId?.toString?.() ?? d.characterId?.toString()) !==
        characterId,
    );
    if (user.disciples.length === before) {
      throw new BadRequestException('Ученик не найден в команде');
    }
    if (dismissedWasPrimary) {
      const lead = this.activeDisciples(user)[0];
      user.primaryDiscipleCharacterId = lead
        ? new Types.ObjectId(this.discipleCharId(lead))
        : null;
      user.markModified('primaryDiscipleCharacterId');
    }
    const config = await this.getConfig();
    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    let totalCp = 0;
    for (const d of user.disciples) {
      if (d.inWarehouse) continue;
      totalCp += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }
    user.combatRating = Math.round(totalCp);
    user.markModified('disciples');
    user.markModified('combatRating');
    await user.save();
  }

  async train(
    userId: string,
    characterId: string,
  ): Promise<{ disciple: any; balance: number; outcome: 'success' | 'fail' }> {
    const config = await this.getConfig();
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const today = getStartOfDayUTC();
    const lastTrainingAt = user.lastTrainingAt
      ? new Date(user.lastTrainingAt)
      : null;
    if (
      lastTrainingAt &&
      getStartOfDayUTC(lastTrainingAt).getTime() >= today.getTime()
    ) {
      throw new BadRequestException('Тренировка уже использована сегодня');
    }
    const cost = config.trainCostCoins ?? 15;
    if ((user.balance ?? 0) < cost)
      throw new BadRequestException('Недостаточно монет');

    const disciple = (user.disciples ?? []).find(
      (d: any) =>
        (d.characterId?.toString?.() ?? d.characterId?.toString()) ===
        characterId,
    );
    if (!disciple) throw new BadRequestException('Ученик не найден');

    // Редкий провал: монеты и дневной слот тратятся, статы не растут
    const failChance = 0.03;
    const failed = Math.random() < failChance;

    const cap = config.statCap ?? 50;
    type StatKey = 'attack' | 'defense' | 'speed' | 'hp';
    const d = disciple as {
      attack: number;
      defense: number;
      speed: number;
      hp: number;
      level?: number;
      exp?: number;
      rank?: string;
    };
    if (!failed) {
      const stats: StatKey[] = ['attack', 'defense', 'speed', 'hp'];
      const sortedByWeakest = [...stats].sort(
        (a, b) => (d[a] ?? 0) - (d[b] ?? 0),
      );
      const roll = Math.random();
      const bump = (k: StatKey, delta: number) => {
        d[k] = Math.min(cap, Math.max(1, (d[k] ?? 0) + delta));
      };
      if (roll < 0.55) {
        const k = sortedByWeakest[0];
        bump(k, roll < 0.2 ? 2 : 1);
      } else if (roll < 0.82) {
        bump(sortedByWeakest[0], 1);
        bump(sortedByWeakest[1], 1);
      } else {
        const k = sortedByWeakest[Math.floor(Math.random() * 2)];
        bump(k, 2);
      }
    }

    const lvl = Math.max(1, d.level ?? 1);
    const expGain = 7 + Math.floor(lvl * 0.35) + Math.floor(Math.random() * 6);
    this.applyGameExpToUser(user, expGain, 'all', TRAINING_PRIMARY_EXP_SHARE);

    user.balance = (user.balance ?? 0) - cost;
    user.lastTrainingAt = new Date();
    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    let totalCp = 0;
    for (const d of user.disciples) {
      if (d.inWarehouse) continue;
      totalCp += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }
    user.combatRating = Math.round(totalCp);
    user.markModified('disciples');
    user.markModified('balance');
    user.markModified('lastTrainingAt');
    user.markModified('combatRating');
    await user.save();

    return {
      disciple,
      balance: user.balance,
      outcome: failed ? 'fail' : 'success',
    };
  }

  /** Генерирует статы одного ученика-бота по рейтингу (CP ≈ rating). */
  private getBotDiscipleStats(rating: number): {
    attack: number;
    defense: number;
    speed: number;
    hp: number;
  } {
    const cp = Math.max(30, rating);
    const a = Math.max(5, Math.round(cp / 3.3));
    return {
      attack: a + Math.floor(Math.random() * 5) - 2,
      defense: a + Math.floor(Math.random() * 5) - 2,
      speed: Math.max(3, a - 2 + Math.floor(Math.random() * 4)),
      hp: Math.max(15, a * 2 + Math.floor(Math.random() * 10) - 5),
    };
  }

  /** Ученики в бою: реальные статы + имя + экипировка техник */
  private buildBattleRosterMember(
    d: Disciple,
    displayName: string,
  ): {
    characterId: string;
    displayName: string;
    attack: number;
    defense: number;
    speed: number;
    hp: number;
    level: number;
    techniquesEquipped: string[];
  } {
    return {
      characterId: this.discipleCharId(d),
      displayName,
      attack: Math.max(1, d.attack ?? 1),
      defense: Math.max(1, d.defense ?? 1),
      speed: Math.max(1, d.speed ?? 1),
      hp: Math.max(5, d.hp ?? 10),
      level: Math.max(1, d.level ?? 1),
      techniquesEquipped: [...(d.techniquesEquipped ?? [])],
    };
  }

  private async enrichBattleRosterFromDisciples(disciples: Disciple[]): Promise<
    Array<{
      characterId: string;
      displayName: string;
      attack: number;
      defense: number;
      speed: number;
      hp: number;
      level: number;
      techniquesEquipped: string[];
    }>
  > {
    if (!disciples.length) return [];
    const ids = disciples
      .map((d) => d.characterId)
      .filter(Boolean)
      .map((c) =>
        typeof c === 'object' && c !== null && '_id' in c
          ? c
          : new Types.ObjectId(
              typeof c === 'object' && c !== null && 'toString' in c
                ? (c as { toString(): string }).toString()
                : String(c),
            ),
      );
    const chars = ids.length
      ? await this.characterModel
          .find({ _id: { $in: ids } })
          .select('name')
          .lean()
          .exec()
      : [];
    const nameById = new Map(
      (chars as { _id: Types.ObjectId; name?: string }[]).map((c) => [
        c._id.toString(),
        c.name ?? 'Ученик',
      ]),
    );
    return disciples.map((d) => {
      const cid = this.discipleCharId(d);
      return this.buildBattleRosterMember(d, nameById.get(cid) ?? 'Ученик');
    });
  }

  private aggregateSquadCombatStats(
    members: Array<{
      attack: number;
      defense: number;
      speed: number;
      hp: number;
    }>,
  ): {
    attack: number;
    defense: number;
    speed: number;
    hpSum: number;
    maxHpPool: number;
  } {
    let attack = 0;
    let defense = 0;
    let speed = 0;
    let hpSum = 0;
    for (const m of members) {
      attack += m.attack;
      defense += m.defense;
      speed += m.speed;
      hpSum += m.hp;
    }
    const maxHpPool = Math.max(
      140,
      Math.round(hpSum * 5.2 + defense * 3.8 + attack * 1.1),
    );
    return { attack, defense, speed, hpSum, maxHpPool };
  }

  private characterTitleIdStr(doc: { titleId?: unknown }): string {
    const t = doc?.titleId;
    if (t == null) return '';
    if (t instanceof Types.ObjectId) return t.toString();
    if (typeof t === 'object' && t !== null && '_id' in t) {
      const id = (t as { _id: Types.ObjectId })._id;
      return id instanceof Types.ObjectId ? id.toString() : String(id);
    }
    if (typeof t === 'string' || typeof t === 'number') return String(t);
    return '';
  }

  private async loadCharacterSynergyMeta(
    characterObjectIds: Types.ObjectId[],
  ): Promise<Map<string, { role: string; titleId: string }>> {
    const unique = [
      ...new Map(characterObjectIds.map((id) => [id.toString(), id])).values(),
    ];
    if (!unique.length) return new Map();
    const chars = await this.characterModel
      .find({ _id: { $in: unique } })
      .select('role titleId')
      .lean()
      .exec();
    const map = new Map<string, { role: string; titleId: string }>();
    for (const c of chars as {
      _id: Types.ObjectId;
      role?: string;
      titleId?: unknown;
    }[]) {
      map.set(c._id.toString(), {
        role: c.role ?? CharacterRole.OTHER,
        titleId: this.characterTitleIdStr({ titleId: c.titleId }),
      });
    }
    return map;
  }

  /**
   * Синергия активного отряда из ровно трёх учеников (роли и тайтл из карточек персонажей).
   * Множители перемножаются, если сработало несколько условий.
   */
  private computeSquadSynergy(
    active: Disciple[],
    metaByCharId: Map<string, { role: string; titleId: string }>,
  ): {
    mult: { attack: number; defense: number; speed: number; hp: number };
    labels: string[];
  } {
    const labels: string[] = [];
    let attack = 1;
    let defense = 1;
    let speed = 1;
    let hp = 1;
    if (active.length !== SQUAD_SYNERGY_ROSTER_SIZE) {
      return { mult: { attack, defense, speed, hp }, labels };
    }
    const metas: { role: string; titleId: string }[] = [];
    for (const d of active) {
      const cid = this.discipleCharId(d);
      const m = metaByCharId.get(cid);
      if (!m) {
        return {
          mult: { attack: 1, defense: 1, speed: 1, hp: 1 },
          labels: [],
        };
      }
      metas.push(m);
    }
    const sameTitle =
      Boolean(metas[0].titleId) &&
      metas.every((m) => m.titleId === metas[0].titleId);
    const allAntag = metas.every((m) => m.role === 'antagonist');
    const allMain = metas.every((m) => m.role === 'main');

    if (sameTitle) {
      attack *= SYNERGY_SAME_TITLE.attack;
      defense *= SYNERGY_SAME_TITLE.defense;
      speed *= SYNERGY_SAME_TITLE.speed;
      hp *= SYNERGY_SAME_TITLE.hp;
      labels.push('Единый тайтл');
    }
    if (allAntag) {
      attack *= SYNERGY_ALL_ANTAGONIST.attack;
      defense *= SYNERGY_ALL_ANTAGONIST.defense;
      speed *= SYNERGY_ALL_ANTAGONIST.speed;
      hp *= SYNERGY_ALL_ANTAGONIST.hp;
      labels.push('Три антагониста');
    }
    if (allMain) {
      attack *= SYNERGY_ALL_MAIN.attack;
      defense *= SYNERGY_ALL_MAIN.defense;
      speed *= SYNERGY_ALL_MAIN.speed;
      hp *= SYNERGY_ALL_MAIN.hp;
      labels.push('Три главных героя');
    }
    return { mult: { attack, defense, speed, hp }, labels };
  }

  private applySynergyToAggregatedStats(
    agg: {
      attack: number;
      defense: number;
      speed: number;
      hpSum: number;
      maxHpPool: number;
    },
    mult: { attack: number; defense: number; speed: number; hp: number },
  ): {
    attack: number;
    defense: number;
    speed: number;
    hpSum: number;
    maxHpPool: number;
  } {
    const attack = Math.max(1, Math.round(agg.attack * mult.attack));
    const defense = Math.max(1, Math.round(agg.defense * mult.defense));
    const speed = Math.max(1, Math.round(agg.speed * mult.speed));
    const hpSum = Math.max(5, Math.round(agg.hpSum * mult.hp));
    const maxHpPool = Math.max(
      140,
      Math.round(hpSum * 5.2 + defense * 3.8 + attack * 1.1),
    );
    return { attack, defense, speed, hpSum, maxHpPool };
  }

  /** Те же множители синергии, что и у суммарных статов — для покомпонентных статов в бою */
  private scaleRosterStatsWithSynergy<
    T extends {
      attack: number;
      defense: number;
      speed: number;
      hp: number;
    },
  >(
    roster: T[],
    mult: { attack: number; defense: number; speed: number; hp: number },
  ): T[] {
    if (
      mult.attack === 1 &&
      mult.defense === 1 &&
      mult.speed === 1 &&
      mult.hp === 1
    ) {
      return roster;
    }
    return roster.map((m) => ({
      ...m,
      attack: Math.max(1, Math.round(m.attack * mult.attack)),
      defense: Math.max(1, Math.round(m.defense * mult.defense)),
      speed: Math.max(1, Math.round(m.speed * mult.speed)),
      hp: Math.max(5, Math.round(m.hp * mult.hp)),
    }));
  }

  /**
   * Кто бьёт/лечит этой техникой и с какими личными статами (все ученики участвуют по очереди/случайно при дублях).
   */
  private resolvePerformerForTechnique(
    side: {
      stats: {
        attack: number;
        defense: number;
        speed: number;
        hp: number;
        maxHpPool: number;
      };
      roster?: Array<{
        characterId: string;
        displayName: string;
        attack: number;
        defense: number;
        speed: number;
        hp: number;
        techniquesEquipped: string[];
      }>;
      techniqueOwners: Map<
        string,
        { displayName: string; characterId: string }
      >;
      sideLabel: string;
    },
    techId: string,
  ): {
    stats: {
      attack: number;
      defense: number;
      speed: number;
      hp: number;
    };
    displayName: string;
  } {
    let candidates =
      (side.roster ?? []).filter((m) =>
        (m.techniquesEquipped ?? []).includes(techId),
      ) ?? [];
    if (
      candidates.length === 0 &&
      techId === 'basic_strike' &&
      (side.roster?.length ?? 0) > 0
    ) {
      candidates = [...(side.roster ?? [])];
    }
    if (candidates.length > 0) {
      const m =
        candidates[Math.floor(Math.random() * candidates.length)] ??
        candidates[0];
      return {
        stats: {
          attack: m.attack,
          defense: m.defense,
          speed: m.speed,
          hp: m.hp,
        },
        displayName: m.displayName,
      };
    }
    const fb = side.techniqueOwners.get(techId);
    if (fb && side.roster?.length) {
      const m = side.roster.find((x) => x.characterId === fb.characterId);
      if (m) {
        return {
          stats: {
            attack: m.attack,
            defense: m.defense,
            speed: m.speed,
            hp: m.hp,
          },
          displayName: m.displayName,
        };
      }
    }
    return {
      stats: {
        attack: side.stats.attack,
        defense: side.stats.defense,
        speed: side.stats.speed,
        hp: side.stats.hp,
      },
      displayName: side.sideLabel,
    };
  }

  private buildTechniqueOwnerMap(
    members: Array<{
      displayName: string;
      characterId: string;
      techniquesEquipped: string[];
    }>,
  ): Map<string, { displayName: string; characterId: string }> {
    const map = new Map<string, { displayName: string; characterId: string }>();
    for (const m of members) {
      for (const tid of m.techniquesEquipped ?? []) {
        if (tid && !map.has(tid)) {
          map.set(tid, {
            displayName: m.displayName,
            characterId: m.characterId,
          });
        }
      }
    }
    return map;
  }

  private rosterLine(
    members: Array<{ displayName: string; level: number }>,
  ): string {
    return members.map((m) => `${m.displayName} (ур.${m.level})`).join(' · ');
  }

  /** Отряд бота: размер как у игрока, суммарная сила около targetCp */
  private buildBotBattleRoster(
    targetTotalCp: number,
    formula: { attack: number; defense: number; speed: number; hp: number },
    mirrorSize: number,
    mode: 'casual' | 'weekly',
  ): Array<{
    characterId: string;
    displayName: string;
    attack: number;
    defense: number;
    speed: number;
    hp: number;
    level: number;
    techniquesEquipped: string[];
  }> {
    const n = Math.max(1, Math.min(3, mirrorSize));
    const target = Math.max(
      45,
      Math.round(
        targetTotalCp *
          (mode === 'weekly'
            ? 0.98 + Math.random() * 0.12
            : 0.85 + Math.random() * 0.28),
      ),
    );
    const namesCasual = ['Бродячий боец', 'Странник ци', 'Наёмник'];
    const namesWeekly = ['Страж арены', 'Ветеран схваток', 'Элитный рейдер'];
    const names = mode === 'weekly' ? namesWeekly : namesCasual;
    const kits = [
      ['basic_strike', 'flame_palm', 'iron_skin'],
      ['basic_strike', 'swift_step', 'ice_needle'],
      ['basic_strike', 'thunder_fist', 'vitality_stream'],
    ];
    const roster: Array<{
      characterId: string;
      displayName: string;
      attack: number;
      defense: number;
      speed: number;
      hp: number;
      level: number;
      techniquesEquipped: string[];
    }> = [];
    let cpAcc = 0;
    for (let i = 0; i < n; i++) {
      const chunk = Math.max(
        28,
        Math.round((target / n) * (0.86 + Math.random() * 0.28)),
      );
      const st = this.getBotDiscipleStats(chunk);
      const lvl =
        mode === 'weekly'
          ? 14 + Math.floor(Math.random() * 20)
          : 4 + Math.floor(Math.random() * 14);
      roster.push({
        characterId: `bot:fighter:${mode}:${i}`,
        displayName: names[i % names.length],
        attack: st.attack,
        defense: st.defense,
        speed: st.speed,
        hp: st.hp,
        level: lvl,
        techniquesEquipped: [...(kits[i % kits.length] ?? ['basic_strike'])],
      });
      cpAcc += this.cp(st, formula);
    }
    if (cpAcc > 0 && target > 0) {
      const scale = Math.min(1.35, Math.max(0.75, target / cpAcc));
      if (Math.abs(scale - 1) > 0.04) {
        for (const m of roster) {
          m.attack = Math.max(3, Math.round(m.attack * scale));
          m.defense = Math.max(3, Math.round(m.defense * scale));
          m.speed = Math.max(2, Math.round(m.speed * scale));
          m.hp = Math.max(8, Math.round(m.hp * scale));
        }
      }
    }
    return roster;
  }

  /** Урон с учётом атаки/защиты/скорости сторон */
  private computeStrikeDamage(
    power: number,
    attackerAtk: number,
    attackerSpd: number,
    defenderDef: number,
    defenderSpd: number,
  ): number {
    const raw =
      power * (1 + attackerAtk / 50) + attackerAtk * 0.46 + attackerSpd * 0.16;
    const armor = defenderDef * 0.5 + defenderSpd * 0.32;
    return Math.max(2, Math.round(raw * (100 / (100 + armor))));
  }

  async battleMatch(
    userId: string,
  ): Promise<{ opponent: any; combatRating: number; isBot?: boolean } | null> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('combatRating disciples')
      .lean()
      .exec();
    const hasActiveBattle = (user?.disciples ?? []).some(
      (d: any) => !d.inWarehouse,
    );
    if (!user || !hasActiveBattle) return null;

    const rating = user.combatRating ?? 0;
    const delta = Math.max(20, Math.floor(rating * 0.15));
    const matchFilter = {
      _id: { $ne: new Types.ObjectId(userId) },
      'disciples.0': { $exists: true },
      combatRating: { $gte: rating - delta, $lte: rating + delta },
    } as const;

    // Рандомизируем противников (иначе Mongo вернёт «первого» и он будет повторяться).
    // При небольшом онлайне всё равно возможны повторы, но не «вечно один и тот же».
    const candidatesCount = await this.userModel
      .countDocuments(matchFilter as any)
      .exec();
    const skip =
      candidatesCount > 1 ? Math.floor(Math.random() * candidatesCount) : 0;
    const opponent = await this.userModel
      .findOne(matchFilter as any)
      .select('username avatar combatRating disciples')
      .skip(skip)
      .lean()
      .exec();

    if (opponent) {
      // В матчмейкинге нужны имена/аватары учеников, иначе на фронте виден только уровень.
      const oppPop = await this.userModel
        .findById((opponent as any)._id)
        .populate([
          {
            path: 'disciples.characterId',
            model: 'Character',
            select: 'name avatar',
          },
          { path: 'disciples.titleId', model: 'Title', select: 'name' },
        ])
        .select('username avatar combatRating disciples')
        .lean()
        .exec();

      const src = (oppPop ?? opponent) as any;
      return {
        opponent: {
          userId: src._id.toString(),
          username: src.username,
          avatar: src.avatar,
          combatRating: src.combatRating,
          disciples: (src.disciples ?? []).map((d: any) => ({
            characterId:
              d.characterId?._id?.toString?.() ??
              d.characterId?.toString?.() ??
              null,
            name: d.characterId?.name ?? d.name,
            titleName: d.titleId?.name ?? d.titleName,
            level: d.level,
            rank: d.rank,
            avatar: d.characterId?.avatar ?? d.avatar,
            attack: d.attack,
            defense: d.defense,
            speed: d.speed,
            hp: d.hp,
            cardMedia: d.cardMedia ?? null,
          })),
        },
        combatRating: src.combatRating,
      };
    }

    const botStats = this.getBotDiscipleStats(rating);
    return {
      opponent: {
        userId: 'bot:casual',
        username: 'Бот',
        avatar: null,
        combatRating: rating,
        disciples: [
          { ...botStats, name: 'Бродячий соперник', rank: 'E', level: 8 },
        ],
      },
      combatRating: rating,
      isBot: true,
    };
  }

  async battle(
    userId: string,
    opponentUserId: string,
    supportItemIds: string[] = [],
  ): Promise<{
    win: boolean;
    coinsGained: number;
    expGained?: number;
    consumedItems?: {
      itemId: string;
      count: number;
      name?: string;
      icon?: string;
    }[];
    resultScreen?: {
      outcome: string;
      outcomeReason?: string;
      userTeamCp?: number;
      opponentTeamCp?: number;
      teams?: {
        user?: Array<{
          name: string;
          level: number;
          characterId?: string;
          cardMedia?: {
            mediaUrl?: string;
            mediaType?: string;
            label?: string;
          } | null;
        }>;
        opponent?: Array<{
          name: string;
          level: number;
          characterId?: string;
          cardMedia?: {
            mediaUrl?: string;
            mediaType?: string;
            label?: string;
          } | null;
        }>;
      };
      userCard: unknown;
      opponentCard: unknown;
      battleLog: unknown;
      hp: unknown;
      supportEffects?: unknown;
      squadSynergy?: {
        user: { labels: string[] };
        opponent: { labels: string[] };
      };
    };
  }> {
    const config = await this.getConfig();
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    if (this.activeDisciples(user).length === 0) {
      throw new BadRequestException(
        'Нужен хотя бы один ученик в активном отряде',
      );
    }

    // Проверка ограничения боев в день (3 для обычных пользователей, безлимит для админов)
    this.checkAndIncrementDailyBattles(user, config);

    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    const supportState = await this.consumeBattleSupportItems(
      userId,
      user.inventory as Array<{ itemId?: string; count?: number }> | undefined,
      supportItemIds,
    );
    let cpUser = 0;
    for (const d of this.activeDisciples(user)) {
      cpUser += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }

    const userActive = this.activeDisciples(user);
    const userRoster = await this.enrichBattleRosterFromDisciples(userActive);
    let userAgg = this.aggregateSquadCombatStats(userRoster);
    const userSynergyMeta = await this.loadCharacterSynergyMeta(
      userActive.map((d) => new Types.ObjectId(this.discipleCharId(d))),
    );
    const userSynergy = this.computeSquadSynergy(userActive, userSynergyMeta);
    userAgg = this.applySynergyToAggregatedStats(userAgg, userSynergy.mult);
    const userTechniqueOwners = this.buildTechniqueOwnerMap(userRoster);
    const userRosterLineStr = this.rosterLine(userRoster);
    const userEquipped = userRoster.flatMap((m) => m.techniquesEquipped ?? []);

    const isBot =
      opponentUserId === 'bot:casual' || opponentUserId?.startsWith?.('bot:');
    let oppRosterMembers: Array<{
      characterId: string;
      displayName: string;
      level: number;
      attack: number;
      defense: number;
      speed: number;
      hp: number;
      techniquesEquipped: string[];
    }> = [];
    let oppEquipped: string[];
    let oppCard: unknown = null;
    let oppAgg: {
      attack: number;
      defense: number;
      speed: number;
      hpSum: number;
      maxHpPool: number;
    };
    let oppTechniqueOwners: Map<
      string,
      { displayName: string; characterId: string }
    >;
    let oppRosterLineStr: string;
    let oppCharacterId = '';
    let oppSynergy: {
      mult: { attack: number; defense: number; speed: number; hp: number };
      labels: string[];
    } = {
      mult: { attack: 1, defense: 1, speed: 1, hp: 1 },
      labels: [],
    };

    if (isBot) {
      const oppRoster = this.buildBotBattleRoster(
        cpUser,
        formula,
        userRoster.length,
        'casual',
      );
      oppRosterMembers = oppRoster;
      oppEquipped = oppRoster.flatMap((m) => m.techniquesEquipped ?? []);
      oppAgg = this.aggregateSquadCombatStats(oppRoster);
      oppTechniqueOwners = this.buildTechniqueOwnerMap(oppRoster);
      oppRosterLineStr = this.rosterLine(oppRoster);
    } else {
      const opponent = await this.userModel.findById(
        new Types.ObjectId(opponentUserId),
      );
      if (!opponent) throw new NotFoundException('Противник не найден');
      const oppActive = this.activeDisciples(opponent);
      if (oppActive.length === 0) {
        throw new BadRequestException(
          'У противника нет учеников в активном отряде',
        );
      }
      const oppRoster = await this.enrichBattleRosterFromDisciples(oppActive);
      oppRosterMembers = oppRoster;
      oppEquipped = oppRoster.flatMap((m) => m.techniquesEquipped ?? []);
      oppAgg = this.aggregateSquadCombatStats(oppRoster);
      const oppSynergyMeta = await this.loadCharacterSynergyMeta(
        oppActive.map((d) => new Types.ObjectId(this.discipleCharId(d))),
      );
      oppSynergy = this.computeSquadSynergy(oppActive, oppSynergyMeta);
      oppAgg = this.applySynergyToAggregatedStats(oppAgg, oppSynergy.mult);
      oppTechniqueOwners = this.buildTechniqueOwnerMap(oppRoster);
      oppRosterLineStr = this.rosterLine(oppRoster);
      const oppLead = this.getLeadActiveDisciple(opponent);
      oppCharacterId = oppLead ? this.discipleCharId(oppLead) : '';
      oppCard = oppLead?.characterId
        ? await this.resolveCardMedia(
            this.discipleCharId(oppLead),
            (oppLead as { level?: number }).level ?? 1,
            opponentUserId,
          )
        : null;
    }

    const lead = this.getLeadActiveDisciple(user);
    const userRosterBattle = this.scaleRosterStatsWithSynergy(
      userRoster,
      userSynergy.mult,
    );
    const oppRosterBattle = isBot
      ? oppRosterMembers
      : this.scaleRosterStatsWithSynergy(oppRosterMembers, oppSynergy.mult);
    const sim = await this.simulateBattleWithTechniques(
      {
        characterId: lead ? this.discipleCharId(lead) : '',
        equipped: userEquipped,
        stats: {
          attack: userAgg.attack,
          defense: userAgg.defense,
          speed: userAgg.speed,
          hp: userAgg.hpSum,
          maxHpPool: userAgg.maxHpPool,
        },
        roster: userRosterBattle.map((m) => ({
          characterId: m.characterId,
          displayName: m.displayName,
          attack: m.attack,
          defense: m.defense,
          speed: m.speed,
          hp: m.hp,
          techniquesEquipped: m.techniquesEquipped ?? [],
        })),
        rosterLine: userRosterLineStr,
        techniqueOwners: userTechniqueOwners,
        sideLabel: 'Ваш отряд',
      },
      {
        characterId: oppCharacterId,
        equipped: oppEquipped,
        stats: {
          attack: oppAgg.attack,
          defense: oppAgg.defense,
          speed: oppAgg.speed,
          hp: oppAgg.hpSum,
          maxHpPool: oppAgg.maxHpPool,
        },
        roster: oppRosterBattle.map((m) => ({
          characterId: m.characterId,
          displayName: m.displayName,
          attack: m.attack,
          defense: m.defense,
          speed: m.speed,
          hp: m.hp,
          techniquesEquipped: m.techniquesEquipped ?? [],
        })),
        rosterLine: oppRosterLineStr,
        techniqueOwners: oppTechniqueOwners,
        sideLabel: isBot ? 'Отряд бота' : 'Отряд противника',
      },
      supportState,
    );

    const win = sim.win;

    const coinsWin = 18 + Math.min(35, Math.floor(cpUser / 45));
    const coinsLoss = 6 + Math.min(12, Math.floor(cpUser / 120));
    const coinsGained = win ? coinsWin : coinsLoss;
    user.balance = (user.balance ?? 0) + coinsGained;
    user.lastBattleAt = new Date();
    const battleExp = win ? 12 : 4;
    this.applyGameExpToUser(user, battleExp, 'active', GAME_PRIMARY_EXP_SHARE);
    user.markModified('balance');
    user.markModified('lastBattleAt');
    user.markModified('disciples');
    await user.save();

    const userCard = lead?.characterId
      ? await this.resolveCardMedia(
          this.discipleCharId(lead),
          (lead as { level?: number }).level ?? 1,
          userId,
        )
      : null;

    const fin = sim.final as {
      hpUser: number;
      hpOpp: number;
      maxUser: number;
      maxOpp: number;
    };
    const outcomeReason = win
      ? fin.hpOpp <= 0
        ? 'Противник потерял все очки здоровья.'
        : fin.hpUser > fin.hpOpp
          ? 'Лимит ходов исчерпан — у вашего отряда больше ОЗ.'
          : 'Равные ОЗ после последнего хода — зачтена победа по скорости отряда.'
      : fin.hpUser <= 0
        ? 'Ваш отряд потерял все очки здоровья.'
        : fin.hpUser < fin.hpOpp
          ? 'Лимит ходов исчерпан — у противника больше ОЗ.'
          : 'Равные ОЗ после последнего хода — поражение по скорости отряда.';

    const opponentTeamCp = Math.round(
      oppRosterMembers.reduce(
        (acc, m) =>
          acc +
          this.cp(
            { attack: m.attack, defense: m.defense, speed: m.speed, hp: m.hp },
            formula,
          ),
        0,
      ),
    );

    return {
      win,
      coinsGained,
      expGained: battleExp,
      consumedItems: supportState.consumed,
      resultScreen: {
        outcome: win ? 'win' : 'lose',
        outcomeReason,
        userTeamCp: Math.round(cpUser),
        opponentTeamCp,
        teams: {
          user: await this.teamsForResultScreen(userRoster, userId),
          opponent: await this.teamsForResultScreen(
            oppRosterMembers,
            isBot ? undefined : opponentUserId,
          ),
        },
        userCard,
        opponentCard: oppCard,
        battleLog: sim.log,
        hp: sim.final,
        supportEffects: sim.supportEffects,
        squadSynergy: {
          user: { labels: userSynergy.labels },
          opponent: { labels: oppSynergy.labels },
        },
      },
    };
  }

  async weeklyBattleMatch(userId: string): Promise<{
    opponent: {
      userId: string;
      username: string;
      avatar?: string | null;
      weeklyRating?: number;
      disciples: unknown[];
    };
    weekly: {
      canWeeklyBattle: boolean;
      nextWeeklyBattleAt: string | null;
      weeklyRating?: number;
      weeklyDivision?: string;
    };
    isBot?: boolean;
  } | null> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('disciples lastWeeklyBattleAt weeklyRating')
      .lean()
      .exec();
    const hasActiveWeekly = (user?.disciples ?? []).some(
      (d: any) => !d.inWarehouse,
    );
    if (!user || !hasActiveWeekly) return null;

    const lastWeekly = (user as any).lastWeeklyBattleAt
      ? new Date((user as any).lastWeeklyBattleAt)
      : null;
    const canWeekly =
      !lastWeekly || Date.now() - lastWeekly.getTime() >= WEEK_MS;
    if (!canWeekly) return null;

    const rating = (user as any).weeklyRating ?? 1000;
    const delta = Math.max(50, Math.floor(rating * 0.1));
    const matchFilter = {
      _id: { $ne: new Types.ObjectId(userId) },
      'disciples.0': { $exists: true },
      $or: [
        { weeklyRating: { $exists: false } },
        { weeklyRating: { $gte: rating - delta, $lte: rating + delta } },
      ],
    } as const;

    const candidatesCount = await this.userModel
      .countDocuments(matchFilter as any)
      .exec();
    const skip =
      candidatesCount > 1 ? Math.floor(Math.random() * candidatesCount) : 0;
    const opponent = await this.userModel
      .findOne(matchFilter as any)
      .select('username avatar weeklyRating disciples')
      .skip(skip)
      .lean()
      .exec();

    if (opponent) {
      const oppRating = (opponent as any).weeklyRating ?? 1000;
      const oppPop = await this.userModel
        .findById((opponent as any)._id)
        .populate([
          {
            path: 'disciples.characterId',
            model: 'Character',
            select: 'name avatar',
          },
          { path: 'disciples.titleId', model: 'Title', select: 'name' },
        ])
        .select('username avatar weeklyRating disciples')
        .lean()
        .exec();
      const src = (oppPop ?? opponent) as any;
      return {
        opponent: {
          userId: src._id.toString(),
          username: src.username,
          avatar: src.avatar,
          weeklyRating: oppRating,
          disciples: (src.disciples ?? []).map((d: any) => ({
            characterId:
              d.characterId?._id?.toString?.() ??
              d.characterId?.toString?.() ??
              null,
            name: d.characterId?.name ?? d.name,
            titleName: d.titleId?.name ?? d.titleName,
            level: d.level,
            rank: d.rank,
            avatar: d.characterId?.avatar ?? d.avatar,
            attack: d.attack,
            defense: d.defense,
            speed: d.speed,
            hp: d.hp,
            cardMedia: d.cardMedia ?? null,
          })),
        },
        weekly: {
          canWeeklyBattle: true,
          nextWeeklyBattleAt: null,
          weeklyRating: rating,
          weeklyDivision: divisionFromRating(rating),
        },
      };
    }

    const botStats = this.getBotDiscipleStats(rating);
    return {
      opponent: {
        userId: 'bot:weekly',
        username: 'Бот',
        avatar: null,
        weeklyRating: rating,
        disciples: [
          { ...botStats, name: 'Недельный чемпион-бот', rank: 'B', level: 22 },
        ],
      },
      weekly: {
        canWeeklyBattle: true,
        nextWeeklyBattleAt: null,
        weeklyRating: rating,
        weeklyDivision: divisionFromRating(rating),
      },
      isBot: true,
    };
  }

  async weeklyBattle(
    userId: string,
    opponentUserId: string,
    supportItemIds: string[] = [],
  ): Promise<{
    win: boolean;
    coinsGained: number;
    expGained?: number;
    weeklyRatingDelta?: number;
    consumedItems?: {
      itemId: string;
      count: number;
      name?: string;
      icon?: string;
    }[];
    resultScreen?: {
      outcome: string;
      outcomeReason?: string;
      userTeamCp?: number;
      opponentTeamCp?: number;
      teams?: {
        user?: Array<{
          name: string;
          level: number;
          characterId?: string;
          cardMedia?: {
            mediaUrl?: string;
            mediaType?: string;
            label?: string;
          } | null;
        }>;
        opponent?: Array<{
          name: string;
          level: number;
          characterId?: string;
          cardMedia?: {
            mediaUrl?: string;
            mediaType?: string;
            label?: string;
          } | null;
        }>;
      };
      userCard: unknown;
      opponentCard: unknown;
      battleLog: unknown;
      hp: unknown;
      supportEffects?: unknown;
      squadSynergy?: {
        user: { labels: string[] };
        opponent: { labels: string[] };
      };
    };
  }> {
    const config = await this.getConfig();
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    if (this.activeDisciples(user).length === 0) {
      throw new BadRequestException(
        'Нужен хотя бы один ученик в активном отряде',
      );
    }

    // Админы могут сражаться без ограничений по времени
    if (user.role !== 'admin') {
      const lastWeekly = user.lastWeeklyBattleAt
        ? new Date(user.lastWeeklyBattleAt)
        : null;
      if (lastWeekly && Date.now() - lastWeekly.getTime() < WEEK_MS) {
        throw new BadRequestException(
          'Недельная схватка уже состоялась. Доступна только 1 раз в неделю.',
        );
      }
    }

    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    const supportState = await this.consumeBattleSupportItems(
      userId,
      user.inventory as Array<{ itemId?: string; count?: number }> | undefined,
      supportItemIds,
    );
    let cpUser = 0;
    for (const d of this.activeDisciples(user)) {
      cpUser += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }

    const userActiveW = this.activeDisciples(user);
    const userRosterW = await this.enrichBattleRosterFromDisciples(userActiveW);
    let userAggW = this.aggregateSquadCombatStats(userRosterW);
    const userSynergyMetaW = await this.loadCharacterSynergyMeta(
      userActiveW.map((d) => new Types.ObjectId(this.discipleCharId(d))),
    );
    const userSynergyW = this.computeSquadSynergy(
      userActiveW,
      userSynergyMetaW,
    );
    userAggW = this.applySynergyToAggregatedStats(userAggW, userSynergyW.mult);
    const userTechniqueOwnersW = this.buildTechniqueOwnerMap(userRosterW);
    const userRosterLineW = this.rosterLine(userRosterW);
    const userEquipped = userRosterW.flatMap((m) => m.techniquesEquipped ?? []);

    const isBot =
      opponentUserId === 'bot:weekly' || opponentUserId?.startsWith?.('bot:');
    let oppRosterMembersW: Array<{
      characterId: string;
      displayName: string;
      level: number;
      attack: number;
      defense: number;
      speed: number;
      hp: number;
      techniquesEquipped: string[];
    }> = [];
    let oppRating: number;
    let oppEquipped: string[] = [];
    let oppCard: unknown = null;
    let oppAggW: {
      attack: number;
      defense: number;
      speed: number;
      hpSum: number;
      maxHpPool: number;
    };
    let oppTechniqueOwnersW: Map<
      string,
      { displayName: string; characterId: string }
    >;
    let oppRosterLineW: string;
    let oppCharacterIdW = '';
    let oppSynergyW: {
      mult: { attack: number; defense: number; speed: number; hp: number };
      labels: string[];
    } = {
      mult: { attack: 1, defense: 1, speed: 1, hp: 1 },
      labels: [],
    };

    if (isBot) {
      const rating = user.weeklyRating ?? 1000;
      const oppRoster = this.buildBotBattleRoster(
        cpUser,
        formula,
        userRosterW.length,
        'weekly',
      );
      oppRosterMembersW = oppRoster;
      oppRating = rating;
      oppEquipped = oppRoster.flatMap((m) => m.techniquesEquipped ?? []);
      oppAggW = this.aggregateSquadCombatStats(oppRoster);
      oppTechniqueOwnersW = this.buildTechniqueOwnerMap(oppRoster);
      oppRosterLineW = this.rosterLine(oppRoster);
    } else {
      const opponent = await this.userModel.findById(
        new Types.ObjectId(opponentUserId),
      );
      if (!opponent) throw new NotFoundException('Противник не найден');
      const oppActive = this.activeDisciples(opponent);
      if (oppActive.length === 0) {
        throw new BadRequestException(
          'У противника нет учеников в активном отряде',
        );
      }
      const oppRoster = await this.enrichBattleRosterFromDisciples(oppActive);
      oppRosterMembersW = oppRoster;
      oppRating = opponent.weeklyRating ?? 1000;
      oppEquipped = oppRoster.flatMap((m) => m.techniquesEquipped ?? []);
      oppAggW = this.aggregateSquadCombatStats(oppRoster);
      const oppSynergyMetaW = await this.loadCharacterSynergyMeta(
        oppActive.map((d) => new Types.ObjectId(this.discipleCharId(d))),
      );
      oppSynergyW = this.computeSquadSynergy(oppActive, oppSynergyMetaW);
      oppAggW = this.applySynergyToAggregatedStats(oppAggW, oppSynergyW.mult);
      oppTechniqueOwnersW = this.buildTechniqueOwnerMap(oppRoster);
      oppRosterLineW = this.rosterLine(oppRoster);
      const oppLeadW = this.getLeadActiveDisciple(opponent);
      oppCharacterIdW = oppLeadW ? this.discipleCharId(oppLeadW) : '';
      oppCard = oppLeadW?.characterId
        ? await this.resolveCardMedia(
            this.discipleCharId(oppLeadW),
            (oppLeadW as { level?: number }).level ?? 1,
            opponentUserId,
          )
        : null;
    }
    const weeklyLead = this.getLeadActiveDisciple(user);
    const userRosterBattleW = this.scaleRosterStatsWithSynergy(
      userRosterW,
      userSynergyW.mult,
    );
    const oppRosterBattleW = isBot
      ? oppRosterMembersW
      : this.scaleRosterStatsWithSynergy(oppRosterMembersW, oppSynergyW.mult);
    const sim = await this.simulateBattleWithTechniques(
      {
        characterId: weeklyLead ? this.discipleCharId(weeklyLead) : '',
        equipped: userEquipped,
        stats: {
          attack: userAggW.attack,
          defense: userAggW.defense,
          speed: userAggW.speed,
          hp: userAggW.hpSum,
          maxHpPool: userAggW.maxHpPool,
        },
        roster: userRosterBattleW.map((m) => ({
          characterId: m.characterId,
          displayName: m.displayName,
          attack: m.attack,
          defense: m.defense,
          speed: m.speed,
          hp: m.hp,
          techniquesEquipped: m.techniquesEquipped ?? [],
        })),
        rosterLine: userRosterLineW,
        techniqueOwners: userTechniqueOwnersW,
        sideLabel: 'Ваш отряд',
      },
      {
        characterId: oppCharacterIdW,
        equipped: oppEquipped,
        stats: {
          attack: oppAggW.attack,
          defense: oppAggW.defense,
          speed: oppAggW.speed,
          hp: oppAggW.hpSum,
          maxHpPool: oppAggW.maxHpPool,
        },
        roster: oppRosterBattleW.map((m) => ({
          characterId: m.characterId,
          displayName: m.displayName,
          attack: m.attack,
          defense: m.defense,
          speed: m.speed,
          hp: m.hp,
          techniquesEquipped: m.techniquesEquipped ?? [],
        })),
        rosterLine: oppRosterLineW,
        techniqueOwners: oppTechniqueOwnersW,
        sideLabel: isBot ? 'Отряд бота' : 'Отряд противника',
      },
      supportState,
    );
    const win = sim.win;

    const coinsWin = (config as any).weeklyBattleCoinsWin ?? 100;
    const coinsLoss = (config as any).weeklyBattleCoinsLoss ?? 20;
    const coinsGained = win ? coinsWin : coinsLoss;
    user.balance = (user.balance ?? 0) + coinsGained;
    user.lastWeeklyBattleAt = new Date();
    user.weeklyWins = (user.weeklyWins ?? 0) + (win ? 1 : 0);
    user.weeklyLosses = (user.weeklyLosses ?? 0) + (win ? 0 : 1);

    const kRating = (config as any).weeklyRatingK ?? 25;
    const myRating = user.weeklyRating ?? 1000;
    const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
    const delta = Math.round(kRating * ((win ? 1 : 0) - expected));
    user.weeklyRating = Math.max(0, myRating + delta);

    const weeklyExp = win ? 18 : 6;
    this.applyGameExpToUser(user, weeklyExp, 'active', GAME_PRIMARY_EXP_SHARE);
    user.markModified('balance');
    user.markModified('lastWeeklyBattleAt');
    user.markModified('weeklyWins');
    user.markModified('weeklyLosses');
    user.markModified('weeklyRating');
    user.markModified('disciples');
    await user.save();

    const userCard = weeklyLead?.characterId
      ? await this.resolveCardMedia(
          this.discipleCharId(weeklyLead),
          (weeklyLead as { level?: number }).level ?? 1,
          userId,
        )
      : null;

    const finW = sim.final as {
      hpUser: number;
      hpOpp: number;
      maxUser: number;
      maxOpp: number;
    };
    const outcomeReasonW = win
      ? finW.hpOpp <= 0
        ? 'Противник потерял все ОЗ.'
        : finW.hpUser > finW.hpOpp
          ? 'Лимит ходов — у вашего отряда больше ОЗ.'
          : 'Ничья по ОЗ — победа по скорости отряда.'
      : finW.hpUser <= 0
        ? 'Ваш отряд потерял все ОЗ.'
        : finW.hpUser < finW.hpOpp
          ? 'Лимит ходов — у противника больше ОЗ.'
          : 'Ничья по ОЗ — поражение по скорости.';

    const opponentTeamCpW = Math.round(
      oppRosterMembersW.reduce(
        (acc, m) =>
          acc +
          this.cp(
            { attack: m.attack, defense: m.defense, speed: m.speed, hp: m.hp },
            formula,
          ),
        0,
      ),
    );

    return {
      win,
      coinsGained,
      expGained: weeklyExp,
      weeklyRatingDelta: delta,
      consumedItems: supportState.consumed,
      resultScreen: {
        outcome: win ? 'win' : 'lose',
        outcomeReason: outcomeReasonW,
        userTeamCp: Math.round(cpUser),
        opponentTeamCp: opponentTeamCpW,
        teams: {
          user: await this.teamsForResultScreen(userRosterW, userId),
          opponent: await this.teamsForResultScreen(
            oppRosterMembersW,
            isBot ? undefined : opponentUserId,
          ),
        },
        userCard,
        opponentCard: oppCard,
        battleLog: sim.log,
        hp: sim.final,
        supportEffects: sim.supportEffects,
        squadSynergy: {
          user: { labels: userSynergyW.labels },
          opponent: { labels: oppSynergyW.labels },
        },
      },
    };
  }

  async weeklyLeaderboard(limit = 20): Promise<
    {
      username: string;
      avatar?: string;
      weeklyRating: number;
      weeklyWins: number;
      weeklyLosses: number;
    }[]
  > {
    const users = await this.userModel
      .find({ 'disciples.0': { $exists: true } })
      .select('username avatar weeklyRating weeklyWins weeklyLosses')
      .sort({ weeklyRating: -1 })
      .limit(limit)
      .lean()
      .exec();
    return (users as any[]).map((u) => ({
      username: u.username,
      avatar: u.avatar,
      weeklyRating: u.weeklyRating ?? 1000,
      weeklyWins: u.weeklyWins ?? 0,
      weeklyLosses: u.weeklyLosses ?? 0,
    }));
  }

  async expeditionStatus(userId: string) {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select(
        'disciples balance lastExpeditionAt lastExpeditionResult lastExpeditionCompletesAt lastExpeditionDifficulty',
      )
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');

    const hasActiveExpedition = (user.disciples ?? []).some(
      (d: any) => !d.inWarehouse,
    );

    const config = await this.getConfig();
    const now = Date.now();
    const completesAt = (user as any).lastExpeditionCompletesAt
      ? new Date((user as any).lastExpeditionCompletesAt).getTime()
      : null;
    const inProgress = completesAt != null && now < completesAt;
    const expiredPending = completesAt != null && now >= completesAt;

    let lastResult = (user as any).lastExpeditionResult ?? null;
    let balance = (user as any).balance ?? 0;
    if (expiredPending) {
      const completed = await this.completePendingExpedition(userId);
      if (completed) {
        lastResult = completed;
        const updated = await this.userModel
          .findById(new Types.ObjectId(userId))
          .select('balance')
          .lean()
          .exec();
        balance = (updated as any)?.balance ?? balance;
      }
    }

    const cooldownHours = (config as any).expeditionCooldownHours ?? 24;
    const last = (user as any).lastExpeditionAt
      ? new Date((user as any).lastExpeditionAt)
      : null;
    const nextAt = last
      ? new Date(last.getTime() + cooldownHours * 60 * 60 * 1000)
      : null;
    const canStart = !inProgress && (!nextAt || now >= nextAt.getTime());

    return {
      canStart,
      inProgress,
      completesAt:
        inProgress && completesAt != null
          ? new Date(completesAt).toISOString()
          : null,
      nextExpeditionAt: nextAt ? nextAt.toISOString() : null,
      costs: {
        easy: (config as any).expeditionCostCoinsEasy ?? 0,
        normal: (config as any).expeditionCostCoinsNormal ?? 25,
        hard: (config as any).expeditionCostCoinsHard ?? 60,
      },
      lastResult,
      hasDisciples: hasActiveExpedition,
      balance,
      ambushRiskPercent: 12,
    };
  }

  /**
   * Завершает экспедицию, если lastExpeditionCompletesAt уже в прошлом.
   * Вызывается из expeditionStatus. Возвращает результат или null.
   */
  private async completePendingExpedition(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) return null;
    const completesAt = user.lastExpeditionCompletesAt
      ? new Date(user.lastExpeditionCompletesAt).getTime()
      : null;
    if (completesAt == null || Date.now() < completesAt) return null;
    const difficulty =
      (user.lastExpeditionDifficulty as 'easy' | 'normal' | 'hard') ?? 'easy';
    const result = await this.computeExpeditionResult(userId, user, difficulty);
    user.lastExpeditionResult = result as any;
    user.lastExpeditionCompletesAt = undefined;
    user.lastExpeditionDifficulty = undefined;
    user.markModified('lastExpeditionResult');
    user.markModified('lastExpeditionCompletesAt');
    user.markModified('lastExpeditionDifficulty');
    await user.save();
    return result;
  }

  /**
   * Вычисляет результат экспедиции и применяет изменения к user (balance, disciples, inventory).
   * Не трогает lastExpeditionAt / lastExpeditionResult / completesAt.
   */
  private async computeExpeditionResult(
    userId: string,
    user: UserDocument,
    difficulty: 'easy' | 'normal' | 'hard',
  ): Promise<Record<string, unknown>> {
    const expeditionActives = this.activeDisciples(user);
    const levels = expeditionActives.map(
      (d: { level?: number }) => d.level ?? 1,
    );
    const avgLevel =
      levels.length > 0
        ? levels.reduce((a: number, b: number) => a + b, 0) / levels.length
        : 1;
    const base =
      difficulty === 'hard' ? 0.55 : difficulty === 'normal' ? 0.75 : 0.9;
    const levelBonus = Math.min(0.15, (avgLevel - 1) * 0.01);
    const successChance = Math.max(0.1, Math.min(0.95, base + levelBonus));
    const success = Math.random() < successChance;

    let coinsGained = success
      ? difficulty === 'hard'
        ? 120
        : difficulty === 'normal'
          ? 70
          : 35
      : difficulty === 'hard'
        ? 25
        : difficulty === 'normal'
          ? 15
          : 8;
    const expGained = success
      ? difficulty === 'hard'
        ? 35
        : difficulty === 'normal'
          ? 20
          : 10
      : difficulty === 'hard'
        ? 12
        : difficulty === 'normal'
          ? 8
          : 4;

    const log: string[] = [];
    log.push(`Сложность: ${difficulty}`);
    log.push(`Шанс успеха: ${Math.round(successChance * 100)}%`);
    log.push(success ? 'Экспедиция успешна!' : 'Экспедиция провалилась...');

    let itemsGained: {
      itemId: string;
      count: number;
      name?: string;
      icon?: string;
    }[] = [];

    const ambushChance = 0.12;
    let ambushHappened = success && Math.random() < ambushChance;
    let ambushPreventedByTalisman = false;
    if (ambushHappened) {
      const talismanId = 'expedition_talisman';
      const haveTalisman = (user.inventory ?? []).reduce(
        (sum: number, e: { itemId?: string; count?: number }) =>
          e.itemId === talismanId ? sum + (e.count ?? 0) : sum,
        0,
      );
      if (haveTalisman > 0) {
        await this.gameItemsService.deductFromInventory(userId, talismanId, 1);
        ambushPreventedByTalisman = true;
        ambushHappened = false;
        log.push('Засада отражена талисманом!');
      } else {
        coinsGained = Math.floor(coinsGained * 0.5);
        itemsGained = [];
        log.push('Засада! Потеряна часть добычи.');
      }
    }

    user.balance = (user.balance ?? 0) + coinsGained;
    user.markModified('balance');

    const expLogs = this.applyGameExpToUser(
      user,
      expGained,
      'active',
      GAME_PRIMARY_EXP_SHARE,
    );
    for (const line of expLogs) log.push(line);

    const libAmt =
      (success ? 3 : 1) +
      (difficulty === 'hard' ? 2 : difficulty === 'normal' ? 1 : 0);
    const libLogs = this.addLibraryExp(user, libAmt);
    for (const line of libLogs) log.push(line);
    if (expLogs.length > 0 || libLogs.length > 0) {
      user.markModified('disciples');
    }

    if (
      !ambushHappened &&
      success &&
      Math.random() <
        (difficulty === 'hard' ? 0.35 : difficulty === 'normal' ? 0.2 : 0.12)
    ) {
      const fragmentItem = await this.gameItemsService.findById(
        'mysterious_fragment',
      );
      itemsGained.push({
        itemId: 'mysterious_fragment',
        count: 1,
        name: fragmentItem?.name,
        icon: fragmentItem?.icon || undefined,
      });
      const inv = user.inventory ?? [];
      const idx = inv.findIndex((x: any) => x.itemId === 'mysterious_fragment');
      if (idx >= 0) inv[idx].count = (inv[idx].count ?? 0) + 1;
      else inv.push({ itemId: 'mysterious_fragment', count: 1 } as any);
      user.inventory = inv as any;
      user.markModified('inventory');
      log.push('Найден предмет: mysterious_fragment ×1');
    }

    return {
      at: new Date(),
      difficulty,
      success,
      coinsGained,
      expGained,
      itemsGained,
      log,
      ambush:
        ambushHappened || ambushPreventedByTalisman
          ? { happened: true, preventedByTalisman: ambushPreventedByTalisman }
          : undefined,
    };
  }

  async getDiscipleTechniques(userId: string) {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('disciples balance libraryLevel libraryExp')
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');
    const libraryLevel = (user as { libraryLevel?: number }).libraryLevel ?? 1;
    const libraryExp = (user as { libraryExp?: number }).libraryExp ?? 0;
    const libExpToNext = libraryExpToNext(libraryLevel);
    const disciples = (user.disciples ?? []) as Array<{
      characterId: unknown;
      level?: number;
      rank?: string;
      techniquesLearned?: string[];
      techniquesEquipped?: string[];
    }>;
    const result: Array<{
      characterId: string;
      techniquesLearned: string[];
      techniquesEquipped: string[];
      available: Array<{
        id?: string;
        name?: string;
        requiredRank?: string;
        learnCostCoins?: number;
        requiredLibraryLevel?: number;
        [key: string]: unknown;
      }>;
    }> = [];
    for (const d of disciples) {
      const raw = d.characterId;
      const cid =
        raw == null
          ? ''
          : typeof raw === 'object' && raw !== null && 'toString' in raw
            ? (raw as { toString(): string }).toString()
            : typeof raw === 'string' ||
                typeof raw === 'number' ||
                typeof raw === 'boolean'
              ? String(raw)
              : '';
      const level = d.level ?? 1;
      const rank = d.rank ?? 'F';
      const available = await this.listAvailableTechniques(cid, level, rank);
      result.push({
        characterId: cid,
        techniquesLearned: d.techniquesLearned ?? [],
        techniquesEquipped: d.techniquesEquipped ?? [],
        available,
      });
    }
    return {
      disciples: result,
      balance: (user as { balance?: number }).balance ?? 0,
      library: {
        level: libraryLevel,
        exp: libraryExp,
        expToNext: libExpToNext,
      },
    };
  }

  async learnTechnique(
    userId: string,
    characterId: string,
    techniqueId: string,
  ) {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    const disciples = (user.disciples ?? []) as any[];
    const idx = disciples.findIndex(
      (d) =>
        (d.characterId?.toString?.() ?? String(d.characterId)) === characterId,
    );
    if (idx < 0) throw new BadRequestException('Ученик не найден');
    const d = disciples[idx];
    const level = d.level ?? 1;
    const rank = d.rank ?? 'F';
    const libraryLevel = user.libraryLevel ?? 1;
    const available = await this.listAvailableTechniques(
      characterId,
      level,
      rank,
    );
    const tech = (
      available as Array<{
        id?: string;
        learnCostCoins?: number;
        requiredLibraryLevel?: number;
      }>
    ).find((t) => t.id === techniqueId);
    if (!tech)
      throw new BadRequestException('Техника недоступна или уже изучена');
    const reqLib = tech.requiredLibraryLevel ?? 1;
    if (reqLib > libraryLevel) {
      throw new BadRequestException(
        `Нужен уровень библиотеки ${reqLib} (сейчас ${libraryLevel})`,
      );
    }
    const learned = d.techniquesLearned ?? [];
    if (learned.includes(techniqueId))
      throw new BadRequestException('Техника уже изучена');
    const cost = tech.learnCostCoins ?? 50;
    if ((user.balance ?? 0) < cost)
      throw new BadRequestException('Недостаточно монет');
    user.balance = (user.balance ?? 0) - cost;
    learned.push(techniqueId);
    d.techniquesLearned = learned;
    user.disciples = disciples;
    this.addLibraryExp(user, 4);
    user.markModified('disciples');
    user.markModified('balance');
    await user.save();
    return {
      learned: techniqueId,
      balance: user.balance ?? 0,
    } as { learned: string; balance: number };
  }

  async equipTechniques(
    userId: string,
    characterId: string,
    techniqueIds: string[],
  ) {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    const disciples = (user.disciples ?? []) as any[];
    const idx = disciples.findIndex(
      (d) =>
        (d.characterId?.toString?.() ?? String(d.characterId)) === characterId,
    );
    if (idx < 0) throw new BadRequestException('Ученик не найден');
    const d = disciples[idx];
    const learned = d.techniquesLearned ?? [];
    const invalid = techniqueIds.filter((id) => !learned.includes(id));
    if (invalid.length > 0)
      throw new BadRequestException(
        `Неизученные техники: ${invalid.join(', ')}`,
      );
    d.techniquesEquipped = [...techniqueIds];
    user.disciples = disciples;
    user.markModified('disciples');
    await user.save();
    return { equipped: techniqueIds };
  }

  async startExpedition(
    userId: string,
    difficulty: 'easy' | 'normal' | 'hard' = 'easy',
  ) {
    const config = await this.getConfig();
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    if (this.activeDisciples(user).length === 0)
      throw new BadRequestException(
        'Нужен хотя бы один ученик в активном отряде',
      );

    if (
      user.lastExpeditionCompletesAt &&
      Date.now() < new Date(user.lastExpeditionCompletesAt).getTime()
    ) {
      throw new BadRequestException(
        'Экспедиция уже в пути. Дождитесь завершения.',
      );
    }

    const cooldownHours = (config as any).expeditionCooldownHours ?? 24;
    const last = user.lastExpeditionAt ? new Date(user.lastExpeditionAt) : null;
    const nextAt = last
      ? new Date(last.getTime() + cooldownHours * 60 * 60 * 1000)
      : null;
    if (nextAt && Date.now() < nextAt.getTime()) {
      throw new BadRequestException('Экспедиция на кулдауне');
    }

    const cost =
      difficulty === 'hard'
        ? ((config as any).expeditionCostCoinsHard ?? 60)
        : difficulty === 'normal'
          ? ((config as any).expeditionCostCoinsNormal ?? 25)
          : ((config as any).expeditionCostCoinsEasy ?? 0);
    if ((user.balance ?? 0) < cost)
      throw new BadRequestException('Недостаточно монет');
    user.balance = (user.balance ?? 0) - cost;

    const durationMs = randomExpeditionDurationMs(difficulty);
    const completesAt = new Date(Date.now() + durationMs);

    user.lastExpeditionAt = new Date();
    user.lastExpeditionCompletesAt = completesAt;
    user.lastExpeditionDifficulty = difficulty;
    user.lastExpeditionResult = undefined;
    user.markModified('balance');
    user.markModified('lastExpeditionAt');
    user.markModified('lastExpeditionCompletesAt');
    user.markModified('lastExpeditionDifficulty');
    user.markModified('lastExpeditionResult');
    await user.save();

    return {
      started: true,
      completesAt: completesAt.toISOString(),
      balance: user.balance ?? 0,
    };
  }

  async setPrimaryDisciple(
    userId: string,
    characterId: string,
  ): Promise<{ primaryDiscipleCharacterId: string }> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    const active = this.activeDisciples(user);
    const ok = active.some((d) => this.discipleCharId(d) === characterId);
    if (!ok) {
      throw new BadRequestException('Ученик должен быть в активном отряде');
    }
    user.primaryDiscipleCharacterId = new Types.ObjectId(characterId);
    user.markModified('primaryDiscipleCharacterId');
    await user.save();
    return { primaryDiscipleCharacterId: characterId };
  }

  async setDiscipleWarehouse(
    userId: string,
    characterId: string,
    inWarehouse: boolean,
  ): Promise<{ ok: boolean }> {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    const config = await this.getConfig();
    const maxActive =
      config.maxDisciples && config.maxDisciples > 0 ? config.maxDisciples : 3;
    const disciples = [...(user.disciples ?? [])];
    const idx = disciples.findIndex(
      (d: any) => this.discipleCharId(d) === characterId,
    );
    if (idx < 0) throw new BadRequestException('Ученик не найден');

    if (inWarehouse) {
      const activeCount = disciples.filter((d: any) => !d.inWarehouse).length;
      if (!disciples[idx].inWarehouse && activeCount <= 1) {
        throw new BadRequestException('Нужен хотя бы один активный ученик');
      }
      disciples[idx].inWarehouse = true;
    } else {
      if (!disciples[idx].inWarehouse) {
        return { ok: true };
      }
      const activeCount = disciples.filter((d: any) => !d.inWarehouse).length;
      if (activeCount >= maxActive) {
        throw new BadRequestException(
          'Активный отряд заполнен. Переместите кого-то на склад.',
        );
      }
      disciples[idx].inWarehouse = false;
    }

    user.disciples = disciples;

    const pri = user.primaryDiscipleCharacterId?.toString();
    if (inWarehouse && pri === characterId) {
      const lead = this.activeDisciples(user)[0];
      user.primaryDiscipleCharacterId = lead
        ? new Types.ObjectId(this.discipleCharId(lead))
        : null;
      user.markModified('primaryDiscipleCharacterId');
    }

    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    this.recomputeCombatRating(user, formula);
    user.markModified('disciples');
    user.markModified('combatRating');
    await user.save();
    return { ok: true };
  }

  private inventoryCount(
    inv: Array<{ itemId?: string; count?: number }> | undefined,
    itemId: string,
  ): number {
    return (inv ?? []).reduce(
      (acc, e) => acc + (e.itemId === itemId ? (e.count ?? 0) : 0),
      0,
    );
  }

  async getDiscipleItemExchangeRecipes(userId: string) {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('inventory')
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');
    const inv = (
      user as { inventory?: Array<{ itemId?: string; count?: number }> }
    ).inventory;
    const recipes: Array<{
      recipeId: string;
      label: string;
      description?: string;
      inputs: Array<{
        itemId: string;
        count: number;
        have: number;
        name?: string;
        icon?: string;
      }>;
      outputs: Array<{
        itemId: string;
        count: number;
        name?: string;
        icon?: string;
      }>;
      canAfford: boolean;
    }> = [];
    for (const r of DISCIPLE_ITEM_EXCHANGE_RECIPES) {
      const inputs = await Promise.all(
        r.consume.map(async (c) => {
          const meta = await this.gameItemsService.findById(c.itemId);
          return {
            itemId: c.itemId,
            count: c.count,
            have: this.inventoryCount(inv, c.itemId),
            name: meta?.name,
            icon: meta?.icon || undefined,
          };
        }),
      );
      const outputs = await Promise.all(
        r.grant.map(async (g) => {
          const meta = await this.gameItemsService.findById(g.itemId);
          return {
            itemId: g.itemId,
            count: g.count,
            name: meta?.name,
            icon: meta?.icon || undefined,
          };
        }),
      );
      const canAfford = inputs.every((i) => i.have >= i.count);
      recipes.push({
        recipeId: r.recipeId,
        label: r.label,
        description: r.description,
        inputs,
        outputs,
        canAfford,
      });
    }
    return { recipes };
  }

  async performDiscipleItemExchange(userId: string, recipeId: string) {
    const def = DISCIPLE_ITEM_EXCHANGE_RECIPES.find(
      (x) => x.recipeId === recipeId,
    );
    if (!def) throw new BadRequestException('Неизвестный рецепт обмена');
    await this.gameItemsService.exchangeItemsAtomic(
      userId,
      def.consume,
      def.grant,
    );
    return { ok: true as const, recipeId };
  }

  getDiscipleGameShop(): {
    offers: Array<Record<string, unknown>>;
  } {
    return {
      offers: DISCIPLE_GAME_SHOP_OFFERS.map((o) =>
        o.kind === 'item'
          ? {
              offerId: o.offerId,
              label: o.label,
              priceCoins: o.priceCoins,
              kind: 'item',
              itemId: o.itemId,
              count: o.count,
            }
          : {
              offerId: o.offerId,
              label: o.label,
              priceCoins: o.priceCoins,
              kind: 'library_exp',
              libraryExp: o.libraryExp,
            },
      ),
    };
  }

  async buyDiscipleGameShopOffer(
    userId: string,
    offerId: string,
  ): Promise<{
    balance: number;
    purchased: string;
    library?: { level: number; exp: number; expToNext: number };
  }> {
    const offer = DISCIPLE_GAME_SHOP_OFFERS.find((o) => o.offerId === offerId);
    if (!offer) throw new BadRequestException('Неизвестное предложение');
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    if ((user.balance ?? 0) < offer.priceCoins) {
      throw new BadRequestException('Недостаточно монет');
    }
    user.balance = (user.balance ?? 0) - offer.priceCoins;
    user.markModified('balance');
    if (offer.kind === 'library_exp') {
      this.addLibraryExp(user, offer.libraryExp);
    }
    await user.save();
    if (offer.kind === 'item') {
      await this.gameItemsService.addToInventory(
        userId,
        offer.itemId,
        offer.count,
      );
    }
    const fresh = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('balance libraryLevel libraryExp')
      .lean()
      .exec();
    const b = (fresh as { balance?: number })?.balance ?? 0;
    return {
      balance: b,
      purchased: offerId,
      library:
        offer.kind === 'library_exp'
          ? {
              level: (fresh as { libraryLevel?: number })?.libraryLevel ?? 1,
              exp: (fresh as { libraryExp?: number })?.libraryExp ?? 0,
              expToNext: libraryExpToNext(
                (fresh as { libraryLevel?: number })?.libraryLevel ?? 1,
              ),
            }
          : undefined,
    };
  }
}
