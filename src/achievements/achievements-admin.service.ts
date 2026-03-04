import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Achievement,
  AchievementDocument,
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_RARITIES,
} from '../schemas/achievement.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { escapeRegex } from '../common/utils/regex.util';

const ACHIEVEMENT_TYPE_VALUES = ACHIEVEMENT_TYPES as unknown as string[];
const ACHIEVEMENT_RARITY_VALUES = ACHIEVEMENT_RARITIES as unknown as string[];

@Injectable()
export class AchievementsAdminService {
  constructor(
    @InjectModel(Achievement.name) private achievementModel: Model<AchievementDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findAll(params: {
    search?: string;
    type?: string;
    rarity?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (params.search?.trim()) {
      const s = escapeRegex(params.search.trim());
      filter.$or = [
        { id: new RegExp(s, 'i') },
        { name: new RegExp(s, 'i') },
        { description: new RegExp(s, 'i') },
      ];
    }
    if (params.type) filter.type = params.type;
    if (params.rarity) filter.rarity = params.rarity;

    const [achievements, total] = await Promise.all([
      this.achievementModel
        .find(filter)
        .sort({ id: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.achievementModel.countDocuments(filter),
    ]);

    const list = achievements.map((a) => {
      const doc = a as unknown as {
        _id: Types.ObjectId;
        id: string;
        name: string;
        description?: string;
        icon?: string;
        type: string;
        rarity: string;
        maxProgress?: number;
        isHidden?: boolean;
        createdAt: Date;
        updatedAt: Date;
      };
      return {
        _id: doc._id.toString(),
        id: doc.id,
        name: doc.name,
        description: doc.description ?? '',
        icon: doc.icon ?? '',
        type: doc.type,
        rarity: doc.rarity,
        maxProgress: doc.maxProgress ?? 1,
        isHidden: doc.isHidden ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });

    const pages = Math.ceil(total / limit);
    return {
      achievements: list,
      pagination: { total, page, limit, pages },
    };
  }

  async findOne(id: string) {
    const conditions: Record<string, unknown>[] = [{ id }];
    if (Types.ObjectId.isValid(id)) {
      conditions.push({ _id: new Types.ObjectId(id) });
    }
    const achievement = await this.achievementModel
      .findOne({ $or: conditions })
      .lean()
      .exec();
    if (!achievement) {
      throw new NotFoundException('Achievement not found');
    }
    const doc = achievement as unknown as {
      _id: Types.ObjectId;
      id: string;
      name: string;
      description?: string;
      icon?: string;
      type: string;
      rarity: string;
      maxProgress?: number;
      isHidden?: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    return {
      _id: doc._id.toString(),
      id: doc.id,
      name: doc.name,
      description: doc.description ?? '',
      icon: doc.icon ?? '',
      type: doc.type,
      rarity: doc.rarity,
      maxProgress: doc.maxProgress ?? 1,
      isHidden: doc.isHidden ?? false,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async create(body: {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    type: string;
    rarity: string;
    maxProgress?: number;
    isHidden?: boolean;
  }) {
    const id = body.id?.trim();
    if (!id) throw new BadRequestException('id is required');
    if (!body.name?.trim()) throw new BadRequestException('name is required');
    if (!ACHIEVEMENT_TYPE_VALUES.includes(body.type)) {
      throw new BadRequestException(`type must be one of: ${ACHIEVEMENT_TYPE_VALUES.join(', ')}`);
    }
    if (!ACHIEVEMENT_RARITY_VALUES.includes(body.rarity)) {
      throw new BadRequestException(`rarity must be one of: ${ACHIEVEMENT_RARITY_VALUES.join(', ')}`);
    }
    const existing = await this.achievementModel.findOne({ id });
    if (existing) {
      throw new ConflictException('Achievement with this id already exists');
    }
    const achievement = await this.achievementModel.create({
      id,
      name: body.name.trim(),
      description: body.description?.trim() ?? '',
      icon: body.icon?.trim() ?? '',
      type: body.type,
      rarity: body.rarity,
      maxProgress: body.maxProgress ?? 1,
      isHidden: body.isHidden ?? false,
    });
    return achievement;
  }

  async update(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      icon: string;
      type: string;
      rarity: string;
      maxProgress: number;
      isHidden: boolean;
    }>,
  ) {
    const conditions: Record<string, unknown>[] = [{ id }];
    if (Types.ObjectId.isValid(id)) {
      conditions.push({ _id: new Types.ObjectId(id) });
    }
    const achievement = await this.achievementModel
      .findOne({ $or: conditions })
      .exec();
    if (!achievement) {
      throw new NotFoundException('Achievement not found');
    }
    if (body.name !== undefined) achievement.name = body.name.trim();
    if (body.description !== undefined) achievement.description = body.description.trim();
    if (body.icon !== undefined) achievement.icon = body.icon.trim();
    if (body.type !== undefined) {
      if (!ACHIEVEMENT_TYPE_VALUES.includes(body.type)) {
        throw new BadRequestException(`type must be one of: ${ACHIEVEMENT_TYPE_VALUES.join(', ')}`);
      }
      achievement.type = body.type;
    }
    if (body.rarity !== undefined) {
      if (!ACHIEVEMENT_RARITY_VALUES.includes(body.rarity)) {
        throw new BadRequestException(`rarity must be one of: ${ACHIEVEMENT_RARITY_VALUES.join(', ')}`);
      }
      achievement.rarity = body.rarity;
    }
    if (body.maxProgress !== undefined) achievement.maxProgress = body.maxProgress;
    if (body.isHidden !== undefined) achievement.isHidden = body.isHidden;
    await achievement.save();
    return achievement;
  }

  async remove(id: string) {
    const conditions: Record<string, unknown>[] = [{ id }];
    if (Types.ObjectId.isValid(id)) {
      conditions.push({ _id: new Types.ObjectId(id) });
    }
    const achievement = await this.achievementModel
      .findOneAndDelete({ $or: conditions })
      .exec();
    if (!achievement) {
      throw new NotFoundException('Achievement not found');
    }
    return { message: 'Achievement deleted successfully' };
  }

  async grant(body: { achievementId: string; userId: string; progress?: number }) {
    const { achievementId, userId, progress = 0 } = body;
    if (!achievementId || !userId) {
      throw new BadRequestException('achievementId and userId are required');
    }
    const grantConditions: Record<string, unknown>[] = [{ id: achievementId }];
    if (Types.ObjectId.isValid(achievementId)) {
      grantConditions.push({ _id: new Types.ObjectId(achievementId) });
    }
    const achievement = await this.achievementModel
      .findOne({ $or: grantConditions })
      .exec();
    if (!achievement) throw new NotFoundException('Achievement not found');

    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    const idStr = achievement.id;
    const existing = (user.achievements || []).find(
      (a) => a.achievementId === idStr || a.achievementId === achievement._id.toString(),
    );
    const entry = {
      achievementId: idStr,
      level: 1,
      unlockedAt: new Date(),
      progress: Math.min(progress, achievement.maxProgress ?? 1),
    };
    if (existing) {
      await this.userModel.updateOne(
        { _id: user._id, 'achievements.achievementId': idStr },
        {
          $set: {
            'achievements.$.level': 1,
            'achievements.$.unlockedAt': new Date(),
            'achievements.$.progress': entry.progress,
          },
        },
      );
    } else {
      await this.userModel.updateOne(
        { _id: user._id },
        { $push: { achievements: entry } },
      );
    }
    return { message: 'Achievement granted', achievementId: idStr, userId };
  }

  async revoke(body: { achievementId: string; userId: string }) {
    const { achievementId, userId } = body;
    if (!achievementId || !userId) {
      throw new BadRequestException('achievementId and userId are required');
    }
    const revokeConditions: Record<string, unknown>[] = [{ id: achievementId }];
    if (Types.ObjectId.isValid(achievementId)) {
      revokeConditions.push({ _id: new Types.ObjectId(achievementId) });
    }
    const achievement = await this.achievementModel
      .findOne({ $or: revokeConditions })
      .exec();
    const idStr = achievement?.id ?? achievementId;

    const result = await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $pull: { achievements: { achievementId: idStr } } },
    );
    if (result.matchedCount === 0) {
      throw new NotFoundException('User not found');
    }
    return { message: 'Achievement revoked', achievementId: idStr, userId };
  }
}
