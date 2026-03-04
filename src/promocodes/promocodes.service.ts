import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PromoCode, PromoCodeDocument, PromoCodeReward } from '../schemas/promo-code.schema';
import { PromoCodeUsage, PromoCodeUsageDocument } from '../schemas/promo-code-usage.schema';
import { User, UserDocument } from '../schemas/user.schema';
import {
  AvatarDecoration,
  AvatarDecorationDocument,
} from '../schemas/avatar-decoration.schema';
import {
  AvatarFrameDecoration,
  AvatarFrameDecorationDocument,
} from '../schemas/avatar-frame-decoration.schema';
import {
  BackgroundDecoration,
  BackgroundDecorationDocument,
} from '../schemas/background-decoration.schema';
import {
  CardDecoration,
  CardDecorationDocument,
} from '../schemas/card-decoration.schema';
import { CreatePromoCodeDto, UpdatePromoCodeDto, PromoCodeRewardDto } from './dto';
import { LoggerService } from '../common/logger/logger.service';
import { escapeRegex } from '../common/utils/regex.util';

const NEW_USER_DAYS_THRESHOLD = 7;

@Injectable()
export class PromocodesService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(PromoCode.name) private promoCodeModel: Model<PromoCodeDocument>,
    @InjectModel(PromoCodeUsage.name) private promoCodeUsageModel: Model<PromoCodeUsageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(AvatarDecoration.name)
    private avatarDecorationModel: Model<AvatarDecorationDocument>,
    @InjectModel(AvatarFrameDecoration.name)
    private avatarFrameDecorationModel: Model<AvatarFrameDecorationDocument>,
    @InjectModel(BackgroundDecoration.name)
    private backgroundDecorationModel: Model<BackgroundDecorationDocument>,
    @InjectModel(CardDecoration.name)
    private cardDecorationModel: Model<CardDecorationDocument>,
  ) {
    this.logger.setContext(PromocodesService.name);
  }

  async findAll(options: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<{ data: PromoCodeDocument[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, status, search } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.code = { $regex: escapeRegex(search), $options: 'i' };
    }

    const [data, total] = await Promise.all([
      this.promoCodeModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.promoCodeModel.countDocuments(filter),
    ]);

    return { data, total, page, limit };
  }

  async findById(id: string): Promise<PromoCodeDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid promo code ID');
    }
    const promo = await this.promoCodeModel.findById(id).exec();
    if (!promo) {
      throw new NotFoundException('Promo code not found');
    }
    return promo;
  }

  async findByCode(code: string): Promise<PromoCodeDocument | null> {
    return this.promoCodeModel.findOne({ code: code.toUpperCase().trim() }).exec();
  }

  async create(dto: CreatePromoCodeDto, createdById?: string): Promise<PromoCodeDocument> {
    const normalizedCode = dto.code.toUpperCase().trim();

    const existing = await this.promoCodeModel.findOne({ code: normalizedCode }).exec();
    if (existing) {
      throw new BadRequestException(`Promo code "${normalizedCode}" already exists`);
    }

    const rewards = await this.validateAndPrepareRewards(dto.rewards);

    const promo = new this.promoCodeModel({
      code: normalizedCode,
      description: dto.description,
      rewards,
      maxUses: dto.maxUses ?? null,
      maxUsesPerUser: dto.maxUsesPerUser ?? 1,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      status: dto.status ?? 'active',
      newUsersOnly: dto.newUsersOnly ?? false,
      minLevel: dto.minLevel,
      createdBy: createdById ? new Types.ObjectId(createdById) : undefined,
    });

    await promo.save();
    this.logger.log(`Created promo code: ${normalizedCode}`);
    return promo;
  }

  async update(id: string, dto: UpdatePromoCodeDto): Promise<PromoCodeDocument> {
    const promo = await this.findById(id);

    if (dto.code !== undefined) {
      const normalizedCode = dto.code.toUpperCase().trim();
      if (normalizedCode !== promo.code) {
        const existing = await this.promoCodeModel.findOne({ code: normalizedCode }).exec();
        if (existing) {
          throw new BadRequestException(`Promo code "${normalizedCode}" already exists`);
        }
        promo.code = normalizedCode;
      }
    }

    if (dto.description !== undefined) promo.description = dto.description;
    if (dto.rewards !== undefined) {
      promo.rewards = await this.validateAndPrepareRewards(dto.rewards);
    }
    if (dto.maxUses !== undefined) promo.maxUses = dto.maxUses;
    if (dto.maxUsesPerUser !== undefined) promo.maxUsesPerUser = dto.maxUsesPerUser;
    if (dto.startsAt !== undefined) promo.startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
    if (dto.expiresAt !== undefined) promo.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (dto.status !== undefined) promo.status = dto.status;
    if (dto.newUsersOnly !== undefined) promo.newUsersOnly = dto.newUsersOnly;
    if (dto.minLevel !== undefined) promo.minLevel = dto.minLevel;

    await promo.save();
    this.logger.log(`Updated promo code: ${promo.code}`);
    return promo;
  }

  async delete(id: string): Promise<void> {
    const promo = await this.findById(id);
    await this.promoCodeModel.deleteOne({ _id: promo._id }).exec();
    this.logger.log(`Deleted promo code: ${promo.code}`);
  }

  async getUsage(
    promoCodeId: string,
    options: { page?: number; limit?: number },
  ): Promise<{ data: PromoCodeUsageDocument[]; total: number; page: number; limit: number }> {
    if (!Types.ObjectId.isValid(promoCodeId)) {
      throw new BadRequestException('Invalid promo code ID');
    }

    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const filter = { promoCodeId: new Types.ObjectId(promoCodeId) };

    const [data, total] = await Promise.all([
      this.promoCodeUsageModel
        .find(filter)
        .sort({ usedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.promoCodeUsageModel.countDocuments(filter),
    ]);

    return { data, total, page, limit };
  }

  async checkPromoCode(code: string): Promise<{
    valid: boolean;
    rewards?: PromoCodeReward[];
    message?: string;
  }> {
    const promo = await this.findByCode(code);
    if (!promo) {
      return { valid: false, message: 'Промокод не найден' };
    }

    const validation = this.validatePromoCodeStatus(promo);
    if (!validation.valid) {
      return validation;
    }

    return { valid: true, rewards: promo.rewards };
  }

  async redeemPromoCode(
    userId: string,
    code: string,
  ): Promise<{
    success: boolean;
    message: string;
    rewards?: PromoCodeReward[];
    newBalance?: number;
  }> {
    const promo = await this.findByCode(code);
    if (!promo) {
      throw new NotFoundException('Промокод не найден');
    }

    const validation = this.validatePromoCodeStatus(promo);
    if (!validation.valid) {
      throw new BadRequestException(validation.message);
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    if (promo.newUsersOnly) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - NEW_USER_DAYS_THRESHOLD);
      const createdAt = (user as unknown as { createdAt?: Date }).createdAt;
      if (createdAt && createdAt < daysAgo) {
        throw new ForbiddenException('Промокод доступен только для новых пользователей');
      }
    }

    if (promo.minLevel !== undefined && promo.minLevel > 0) {
      if ((user.level ?? 1) < promo.minLevel) {
        throw new ForbiddenException(`Необходим минимальный уровень: ${promo.minLevel}`);
      }
    }

    const userUsageCount = await this.promoCodeUsageModel.countDocuments({
      promoCodeId: promo._id,
      userId: new Types.ObjectId(userId),
    });
    if (userUsageCount >= promo.maxUsesPerUser) {
      throw new BadRequestException('Вы уже использовали этот промокод максимальное число раз');
    }

    const grantedRewards = await this.grantRewards(user, promo.rewards);

    const updated = await this.promoCodeModel.findOneAndUpdate(
      { _id: promo._id, $or: [{ maxUses: null }, { usedCount: { $lt: promo.maxUses } }] },
      { $inc: { usedCount: 1 } },
      { new: true },
    );

    if (!updated) {
      throw new BadRequestException('Промокод исчерпан');
    }

    if (updated.maxUses !== null && updated.usedCount >= updated.maxUses) {
      await this.promoCodeModel.updateOne({ _id: promo._id }, { status: 'exhausted' });
    }

    await this.promoCodeUsageModel.create({
      promoCodeId: promo._id,
      promoCode: promo.code,
      userId: new Types.ObjectId(userId),
      username: user.username,
      rewardsGranted: grantedRewards,
      usedAt: new Date(),
    });

    const freshUser = await this.userModel.findById(userId).exec();
    const newBalance = freshUser?.balance ?? user.balance;

    this.logger.log(`User ${userId} redeemed promo code: ${promo.code}`);

    return {
      success: true,
      message: 'Промокод успешно активирован',
      rewards: grantedRewards,
      newBalance,
    };
  }

  async generateCode(options: { length?: number; prefix?: string }): Promise<string> {
    const { length = 8, prefix = '' } = options;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      let code = prefix.toUpperCase();
      for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const existing = await this.promoCodeModel.findOne({ code }).exec();
      if (!existing) {
        return code;
      }
      attempts++;
    }

    throw new BadRequestException('Failed to generate unique code');
  }

  private validatePromoCodeStatus(promo: PromoCodeDocument): { valid: boolean; message?: string } {
    if (promo.status === 'inactive') {
      return { valid: false, message: 'Промокод неактивен' };
    }
    if (promo.status === 'expired') {
      return { valid: false, message: 'Промокод истёк' };
    }
    if (promo.status === 'exhausted') {
      return { valid: false, message: 'Промокод исчерпан' };
    }

    const now = new Date();
    if (promo.startsAt && promo.startsAt > now) {
      return { valid: false, message: 'Промокод ещё не активен' };
    }
    if (promo.expiresAt && promo.expiresAt < now) {
      return { valid: false, message: 'Промокод истёк' };
    }

    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      return { valid: false, message: 'Промокод исчерпан' };
    }

    return { valid: true };
  }

  private async validateAndPrepareRewards(
    rewards: PromoCodeRewardDto[],
  ): Promise<PromoCodeReward[]> {
    const prepared: PromoCodeReward[] = [];

    for (const r of rewards) {
      const reward: PromoCodeReward = { type: r.type };

      if (r.type === 'balance') {
        if (!r.amount || r.amount < 1) {
          throw new BadRequestException('Balance reward requires positive amount');
        }
        reward.amount = r.amount;
      } else if (r.type === 'premium') {
        if (!r.amount || r.amount < 1) {
          throw new BadRequestException('Premium reward requires positive amount (days)');
        }
        reward.amount = r.amount;
      } else if (r.type === 'decoration') {
        if (!r.decorationId) {
          throw new BadRequestException('Decoration reward requires decorationId');
        }
        if (!Types.ObjectId.isValid(r.decorationId)) {
          throw new BadRequestException('Invalid decorationId');
        }

        const decorationInfo = await this.findDecorationById(r.decorationId);
        if (!decorationInfo) {
          throw new BadRequestException(`Decoration not found: ${r.decorationId}`);
        }

        reward.decorationId = new Types.ObjectId(r.decorationId);
        reward.decorationType = decorationInfo.type;
        reward.displayName = r.displayName ?? decorationInfo.name;
      }

      prepared.push(reward);
    }

    return prepared;
  }

  private async findDecorationById(
    id: string,
  ): Promise<{ type: 'avatar' | 'frame' | 'background' | 'card'; name: string } | null> {
    const oid = new Types.ObjectId(id);

    const avatar = await this.avatarDecorationModel.findById(oid).exec();
    if (avatar) return { type: 'avatar', name: avatar.name };

    const frame = await this.avatarFrameDecorationModel.findById(oid).exec();
    if (frame) return { type: 'frame', name: frame.name };

    const background = await this.backgroundDecorationModel.findById(oid).exec();
    if (background) return { type: 'background', name: background.name };

    const card = await this.cardDecorationModel.findById(oid).exec();
    if (card) return { type: 'card', name: card.name };

    return null;
  }

  private async grantRewards(
    user: UserDocument,
    rewards: PromoCodeReward[],
  ): Promise<PromoCodeReward[]> {
    const granted: PromoCodeReward[] = [];

    for (const reward of rewards) {
      if (reward.type === 'balance' && reward.amount) {
        user.balance = (user.balance ?? 0) + reward.amount;
        granted.push(reward);
      } else if (reward.type === 'premium' && reward.amount) {
        granted.push(reward);
      } else if (reward.type === 'decoration' && reward.decorationId && reward.decorationType) {
        const alreadyOwned = user.ownedDecorations?.some(
          (o) =>
            o.decorationType === reward.decorationType &&
            o.decorationId.toString() === reward.decorationId!.toString(),
        );

        if (!alreadyOwned) {
          if (!user.ownedDecorations) {
            user.ownedDecorations = [];
          }
          user.ownedDecorations.push({
            decorationType: reward.decorationType,
            decorationId: reward.decorationId,
            purchasedAt: new Date(),
          });
          granted.push(reward);
        }
      }
    }

    await user.save();
    return granted;
  }
}
