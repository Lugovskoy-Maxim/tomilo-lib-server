import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GameItem,
  GameItemDocument,
  GAME_ITEM_TYPES,
  GAME_ITEM_RARITIES,
} from '../schemas/game-item.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { escapeRegex } from '../common/utils/regex.util';

@Injectable()
export class GameItemsService {
  constructor(
    @InjectModel(GameItem.name)
    private gameItemModel: Model<GameItemDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  async findById(itemId: string): Promise<GameItem | null> {
    return this.gameItemModel
      .findOne({ id: itemId, isActive: true })
      .lean()
      .exec();
  }

  async findAllActive(): Promise<GameItem[]> {
    return this.gameItemModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, id: 1 })
      .lean()
      .exec();
  }

  /**
   * Добавить предмет в инвентарь пользователя с учётом maxStack и объединением стаков.
   */
  async addToInventory(
    userId: string,
    itemId: string,
    count: number,
  ): Promise<{ itemId: string; count: number }[]> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    if (count <= 0) {
      throw new BadRequestException('Count must be positive');
    }

    const item = await this.findById(itemId);
    if (!item) {
      throw new NotFoundException(`Game item ${itemId} not found`);
    }

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const inventory = Array.isArray(user.inventory) ? [...user.inventory] : [];
    const maxStack = item.maxStack ?? 999;
    let remaining = count;

    const existingIndex = inventory.findIndex((e) => e.itemId === itemId);
    if (existingIndex >= 0) {
      const entry = inventory[existingIndex];
      const canAdd = Math.min(remaining, maxStack - entry.count);
      entry.count += canAdd;
      remaining -= canAdd;
      if (entry.count <= 0) {
        inventory.splice(existingIndex, 1);
      }
    }

    while (remaining > 0 && item.stackable !== false) {
      const stack = Math.min(remaining, maxStack);
      inventory.push({ itemId, count: stack });
      remaining -= stack;
    }

    user.inventory = inventory;
    user.markModified('inventory');
    await user.save();

    return user.inventory;
  }

  /**
   * Списать предмет из инвентаря (для алхимии и т.д.). Возвращает true если списание успешно.
   */
  async deductFromInventory(
    userId: string,
    itemId: string,
    count: number,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId) || count <= 0) return false;

    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) return false;

    const inventory = Array.isArray(user.inventory) ? [...user.inventory] : [];
    let remaining = count;

    for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
      if (inventory[i].itemId !== itemId) continue;
      const take = Math.min(remaining, inventory[i].count);
      inventory[i].count -= take;
      remaining -= take;
      if (inventory[i].count <= 0) inventory.splice(i, 1);
    }

    if (remaining > 0) return false;

    user.inventory = inventory;
    user.markModified('inventory');
    await user.save();
    return true;
  }

  /**
   * Проверить наличие предметов в инвентаре.
   */
  async hasItems(
    userId: string,
    requirements: { itemId: string; count: number }[],
  ): Promise<boolean> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('inventory')
      .lean()
      .exec();
    if (!user || !Array.isArray(user.inventory)) return false;

    const counts = new Map<string, number>();
    for (const e of user.inventory) {
      counts.set(e.itemId, (counts.get(e.itemId) ?? 0) + e.count);
    }
    for (const r of requirements) {
      if ((counts.get(r.itemId) ?? 0) < r.count) return false;
    }
    return true;
  }

  // ——— Admin CRUD ———

  async adminFindAll(params: {
    search?: string;
    type?: string;
    rarity?: string;
    isActive?: boolean;
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
    if (params.isActive !== undefined) filter.isActive = params.isActive;

    const [items, total] = await Promise.all([
      this.gameItemModel
        .find(filter)
        .sort({ sortOrder: 1, id: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.gameItemModel.countDocuments(filter),
    ]);

    return {
      items: items as (GameItem & { _id: Types.ObjectId })[],
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async adminFindOne(id: string) {
    const item = await this.gameItemModel.findOne({ id }).lean().exec();
    if (!item) throw new NotFoundException(`Game item ${id} not found`);
    return item;
  }

  async adminCreate(body: {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    type: string;
    rarity: string;
    stackable?: boolean;
    maxStack?: number;
    usedInRecipes?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    if (!GAME_ITEM_TYPES.includes(body.type as any)) {
      throw new BadRequestException(
        `Invalid type. Must be one of: ${GAME_ITEM_TYPES.join(', ')}`,
      );
    }
    if (!GAME_ITEM_RARITIES.includes(body.rarity as any)) {
      throw new BadRequestException(
        `Invalid rarity. Must be one of: ${GAME_ITEM_RARITIES.join(', ')}`,
      );
    }
    const existing = await this.gameItemModel.findOne({ id: body.id }).exec();
    if (existing)
      throw new BadRequestException(
        `Game item with id ${body.id} already exists`,
      );

    const doc = await this.gameItemModel.create({
      id: body.id,
      name: body.name,
      description: body.description ?? '',
      icon: body.icon ?? '',
      type: body.type,
      rarity: body.rarity,
      stackable: body.stackable ?? true,
      maxStack: body.maxStack ?? 999,
      usedInRecipes: body.usedInRecipes ?? false,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    });
    return doc.toObject();
  }

  async adminUpdate(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      icon: string;
      type: string;
      rarity: string;
      stackable: boolean;
      maxStack: number;
      usedInRecipes: boolean;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    const doc = await this.gameItemModel
      .findOneAndUpdate({ id }, { $set: body }, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException(`Game item ${id} not found`);
    return doc;
  }

  async adminDelete(id: string) {
    const doc = await this.gameItemModel
      .findOneAndUpdate({ id }, { $set: { isActive: false } }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException(`Game item ${id} not found`);
    return { message: 'Game item deactivated' };
  }
}
