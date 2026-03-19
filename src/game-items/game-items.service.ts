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
    if (process.env.DISABLE_ITEM_REWARDS === '1') {
      return [];
    }

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
   * Создаёт базовые материалы для алхимии, если их ещё нет (ингредиенты рецептов).
   */
  async ensureDefaultAlchemyMaterials(): Promise<void> {
    const materials: Array<{
      id: string;
      name: string;
      description: string;
      rarity: string;
    }> = [
      { id: 'spirit_grass', name: 'Духовная трава', description: 'Базовая трава с духом ци', rarity: 'common' },
      { id: 'hundred_year_herb', name: 'Столетняя трава', description: 'Трава, вобравшая ци за сто лет', rarity: 'uncommon' },
      { id: 'beast_core_low', name: 'Ядро зверя (низшее)', description: 'Ядро обычного духозверя', rarity: 'common' },
      { id: 'spirit_stone_fragment', name: 'Осколок духовного камня', description: 'Обломок камня с духом ци', rarity: 'uncommon' },
      { id: 'iron_ore', name: 'Железная руда', description: 'Руда для закалки', rarity: 'common' },
      { id: 'wolf_king_core', name: 'Ядро Короля волков', description: 'Ядро вожака стаи', rarity: 'uncommon' },
      { id: 'thousand_year_ginseng', name: 'Тысячелетний женьшень', description: 'Редкий корень', rarity: 'rare' },
      { id: 'phoenix_feather', name: 'Перо феникса', description: 'Остаток священной птицы', rarity: 'rare' },
    ];
    for (const m of materials) {
      await this.gameItemModel.updateOne(
        { id: m.id },
        {
          $setOnInsert: {
            id: m.id,
            name: m.name,
            description: m.description,
            icon: '',
            type: 'material',
            rarity: m.rarity,
            stackable: true,
            maxStack: 99,
            usedInRecipes: true,
            sortOrder: 0,
            isActive: true,
          },
        },
        { upsert: true },
      );
    }
  }

  /**
   * Создаёт предметы результата алхимии (base_common, base_quality, base_legendary), если их ещё нет.
   * Вызывается перед показом рецептов, чтобы варка не падала из-за отсутствия предмета.
   */
  async ensureDefaultAlchemyResultItems(): Promise<void> {
    const bases: { base: string; nameBase: string }[] = [
      { base: 'pill_common', nameBase: 'Пилюля ци' },
      { base: 'pill_healing', nameBase: 'Пилюля исцеления' },
      { base: 'pill_energy', nameBase: 'Пилюля восстановления ци' },
      { base: 'pill_condensation', nameBase: 'Пилюля сгущения ци' },
      { base: 'pill_tempering', nameBase: 'Отвар закалки' },
      { base: 'pill_breakthrough', nameBase: 'Пилюля прорыва' },
    ];
    const qualities: { suffix: string; nameSuffix: string; rarity: string }[] = [
      { suffix: 'common', nameSuffix: ' (обычная)', rarity: 'common' },
      { suffix: 'quality', nameSuffix: ' (улучшенная)', rarity: 'uncommon' },
      { suffix: 'legendary', nameSuffix: ' (легендарная)', rarity: 'rare' },
    ];
    for (const { base, nameBase } of bases) {
      for (const q of qualities) {
        const id = `${base}_${q.suffix}`;
        await this.gameItemModel.updateOne(
          { id },
          {
            $setOnInsert: {
              id,
              name: nameBase + q.nameSuffix,
              description: `Результат алхимической варки. Качество: ${q.suffix}.`,
              icon: '',
              type: 'consumable',
              rarity: q.rarity,
              stackable: true,
              maxStack: 99,
              usedInRecipes: false,
              sortOrder: 0,
              isActive: true,
            },
          },
          { upsert: true },
        );
      }
    }
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
