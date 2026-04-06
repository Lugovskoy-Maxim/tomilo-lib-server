import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import {
  WheelConfig,
  WheelConfigDocument,
} from '../schemas/wheel-config.schema';
import { GameItemsService } from './game-items.service';
import { DisciplesService } from './disciples.service';

function getStartOfDayUTC(d: Date = new Date()): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

@Injectable()
export class WheelService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(WheelConfig.name)
    private wheelConfigModel: Model<WheelConfigDocument>,
    private gameItemsService: GameItemsService,
    private disciplesService: DisciplesService,
  ) {}

  private async getConfig(): Promise<WheelConfigDocument> {
    let config = (await this.wheelConfigModel
      .findOne({ id: 'default' })
      .lean()
      .exec()) as WheelConfigDocument | null;
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
        .exec()) as unknown as WheelConfigDocument;
    }
    return config;
  }

  async getWheel(userId: string): Promise<{
    segments: {
      rewardType: string;
      label: string;
      weight: number;
      param?: any;
      icon?: string;
      rarity?: string;
      rewardMeta?: {
        kind: string;
        valueText?: string;
      };
    }[];
    spinCostCoins: number;
    canSpin: boolean;
    lastWheelSpinAt: string | null;
    nextSpinAt: string | null;
    balance: number;
  }> {
    const config = await this.getConfig();
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('lastWheelSpinAt balance')
      .lean()
      .exec();
    const itemMetaById = new Map(
      (await this.gameItemsService.findAllActive()).map((item) => [
        item.id,
        {
          icon: item.icon ?? undefined,
          rarity: item.rarity ?? undefined,
        },
      ]),
    );

    const today = getStartOfDayUTC();
    const last = user?.lastWheelSpinAt ? new Date(user.lastWheelSpinAt) : null;
    const canSpin =
      (!last || getStartOfDayUTC(last).getTime() < today.getTime()) &&
      (user?.balance ?? 0) >= (config.spinCostCoins ?? 20);
    const nextSpinAt = last
      ? new Date(getStartOfDayUTC(last).getTime() + 24 * 60 * 60 * 1000)
      : null;

    return {
      segments: (config.segments ?? []).map((s: any) => ({
        rewardType: s.rewardType,
        label: s.label ?? '',
        weight: Number(s.weight ?? 0),
        param: s.param,
        icon:
          s.rewardType === 'item' &&
          s.param &&
          typeof s.param === 'object' &&
          'itemId' in s.param
            ? itemMetaById.get((s.param as { itemId?: string }).itemId ?? '')
                ?.icon
            : undefined,
        rarity:
          s.rewardType === 'item' &&
          s.param &&
          typeof s.param === 'object' &&
          'itemId' in s.param
            ? itemMetaById.get((s.param as { itemId?: string }).itemId ?? '')
                ?.rarity
            : undefined,
        rewardMeta:
          s.rewardType === 'item' &&
          s.param &&
          typeof s.param === 'object' &&
          'itemId' in s.param
            ? {
                kind: 'item',
                valueText: `x${Number((s.param as { count?: number }).count ?? 1)}`,
              }
            : s.rewardType === 'coins'
              ? {
                  kind: 'coins',
                  valueText: `+${Number(s.param ?? 0)}`,
                }
              : s.rewardType === 'xp'
                ? {
                    kind: 'xp',
                    valueText: `+${Number(s.param ?? 0)}`,
                  }
                : s.rewardType === 'empty'
                  ? {
                      kind: 'empty',
                      valueText: '0',
                    }
                  : {
                      kind: s.rewardType,
                      valueText: s.param != null ? String(s.param) : undefined,
                    },
      })),
      spinCostCoins: config.spinCostCoins ?? 20,
      canSpin,
      lastWheelSpinAt: user?.lastWheelSpinAt
        ? new Date(user.lastWheelSpinAt).toISOString()
        : null,
      nextSpinAt: nextSpinAt?.toISOString() ?? null,
      balance: user?.balance ?? 0,
    };
  }

  async spin(userId: string): Promise<{
    rewardType: string;
    label: string;
    param?: any;
    expGained?: number;
    coinsGained?: number;
    itemsGained?: {
      itemId: string;
      count: number;
      name?: string;
      icon?: string;
    }[];
    twistOfFate?: boolean;
    compensationCoins?: number;
    balance?: number;
    selectedSegmentIndex?: number;
    nextSpinAt?: string | null;
    rewardSummary?: {
      type: 'coins' | 'exp' | 'item';
      label: string;
      amount?: number;
      icon?: string;
    }[];
  }> {
    const config = await this.getConfig();
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');

    const cost = config.spinCostCoins ?? 20;
    if ((user.balance ?? 0) < cost) {
      throw new BadRequestException('Недостаточно монет');
    }
    const today = getStartOfDayUTC();
    const last = user.lastWheelSpinAt ? new Date(user.lastWheelSpinAt) : null;
    if (last && getStartOfDayUTC(last).getTime() >= today.getTime()) {
      throw new BadRequestException('Колесо уже использовано сегодня');
    }

    const segments = config.segments ?? [];
    const totalWeight = segments.reduce((s, seg) => s + (seg.weight ?? 0), 0);
    let r = Math.random() * totalWeight;
    let chosen: (typeof segments)[0] | null = null;
    let chosenIndex = -1;
    for (const [index, seg] of segments.entries()) {
      r -= seg.weight ?? 0;
      if (r <= 0) {
        chosen = seg;
        chosenIndex = index;
        break;
      }
    }
    if (!chosen) {
      chosen = segments[segments.length - 1] ?? null;
      chosenIndex = segments.length - 1;
    }
    if (!chosen) {
      user.balance = (user.balance ?? 0) - cost;
      user.lastWheelSpinAt = new Date();
      user.markModified('balance');
      user.markModified('lastWheelSpinAt');
      await user.save();
      return {
        rewardType: 'empty',
        label: 'Пусто',
        balance: user.balance ?? 0,
        selectedSegmentIndex: 0,
        nextSpinAt: new Date(
          getStartOfDayUTC().getTime() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    }

    user.balance = (user.balance ?? 0) - cost;
    user.lastWheelSpinAt = new Date();
    user.markModified('balance');
    user.markModified('lastWheelSpinAt');

    // Обман судьбы: 1% шанс — выпавшая награда не выдаётся, компенсация 3 монеты
    const twistOfFateChance = 0.01;
    const compensationCoins = 3;
    const twistOfFate = Math.random() < twistOfFateChance;
    if (twistOfFate) {
      user.balance = (user.balance ?? 0) + compensationCoins;
      user.markModified('balance');
      await user.save();
      return {
        rewardType: 'empty',
        label: 'Обман судьбы',
        twistOfFate: true,
        compensationCoins,
        coinsGained: compensationCoins,
        balance: user.balance ?? 0,
        selectedSegmentIndex: chosenIndex,
        nextSpinAt: new Date(
          getStartOfDayUTC().getTime() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        rewardSummary: [
          {
            type: 'coins',
            label: 'Компенсация',
            amount: compensationCoins,
          },
        ],
      };
    }

    const result: {
      rewardType: string;
      label: string;
      param?: unknown;
      expGained?: number;
      coinsGained?: number;
      itemsGained?: {
        itemId: string;
        count: number;
        name?: string;
        icon?: string;
      }[];
    } = {
      rewardType: chosen.rewardType,
      label: chosen.label ?? '',
      param: chosen.param,
    };

    if (chosen.rewardType === 'xp' && typeof chosen.param === 'number') {
      this.disciplesService.applyWheelXpToLoadedUser(user, chosen.param);
      result.expGained = chosen.param;
    } else if (
      chosen.rewardType === 'coins' &&
      typeof chosen.param === 'number'
    ) {
      user.balance = (user.balance ?? 0) + chosen.param;
      result.coinsGained = chosen.param;
    } else if (
      chosen.rewardType === 'item' &&
      chosen.param &&
      typeof chosen.param === 'object' &&
      'itemId' in chosen.param
    ) {
      const param = chosen.param as { itemId: string; count?: number };
      const count = param.count ?? 1;
      await this.gameItemsService.addToInventory(userId, param.itemId, count);
      const item = await this.gameItemsService.findById(param.itemId);
      result.itemsGained = [
        {
          itemId: param.itemId,
          count,
          name: item?.name,
          icon: item?.icon || undefined,
        },
      ];
    } else if (chosen.rewardType === 'element_bonus' && user.element) {
      user.balance = (user.balance ?? 0) + 5;
      user.markModified('balance');
      result.coinsGained = 5;
      result.label = 'Бонус стихии: 5 монет';
    }

    await user.save();
    return {
      ...result,
      balance: user.balance ?? 0,
      selectedSegmentIndex: chosenIndex,
      nextSpinAt: new Date(
        getStartOfDayUTC().getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
      rewardSummary: [
        ...(result.coinsGained
          ? [
              {
                type: 'coins' as const,
                label: 'Монеты',
                amount: result.coinsGained,
              },
            ]
          : []),
        ...(result.expGained
          ? [{ type: 'exp' as const, label: 'Опыт', amount: result.expGained }]
          : []),
        ...((result.itemsGained ?? []).map((item) => ({
          type: 'item' as const,
          label: item.name ?? item.itemId,
          amount: item.count,
          icon: item.icon,
        })) ?? []),
      ],
    };
  }
}
