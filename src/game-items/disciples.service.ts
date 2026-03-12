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

function getStartOfDayUTC(d: Date = new Date()): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function expToNextLevel(level: number): number {
  return 30 + level * 20;
}

function rankFromLevel(level: number): string {
  if (level >= 41) return 'S';
  if (level >= 31) return 'A';
  if (level >= 21) return 'B';
  if (level >= 16) return 'C';
  if (level >= 11) return 'D';
  if (level >= 6) return 'E';
  return 'F';
}

function divisionFromRating(rating: number): string {
  if (rating >= 2000) return 'Легенда';
  if (rating >= 1600) return 'Мастер';
  if (rating >= 1200) return 'Золото';
  if (rating >= 800) return 'Серебро';
  return 'Бронза';
}

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
        maxDisciples: 5,
        maxBattlesPerDay: 5,
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

  private async resolveCardMedia(characterId: string, level: number) {
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

  private async ensureDefaultTechniqueSeeded(): Promise<void> {
    const count = await this.techniqueModel.countDocuments({}).exec();
    if (count > 0) return;
    await this.techniqueModel.create([
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
    ]);
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
        'id name description type power cooldownTurns requiredLevel requiredRank learnCostCoins iconUrl',
      )
      .lean()
      .exec();
    const filtered = (all as Array<{ requiredRank?: string }>).filter(
      (t) => this.rankValue(t.requiredRank ?? 'F') <= rankVal,
    );
    return filtered;
  }

  private async simulateBattleWithTechniques(
    userSide: {
      characterId: string;
      equipped: string[];
      stats: { attack: number; defense: number; speed: number; hp: number };
    },
    opponentSide: {
      characterId: string;
      equipped: string[];
      stats: { attack: number; defense: number; speed: number; hp: number };
    },
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

    const maxUser = userSide.stats.hp * 10;
    const maxOpp = opponentSide.stats.hp * 10;
    let hpUser = maxUser;
    let hpOpp = maxOpp;

    const log: any[] = [];
    const cd: Record<string, number> = {};

    const pick = (equipped: string[]) => {
      const list = equipped.length ? equipped : ['basic_strike'];
      for (const id of list) {
        if ((cd[id] ?? 0) <= 0) return id;
      }
      return 'basic_strike';
    };

    for (let turn = 1; turn <= 6; turn++) {
      for (const k of Object.keys(cd)) cd[k] = Math.max(0, (cd[k] ?? 0) - 1);

      const uId = pick(userSide.equipped);
      const uT = techMap.get(uId) ?? techMap.get('basic_strike');
      if (uT?.cooldownTurns) cd[uId] = uT.cooldownTurns;

      if (uT?.type === 'heal') {
        const heal = Math.max(
          5,
          Math.round((uT.power ?? 10) + userSide.stats.defense * 0.8),
        );
        hpUser = Math.min(maxUser, hpUser + heal);
        log.push({
          turn,
          actor: 'user',
          action: 'heal',
          techniqueId: uId,
          techniqueName: uT?.name,
          value: heal,
          hpUser,
          hpOpp,
        });
      } else {
        const base = (uT.power ?? 10) + userSide.stats.attack * 1.2;
        const mitigation = Math.max(1, opponentSide.stats.defense * 0.9);
        const dmg = Math.max(4, Math.round(base - mitigation));
        hpOpp = Math.max(0, hpOpp - dmg);
        log.push({
          turn,
          actor: 'user',
          action: 'damage',
          techniqueId: uId,
          techniqueName: uT?.name,
          value: dmg,
          hpUser,
          hpOpp,
        });
      }
      if (hpOpp <= 0) break;

      const oId = pick(opponentSide.equipped);
      const oT = techMap.get(oId) ?? techMap.get('basic_strike');
      if (oT?.cooldownTurns) cd[oId] = oT.cooldownTurns;

      if (oT?.type === 'heal') {
        const heal = Math.max(
          5,
          Math.round((oT.power ?? 10) + opponentSide.stats.defense * 0.8),
        );
        hpOpp = Math.min(maxOpp, hpOpp + heal);
        log.push({
          turn,
          actor: 'opponent',
          action: 'heal',
          techniqueId: oId,
          techniqueName: oT?.name,
          value: heal,
          hpUser,
          hpOpp,
        });
      } else {
        const base = (oT.power ?? 10) + opponentSide.stats.attack * 1.2;
        const mitigation = Math.max(1, userSide.stats.defense * 0.9);
        const dmg = Math.max(4, Math.round(base - mitigation));
        hpUser = Math.max(0, hpUser - dmg);
        log.push({
          turn,
          actor: 'opponent',
          action: 'damage',
          techniqueId: oId,
          techniqueName: oT?.name,
          value: dmg,
          hpUser,
          hpOpp,
        });
      }
      if (hpUser <= 0) break;
    }

    const win = hpUser >= hpOpp;
    return {
      win,
      log,
      final: { hpUser, hpOpp, maxUser, maxOpp },
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
        'disciples maxDisciples lastTrainingAt combatRating lastBattleAt lastRerollCandidate balance lastWeeklyBattleAt weeklyRating weeklyWins weeklyLosses',
      )
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');

    const config = await this.getConfig();
    const maxDisciples = user.maxDisciples ?? config.maxDisciples ?? 5;
    const today = getStartOfDayUTC();
    const lastTrainingAt = user.lastTrainingAt
      ? new Date(user.lastTrainingAt)
      : null;
    const canTrain =
      !lastTrainingAt ||
      getStartOfDayUTC(lastTrainingAt).getTime() < today.getTime();
    const battlesToday = 0; // TODO: store battlesPerDayCount if needed
    const canBattle = (config.maxBattlesPerDay ?? 5) > battlesToday;

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

    return {
      disciples: (user.disciples ?? []).map((d: any) => {
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
        };
      }),
      maxDisciples,
      combatRating: user.combatRating ?? 0,
      canTrain,
      canBattle,
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
    const attack = this.randomStat(ranges.attackMin, ranges.attackMax);
    const defense = this.randomStat(ranges.defenseMin, ranges.defenseMax);
    const speed = this.randomStat(ranges.speedMin, ranges.speedMax);
    const hp = this.randomStat(ranges.hpMin, ranges.hpMax);

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
    const maxDisciples = user.maxDisciples ?? config.maxDisciples ?? 5;
    if ((user.disciples?.length ?? 0) >= maxDisciples) {
      throw new BadRequestException('Достигнут лимит учеников');
    }

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
    });
    user.disciples = disciples;
    user.lastRerollCandidate = undefined;
    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    let totalCp = 0;
    for (const d of user.disciples) {
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
    user.disciples = (user.disciples ?? []).filter(
      (d: any) =>
        (d.characterId?.toString?.() ?? d.characterId?.toString()) !==
        characterId,
    );
    if (user.disciples.length === before) {
      throw new BadRequestException('Ученик не найден в команде');
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

    // Редкий провал тренировки: списывает ресурсы/время, но без прироста статов (манхва-стиль)
    const failChance = 0.06;
    const failed = Math.random() < failChance;

    const cap = config.statCap ?? 50;
    const roll = Math.random();
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
      if (roll < 0.33) {
        const key = ['attack', 'defense', 'speed', 'hp'][
          Math.floor(Math.random() * 4)
        ] as StatKey;
        d[key] = Math.min(cap, (d[key] ?? 0) + 1);
      } else if (roll < 0.66) {
        const keys = ['attack', 'defense', 'speed', 'hp']
          .sort(() => Math.random() - 0.5)
          .slice(0, 2) as StatKey[];
        for (const k of keys) {
          d[k] = Math.min(cap, (d[k] ?? 0) + 1);
        }
      } else {
        const key = ['attack', 'defense', 'speed', 'hp'][
          Math.floor(Math.random() * 4)
        ] as StatKey;
        d[key] = Math.min(cap, (d[key] ?? 0) + 2);
      }
    }

    let lvl = d.level ?? 1;
    let exp = d.exp ?? 0;
    const expGain = 5 + Math.floor(Math.random() * 11);
    exp += expGain;
    while (exp >= expToNextLevel(lvl)) {
      exp -= expToNextLevel(lvl);
      lvl += 1;
    }
    d.level = lvl;
    d.exp = exp;
    d.rank = rankFromLevel(lvl);

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

  async battleMatch(
    userId: string,
  ): Promise<{ opponent: any; combatRating: number } | null> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('combatRating disciples')
      .lean()
      .exec();
    if (!user || (user.disciples?.length ?? 0) === 0) return null;

    const rating = user.combatRating ?? 0;
    const delta = Math.max(20, Math.floor(rating * 0.15));
    const opponent = await this.userModel
      .findOne({
        _id: { $ne: new Types.ObjectId(userId) },
        'disciples.0': { $exists: true },
        combatRating: { $gte: rating - delta, $lte: rating + delta },
      })
      .select('username avatar combatRating disciples')
      .lean()
      .exec();
    if (!opponent) return null;

    return {
      opponent: {
        userId: (opponent as any)._id.toString(),
        username: (opponent as any).username,
        avatar: (opponent as any).avatar,
        combatRating: (opponent as any).combatRating,
        disciples: (opponent as any).disciples?.map((d: any) => ({
          attack: d.attack,
          defense: d.defense,
          speed: d.speed,
          hp: d.hp,
        })),
      },
      combatRating: (opponent as any).combatRating,
    };
  }

  async battle(
    userId: string,
    opponentUserId: string,
  ): Promise<{
    win: boolean;
    coinsGained: number;
    expGained?: number;
    resultScreen?: {
      outcome: string;
      userCard: unknown;
      opponentCard: unknown;
      battleLog: unknown;
      hp: unknown;
    };
  }> {
    const config = await this.getConfig();
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    const opponent = await this.userModel.findById(
      new Types.ObjectId(opponentUserId),
    );
    if (!user || !opponent) throw new NotFoundException('User not found');
    if (
      (user.disciples?.length ?? 0) === 0 ||
      (opponent.disciples?.length ?? 0) === 0
    ) {
      throw new BadRequestException('Недостаточно учеников для боя');
    }

    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    let cpUser = 0;
    for (const d of user.disciples) {
      cpUser += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }
    let cpOpponent = 0;
    for (const d of opponent.disciples) {
      cpOpponent += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }

    const userEquipped = (user.disciples ?? []).flatMap(
      (d: { techniquesEquipped?: string[] }) => d.techniquesEquipped ?? [],
    );
    const oppEquipped = (opponent.disciples ?? []).flatMap(
      (d: { techniquesEquipped?: string[] }) => d.techniquesEquipped ?? [],
    );

    const sim = await this.simulateBattleWithTechniques(
      {
        characterId:
          (user.disciples?.[0] as any)?.characterId?.toString?.() ?? '',
        equipped: userEquipped,
        stats: { attack: cpUser / 10, defense: cpUser / 12, speed: 10, hp: 30 },
      },
      {
        characterId:
          (opponent.disciples?.[0] as any)?.characterId?.toString?.() ?? '',
        equipped: oppEquipped,
        stats: {
          attack: cpOpponent / 10,
          defense: cpOpponent / 12,
          speed: 10,
          hp: 30,
        },
      },
    );

    const win = sim.win;

    const coinsGained = win ? 25 : 5;
    user.balance = (user.balance ?? 0) + coinsGained;
    user.lastBattleAt = new Date();
    user.markModified('balance');
    user.markModified('lastBattleAt');
    await user.save();

    const userCard = (user.disciples?.[0] as any)?.characterId
      ? await this.resolveCardMedia(
          (user.disciples?.[0] as any).characterId.toString(),
          (user.disciples?.[0] as any).level ?? 1,
        )
      : null;
    const oppCard = (opponent.disciples?.[0] as any)?.characterId
      ? await this.resolveCardMedia(
          (opponent.disciples?.[0] as any).characterId.toString(),
          (opponent.disciples?.[0] as any).level ?? 1,
        )
      : null;

    return {
      win,
      coinsGained,
      expGained: win ? 10 : 2,
      resultScreen: {
        outcome: win ? 'win' : 'lose',
        userCard,
        opponentCard: oppCard,
        battleLog: sim.log,
        hp: sim.final,
      },
    };
  }

  async weeklyBattleMatch(userId: string): Promise<{
    opponent: {
      userId: string;
      username: string;
      avatar?: string;
      weeklyRating?: number;
      disciples: unknown[];
    };
    weekly: {
      canWeeklyBattle: boolean;
      nextWeeklyBattleAt: string | null;
      weeklyRating?: number;
      weeklyDivision?: string;
    };
  } | null> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('disciples lastWeeklyBattleAt weeklyRating')
      .lean()
      .exec();
    if (!user || (user.disciples?.length ?? 0) === 0) return null;

    const lastWeekly = (user as any).lastWeeklyBattleAt
      ? new Date((user as any).lastWeeklyBattleAt)
      : null;
    const canWeekly =
      !lastWeekly || Date.now() - lastWeekly.getTime() >= WEEK_MS;
    if (!canWeekly) return null;

    const rating = (user as any).weeklyRating ?? 1000;
    const delta = Math.max(50, Math.floor(rating * 0.1));
    const opponent = await this.userModel
      .findOne({
        _id: { $ne: new Types.ObjectId(userId) },
        'disciples.0': { $exists: true },
        $or: [
          { weeklyRating: { $exists: false } },
          { weeklyRating: { $gte: rating - delta, $lte: rating + delta } },
        ],
      })
      .select('username avatar weeklyRating disciples')
      .lean()
      .exec();
    if (!opponent) return null;

    const oppRating = (opponent as any).weeklyRating ?? 1000;
    return {
      opponent: {
        userId: (opponent as any)._id.toString(),
        username: (opponent as any).username,
        avatar: (opponent as any).avatar,
        weeklyRating: oppRating,
        disciples: (opponent as any).disciples?.map((d: any) => ({
          attack: d.attack,
          defense: d.defense,
          speed: d.speed,
          hp: d.hp,
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

  async weeklyBattle(
    userId: string,
    opponentUserId: string,
  ): Promise<{
    win: boolean;
    coinsGained: number;
    expGained?: number;
    weeklyRatingDelta?: number;
  }> {
    const config = await this.getConfig();
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    const opponent = await this.userModel.findById(
      new Types.ObjectId(opponentUserId),
    );
    if (!user || !opponent) throw new NotFoundException('User not found');
    if (
      (user.disciples?.length ?? 0) === 0 ||
      (opponent.disciples?.length ?? 0) === 0
    ) {
      throw new BadRequestException('Недостаточно учеников для боя');
    }

    const lastWeekly = user.lastWeeklyBattleAt
      ? new Date(user.lastWeeklyBattleAt)
      : null;
    if (lastWeekly && Date.now() - lastWeekly.getTime() < WEEK_MS) {
      throw new BadRequestException(
        'Недельная схватка уже использована. Доступна раз в 7 дней.',
      );
    }

    const formula = config.cpFormula ?? {
      attack: 1.2,
      defense: 1,
      speed: 0.8,
      hp: 0.3,
    };
    let cpUser = 0;
    for (const d of user.disciples) {
      cpUser += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }
    let cpOpponent = 0;
    for (const d of opponent.disciples) {
      cpOpponent += this.cp(
        { attack: d.attack, defense: d.defense, speed: d.speed, hp: d.hp },
        formula,
      );
    }

    const k = config.winChanceK ?? 0.3;
    const winChance =
      0.5 + (k * (cpUser - cpOpponent)) / (cpUser + cpOpponent || 1);
    const win = Math.random() < winChance;

    const coinsWin = (config as any).weeklyBattleCoinsWin ?? 100;
    const coinsLoss = (config as any).weeklyBattleCoinsLoss ?? 20;
    const coinsGained = win ? coinsWin : coinsLoss;
    user.balance = (user.balance ?? 0) + coinsGained;
    user.lastWeeklyBattleAt = new Date();
    user.weeklyWins = (user.weeklyWins ?? 0) + (win ? 1 : 0);
    user.weeklyLosses = (user.weeklyLosses ?? 0) + (win ? 0 : 1);

    const kRating = (config as any).weeklyRatingK ?? 25;
    const myRating = user.weeklyRating ?? 1000;
    const oppRating = opponent.weeklyRating ?? 1000;
    const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
    const delta = Math.round(kRating * ((win ? 1 : 0) - expected));
    user.weeklyRating = Math.max(0, myRating + delta);

    user.markModified('balance');
    user.markModified('lastWeeklyBattleAt');
    user.markModified('weeklyWins');
    user.markModified('weeklyLosses');
    user.markModified('weeklyRating');
    await user.save();

    return {
      win,
      coinsGained,
      expGained: win ? 15 : 5,
      weeklyRatingDelta: delta,
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
      .select('disciples balance lastExpeditionAt lastExpeditionResult')
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');

    const config = await this.getConfig();
    const cooldownHours = (config as any).expeditionCooldownHours ?? 24;
    const last = (user as any).lastExpeditionAt
      ? new Date((user as any).lastExpeditionAt)
      : null;
    const nextAt = last
      ? new Date(last.getTime() + cooldownHours * 60 * 60 * 1000)
      : null;
    const canStart = !nextAt || Date.now() >= nextAt.getTime();

    return {
      canStart,
      nextExpeditionAt: nextAt ? nextAt.toISOString() : null,
      costs: {
        easy: (config as any).expeditionCostCoinsEasy ?? 0,
        normal: (config as any).expeditionCostCoinsNormal ?? 25,
        hard: (config as any).expeditionCostCoinsHard ?? 60,
      },
      lastResult: (user as any).lastExpeditionResult ?? null,
      hasDisciples: (user.disciples?.length ?? 0) > 0,
      balance: (user as any).balance ?? 0,
      ambushRiskPercent: 12,
    };
  }

  async getDiscipleTechniques(userId: string) {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('disciples balance')
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');
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
    const available = await this.listAvailableTechniques(
      characterId,
      level,
      rank,
    );
    const tech = (
      available as Array<{ id?: string; learnCostCoins?: number }>
    ).find((t) => t.id === techniqueId);
    if (!tech)
      throw new BadRequestException('Техника недоступна или уже изучена');
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
    if ((user.disciples?.length ?? 0) === 0)
      throw new BadRequestException('Нужен хотя бы 1 ученик');

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

    const levels = (user.disciples ?? []).map(
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

    let itemsGained: { itemId: string; count: number }[] = [];

    // Засада: только при успехе, 12% шанс. Теряется половина монет и дроп предмета. Талисман страхует.
    const ambushChance = 0.12;
    let ambushHappened = success && Math.random() < ambushChance;
    let ambushPreventedByTalisman = false;
    if (ambushHappened) {
      const talismanId = 'expedition_talisman';
      const haveTalisman = (user.inventory ?? []).reduce(
        (sum, e) => (e.itemId === talismanId ? sum + e.count : sum),
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

    const first = (user.disciples ?? [])[0] as any;
    if (first) {
      let lvl = first.level ?? 1;
      let exp = first.exp ?? 0;
      exp += expGained;
      while (exp >= expToNextLevel(lvl)) {
        exp -= expToNextLevel(lvl);
        lvl += 1;
      }
      first.level = lvl;
      first.exp = exp;
      first.rank = rankFromLevel(lvl);
      log.push(`Опыт ученика: +${expGained} (Lv ${lvl})`);
    }

    if (
      !ambushHappened &&
      success &&
      Math.random() <
        (difficulty === 'hard' ? 0.35 : difficulty === 'normal' ? 0.2 : 0.12)
    ) {
      itemsGained.push({ itemId: 'mysterious_fragment', count: 1 });
      const inv = user.inventory ?? [];
      const idx = inv.findIndex((x: any) => x.itemId === 'mysterious_fragment');
      if (idx >= 0) inv[idx].count = (inv[idx].count ?? 0) + 1;
      else inv.push({ itemId: 'mysterious_fragment', count: 1 } as any);
      user.inventory = inv as any;
      user.markModified('inventory');
      log.push('Найден предмет: mysterious_fragment ×1');
    }

    user.lastExpeditionAt = new Date();
    user.lastExpeditionResult = {
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
    } as any;

    user.markModified('disciples');
    user.markModified('balance');
    user.markModified('lastExpeditionAt');
    user.markModified('lastExpeditionResult');
    await user.save();

    return {
      success,
      coinsGained,
      expGained,
      itemsGained,
      log,
      balance: user.balance ?? 0,
      ambush:
        ambushHappened || ambushPreventedByTalisman
          ? { happened: true, preventedByTalisman: ambushPreventedByTalisman }
          : undefined,
    };
  }
}
