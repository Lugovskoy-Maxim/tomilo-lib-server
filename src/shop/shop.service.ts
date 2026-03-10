import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AvatarDecoration,
  AvatarDecorationDocument,
} from '../schemas/avatar-decoration.schema';
import {
  BackgroundDecoration,
  BackgroundDecorationDocument,
} from '../schemas/background-decoration.schema';
import {
  CardDecoration,
  CardDecorationDocument,
} from '../schemas/card-decoration.schema';
import {
  AvatarFrameDecoration,
  AvatarFrameDecorationDocument,
} from '../schemas/avatar-frame-decoration.schema';
import {
  SuggestedDecoration,
  SuggestedDecorationDocument,
} from '../schemas/suggested-decoration.schema';
import { UsersService } from '../users/users.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class ShopService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(AvatarDecoration.name)
    private avatarDecorationModel: Model<AvatarDecorationDocument>,
    @InjectModel(AvatarFrameDecoration.name)
    private avatarFrameDecorationModel: Model<AvatarFrameDecorationDocument>,
    @InjectModel(BackgroundDecoration.name)
    private backgroundDecorationModel: Model<BackgroundDecorationDocument>,
    @InjectModel(CardDecoration.name)
    private cardDecorationModel: Model<CardDecorationDocument>,
    @InjectModel(SuggestedDecoration.name)
    private suggestedDecorationModel: Model<SuggestedDecorationDocument>,
    private usersService: UsersService,
    @Inject(CACHE_MANAGER)
    private cacheManager: {
      get: (k: string) => Promise<unknown>;
      set: (k: string, v: unknown) => Promise<void>;
      del?: (k: string) => Promise<void>;
    },
  ) {
    this.logger.setContext(ShopService.name);
  }

  // Get all available decorations
  async getAllDecorations() {
    const cacheKey = 'shop:decorations:all';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached as Awaited<ReturnType<ShopService['getAllDecorations']>>;

    this.logger.log('Fetching all available decorations');

    const inStockFilter = {
      isAvailable: true,
      $or: [
        { quantity: { $exists: false } },
        { quantity: null },
        { quantity: { $gt: 0 } },
      ],
    };
    const [avatars, frames, backgrounds, cards] = await Promise.all([
      this.avatarDecorationModel.find(inStockFilter).populate('authorId', 'username').lean(),
      this.avatarFrameDecorationModel.find(inStockFilter).populate('authorId', 'username').lean(),
      this.backgroundDecorationModel.find(inStockFilter).populate('authorId', 'username').lean(),
      this.cardDecorationModel.find(inStockFilter).populate('authorId', 'username').lean(),
    ]);

    const result = {
      avatars,
      frames,
      backgrounds,
      cards,
    };
    await this.cacheManager.set(cacheKey, result);
    return result;
  }

  /** Admin: all decorations (including unavailable/out of stock). No cache. */
  async getAllDecorationsAdmin() {
    this.logger.log('Fetching all decorations (admin)');
    const [avatars, frames, backgrounds, cards] = await Promise.all([
      this.avatarDecorationModel.find({}),
      this.avatarFrameDecorationModel.find({}),
      this.backgroundDecorationModel.find({}),
      this.cardDecorationModel.find({}),
    ]);
    return { avatars, frames, backgrounds, cards };
  }

  // Get decorations by type
  async getDecorationsByType(
    type: 'avatar' | 'frame' | 'background' | 'card',
  ) {
    const cacheKey = `shop:decorations:${type}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached as Awaited<ReturnType<ShopService['getDecorationsByType']>>;

    this.logger.log(`Fetching ${type} decorations`);

    const inStockFilter = {
      isAvailable: true,
      $or: [
        { quantity: { $exists: false } },
        { quantity: null },
        { quantity: { $gt: 0 } },
      ],
    };
    let decorations;
    switch (type) {
      case 'avatar':
        decorations = await this.avatarDecorationModel
          .find(inStockFilter)
          .populate('authorId', 'username')
          .lean();
        break;
      case 'frame':
        decorations = await this.avatarFrameDecorationModel
          .find(inStockFilter)
          .populate('authorId', 'username')
          .lean();
        break;
      case 'background':
        decorations = await this.backgroundDecorationModel
          .find(inStockFilter)
          .populate('authorId', 'username')
          .lean();
        break;
      case 'card':
        decorations = await this.cardDecorationModel
          .find(inStockFilter)
          .populate('authorId', 'username')
          .lean();
        break;
      default:
        throw new BadRequestException('Invalid decoration type');
    }

    await this.cacheManager.set(cacheKey, decorations);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return decorations;
  }

  // Purchase decoration
  async purchaseDecoration(
    userId: string,
    decorationType: 'avatar' | 'frame' | 'background' | 'card',
    decorationId: string,
  ) {
    this.logger.log(
      `User ${userId} attempting to purchase ${decorationType} decoration ${decorationId}`,
    );

    if (!Types.ObjectId.isValid(decorationId)) {
      throw new BadRequestException('Invalid decoration ID');
    }

    // Get user
    const user = await this.usersService.findById(userId);

    // Check if user already owns this decoration
    const alreadyOwned = user.ownedDecorations.some(
      (owned) =>
        owned.decorationType === decorationType &&
        owned.decorationId.toString() === decorationId,
    );

    if (alreadyOwned) {
      throw new BadRequestException('You already own this decoration');
    }

    // Get decoration and check price
    let decoration: any;
    let price: number;

    switch (decorationType) {
      case 'avatar':
        decoration = await this.avatarDecorationModel.findById(decorationId);
        if (!decoration || !decoration.isAvailable) {
          throw new NotFoundException(
            'Avatar decoration not found or not available',
          );
        }
        price = decoration.price;
        break;
      case 'background':
        decoration =
          await this.backgroundDecorationModel.findById(decorationId);
        if (!decoration || !decoration.isAvailable) {
          throw new NotFoundException(
            'Background decoration not found or not available',
          );
        }
        price = decoration.price;
        break;
      case 'frame':
        decoration =
          await this.avatarFrameDecorationModel.findById(decorationId);
        if (!decoration || !decoration.isAvailable) {
          throw new NotFoundException(
            'Avatar frame decoration not found or not available',
          );
        }
        price = decoration.price;
        break;
      case 'card':
        decoration = await this.cardDecorationModel.findById(decorationId);
        if (!decoration || !decoration.isAvailable) {
          throw new NotFoundException(
            'Card decoration not found or not available',
          );
        }
        price = decoration.price;
        break;
    }

    // Если задано ограничение по количеству — проверяем остаток и не продаём при 0
    if (
      decoration.quantity !== undefined &&
      decoration.quantity !== null &&
      decoration.quantity < 1
    ) {
      throw new BadRequestException('This decoration is out of stock');
    }

    // Check if user has enough balance (coerce to number: DB may return string). Price 0 = free.
    const userBalance = Number(user.balance ?? 0);
    const requiredPrice = Number(price);
    if (requiredPrice > 0 && userBalance < requiredPrice) {
      throw new BadRequestException(
        `Insufficient balance (available: ${userBalance}, required: ${requiredPrice})`,
      );
    }

    // Атомарно уменьшаем остаток, если задано ограничение по количеству
    if (
      decoration.quantity !== undefined &&
      decoration.quantity !== null
    ) {
      const oid = new Types.ObjectId(decorationId);
      let decremented = false;
      switch (decorationType) {
        case 'avatar':
          decremented =
            (await this.avatarDecorationModel.findOneAndUpdate(
              { _id: oid, quantity: { $gte: 1 } },
              { $inc: { quantity: -1 } },
            )) != null;
          break;
        case 'background':
          decremented =
            (await this.backgroundDecorationModel.findOneAndUpdate(
              { _id: oid, quantity: { $gte: 1 } },
              { $inc: { quantity: -1 } },
            )) != null;
          break;
        case 'frame':
          decremented =
            (await this.avatarFrameDecorationModel.findOneAndUpdate(
              { _id: oid, quantity: { $gte: 1 } },
              { $inc: { quantity: -1 } },
            )) != null;
          break;
        case 'card':
          decremented =
            (await this.cardDecorationModel.findOneAndUpdate(
              { _id: oid, quantity: { $gte: 1 } },
              { $inc: { quantity: -1 } },
            )) != null;
          break;
      }
      if (!decremented) {
        throw new BadRequestException('This decoration is out of stock');
      }
    }

    // Deduct balance (free if price 0) and add decoration to owned list
    const newBalance = requiredPrice > 0 ? userBalance - requiredPrice : userBalance;
    const updatedOwnedDecorations = [
      ...(user.ownedDecorations || []),
      {
        decorationType,
        decorationId: new Types.ObjectId(decorationId),
        purchasedAt: new Date(),
      },
    ];

    const updateUserDto = {
      balance: newBalance,
      ownedDecorations: updatedOwnedDecorations,
    };

    await this.usersService.update(userId, updateUserDto);

    // Author royalty: 10% of sale price to decoration author (only when price > 0)
    const authorId =
      decoration.authorId != null ? String(decoration.authorId) : null;
    if (requiredPrice > 0 && authorId) {
      const royalty = Math.floor(requiredPrice * 0.1);
      if (royalty > 0) {
        try {
          await this.usersService.addBalance(authorId, royalty);
          this.logger.log(
            `Author ${authorId} received ${royalty} coins (10%) for decoration ${decorationId} sale`,
          );
        } catch (err) {
          this.logger.warn(`Failed to pay author royalty: ${(err as Error).message}`);
        }
      }
    }

    void this.usersService.checkAchievementsForUser(userId);

    this.logger.log(
      `User ${userId} successfully purchased ${decorationType} decoration ${decorationId}`,
    );
    return {
      message: 'Decoration purchased successfully',
      decoration,
      newBalance,
    };
  }

  // Equip decoration
  async equipDecoration(
    userId: string,
    decorationType: 'avatar' | 'frame' | 'background' | 'card',
    decorationId: string,
  ) {
    this.logger.log(
      `User ${userId} equipping ${decorationType} decoration ${decorationId}`,
    );

    if (!Types.ObjectId.isValid(decorationId)) {
      throw new BadRequestException('Invalid decoration ID');
    }

    // Get user
    const user = await this.usersService.findById(userId);

    // Check if user owns this decoration
    const ownsDecoration = user.ownedDecorations.some(
      (owned) =>
        owned.decorationType === decorationType &&
        owned.decorationId.toString() === decorationId,
    );

    if (!ownsDecoration) {
      throw new BadRequestException('You do not own this decoration');
    }

    // Equip the decoration
    user.equippedDecorations[decorationType] = new Types.ObjectId(decorationId);

    // Create UpdateUserDto from user object
    const updateUserDto: any = {
      equippedDecorations: user.equippedDecorations,
    };

    await this.usersService.update(userId, updateUserDto);

    this.logger.log(
      `User ${userId} successfully equipped ${decorationType} decoration ${decorationId}`,
    );
    return {
      message: 'Decoration equipped successfully',
      equippedDecorations: user.equippedDecorations,
    };
  }

  // Unequip decoration
  async unequipDecoration(
    userId: string,
    decorationType: 'avatar' | 'frame' | 'background' | 'card',
  ) {
    this.logger.log(`User ${userId} unequipping ${decorationType} decoration`);

    // Get user
    const user = await this.usersService.findById(userId);

    // Unequip the decoration
    user.equippedDecorations[decorationType] = null;

    // Create UpdateUserDto from user object
    const updateUserDto: any = {
      equippedDecorations: user.equippedDecorations,
    };

    await this.usersService.update(userId, updateUserDto);

    this.logger.log(
      `User ${userId} successfully unequipped ${decorationType} decoration`,
    );
    return {
      message: 'Decoration unequipped successfully',
      equippedDecorations: user.equippedDecorations,
    };
  }

  // Admin: upload new decoration
  async uploadDecoration(
    type: 'avatar' | 'frame' | 'background' | 'card',
    file: Express.Multer.File,
    payload: {
      name: string;
      price: number;
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      description?: string;
      isAvailable?: boolean;
      quantity?: number | null;
      authorId?: Types.ObjectId;
    },
  ) {
    if (!file || !file.filename) {
      throw new BadRequestException('Image file is required');
    }

    const imageUrl = `/uploads/decorations/${file.filename}`;

    const doc: Record<string, unknown> = {
      name: payload.name,
      imageUrl,
      price: Number(payload.price),
      rarity: payload.rarity,
      description: payload.description ?? '',
      isAvailable: payload.isAvailable !== false,
    };
    if (payload.quantity !== undefined && payload.quantity !== null) {
      doc.quantity = payload.quantity;
    }
    if (payload.authorId) {
      doc.authorId = payload.authorId;
    }

    let decoration;
    switch (type) {
      case 'avatar':
        decoration = await this.avatarDecorationModel.create(doc);
        break;
      case 'frame':
        decoration = await this.avatarFrameDecorationModel.create(doc);
        break;
      case 'background':
        decoration = await this.backgroundDecorationModel.create(doc);
        break;
      case 'card':
        decoration = await this.cardDecorationModel.create(doc);
        break;
      default:
        throw new BadRequestException('Invalid decoration type');
    }

    await this.cacheManager.set('shop:decorations:all', undefined as unknown);
    await this.cacheManager.set(`shop:decorations:${type}`, undefined as unknown);
    if (typeof this.cacheManager.del === 'function') {
      await this.cacheManager.del('shop:decorations:all');
      await this.cacheManager.del(`shop:decorations:${type}`);
    }

    this.logger.log(
      `Admin uploaded ${type} decoration: ${decoration._id} (${payload.name})`,
    );
    return decoration;
  }

  /** Admin: create decoration from JSON (no file). */
  async createDecoration(payload: {
    name: string;
    description?: string;
    price: number;
    imageUrl: string;
    type: 'avatar' | 'frame' | 'background' | 'card';
    rarity?: 'common' | 'rare' | 'epic' | 'legendary';
    isAvailable?: boolean;
    quantity?: number | null;
    authorId?: Types.ObjectId;
  }) {
    const doc: Record<string, unknown> = {
      name: payload.name,
      imageUrl: payload.imageUrl,
      price: Number(payload.price),
      rarity: payload.rarity ?? 'common',
      description: payload.description ?? '',
      isAvailable: payload.isAvailable !== false,
    };
    if (payload.quantity !== undefined && payload.quantity !== null) {
      doc.quantity = payload.quantity;
    }
    if (payload.authorId) {
      doc.authorId = payload.authorId;
    }
    let decoration;
    switch (payload.type) {
      case 'avatar':
        decoration = await this.avatarDecorationModel.create(doc);
        break;
      case 'frame':
        decoration = await this.avatarFrameDecorationModel.create(doc);
        break;
      case 'background':
        decoration = await this.backgroundDecorationModel.create(doc);
        break;
      case 'card':
        decoration = await this.cardDecorationModel.create(doc);
        break;
      default:
        throw new BadRequestException('Invalid decoration type');
    }
    await this.cacheManager.set('shop:decorations:all', undefined as unknown);
    await this.cacheManager.set(
      `shop:decorations:${payload.type}`,
      undefined as unknown,
    );
    if (typeof this.cacheManager.del === 'function') {
      await this.cacheManager.del('shop:decorations:all');
      await this.cacheManager.del(`shop:decorations:${payload.type}`);
    }
    this.logger.log(
      `Admin created ${payload.type} decoration: ${decoration._id} (${payload.name})`,
    );
    return decoration;
  }

  /** Admin: delete decoration by id (searches all decoration collections). */
  async deleteDecoration(id: string) {
    const oid = new Types.ObjectId(id);
    let deleted = false;
    let type: string = '';
    for (const [model, name] of [
      [this.avatarDecorationModel, 'avatar'],
      [this.avatarFrameDecorationModel, 'frame'],
      [this.backgroundDecorationModel, 'background'],
      [this.cardDecorationModel, 'card'],
    ] as const) {
      const res = await (model as Model<{ _id: Types.ObjectId }>).findByIdAndDelete(oid);
      if (res) {
        deleted = true;
        type = name;
        break;
      }
    }
    if (!deleted) {
      throw new NotFoundException('Decoration not found');
    }
    await this.cacheManager.set('shop:decorations:all', undefined as unknown);
    if (type) {
      await this.cacheManager.set(`shop:decorations:${type}`, undefined as unknown);
      if (typeof this.cacheManager.del === 'function') {
        await this.cacheManager.del('shop:decorations:all');
        await this.cacheManager.del(`shop:decorations:${type}`);
      }
    }
    this.logger.log(`Admin deleted decoration: ${id}`);
    return { message: 'Decoration deleted successfully' };
  }

  /** Admin: update decoration with optional new image file (multipart). */
  async updateDecorationWithFile(
    id: string,
    file: Express.Multer.File | null,
    updates: Partial<{
      name: string;
      price: number;
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      description: string;
      isAvailable: boolean;
      quantity: number | null;
    }>,
  ) {
    const imageUrl = file?.filename ? `/uploads/decorations/${file.filename}` : undefined;
    return this.updateDecoration(id, { ...updates, ...(imageUrl && { imageUrl }) });
  }

  // Admin: update decoration by id (searches avatar, frame, background, card)
  async updateDecoration(
    id: string,
    updates: Partial<{
      name: string;
      imageUrl: string;
      price: number;
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      description: string;
      isAvailable: boolean;
      quantity: number | null;
    }>,
  ) {
    const oid = new Types.ObjectId(id);
    let decoration:
      | AvatarDecorationDocument
      | AvatarFrameDecorationDocument
      | BackgroundDecorationDocument
      | CardDecorationDocument
      | null = await this.avatarDecorationModel.findById(oid);
    let type: 'avatar' | 'frame' | 'background' | 'card' = 'avatar';
    if (!decoration) {
      decoration = await this.avatarFrameDecorationModel.findById(oid);
      type = 'frame';
    }
    if (!decoration) {
      decoration = await this.backgroundDecorationModel.findById(oid);
      type = 'background';
    }
    if (!decoration) {
      decoration = await this.cardDecorationModel.findById(oid);
      type = 'card';
    }
    if (!decoration) {
      throw new NotFoundException('Decoration not found');
    }
    if (updates.name !== undefined) decoration.name = updates.name;
    if (updates.imageUrl !== undefined) decoration.imageUrl = updates.imageUrl;
    if (updates.price !== undefined) decoration.price = updates.price;
    if (updates.rarity !== undefined) decoration.rarity = updates.rarity;
    if (updates.description !== undefined)
      decoration.description = updates.description;
    if (updates.isAvailable !== undefined)
      decoration.isAvailable = updates.isAvailable;
    if (updates.quantity !== undefined)
      decoration.quantity =
        updates.quantity === null ? undefined : updates.quantity;
    await decoration.save();

    await this.cacheManager.set('shop:decorations:all', undefined as unknown);
    await this.cacheManager.set(
      `shop:decorations:${type}`,
      undefined as unknown,
    );
    if (typeof this.cacheManager.del === 'function') {
      await this.cacheManager.del('shop:decorations:all');
      await this.cacheManager.del(`shop:decorations:${type}`);
    }
    this.logger.log(
      `Admin updated ${type} decoration: ${decoration._id}`,
    );
    return decoration;
  }

  // Get user's owned decorations (bulk fetch to avoid N+1 queries)
  async getUserDecorations(userId: string) {
    this.logger.log(`Fetching owned decorations for user ${userId}`);

    const user = await this.usersService.findById(userId);

    const avatarIds = user.ownedDecorations
      .filter((o) => o.decorationType === 'avatar')
      .map((o) => o.decorationId);
    const frameIds = user.ownedDecorations
      .filter((o) => o.decorationType === 'frame')
      .map((o) => o.decorationId);
    const backgroundIds = user.ownedDecorations
      .filter((o) => o.decorationType === 'background')
      .map((o) => o.decorationId);
    const cardIds = user.ownedDecorations
      .filter((o) => o.decorationType === 'card')
      .map((o) => o.decorationId);

    const [avatars, frames, backgrounds, cards] = await Promise.all([
      avatarIds.length > 0
        ? this.avatarDecorationModel.find({ _id: { $in: avatarIds } })
        : [],
      frameIds.length > 0
        ? this.avatarFrameDecorationModel.find({ _id: { $in: frameIds } })
        : [],
      backgroundIds.length > 0
        ? this.backgroundDecorationModel.find({ _id: { $in: backgroundIds } })
        : [],
      cardIds.length > 0
        ? this.cardDecorationModel.find({ _id: { $in: cardIds } })
        : [],
    ]);

    const avatarMap = new Map<string, AvatarDecorationDocument>(
      (avatars as AvatarDecorationDocument[]).map((a) => [
        a._id.toString(),
        a,
      ]),
    );
    const frameMap = new Map<string, AvatarFrameDecorationDocument>(
      (frames as AvatarFrameDecorationDocument[]).map((f) => [
        f._id.toString(),
        f,
      ]),
    );
    const backgroundMap = new Map<string, BackgroundDecorationDocument>(
      (backgrounds as BackgroundDecorationDocument[]).map((b) => [
        b._id.toString(),
        b,
      ]),
    );
    const cardMap = new Map<string, CardDecorationDocument>(
      (cards as CardDecorationDocument[]).map((c) => [c._id.toString(), c]),
    );

    const ownedAvatars = user.ownedDecorations
      .filter((o) => o.decorationType === 'avatar')
      .map((owned) => {
        const avatar = avatarMap.get(owned.decorationId.toString());
        return avatar
          ? { ...avatar.toObject(), purchasedAt: owned.purchasedAt }
          : null;
      })
      .filter(Boolean);

    const ownedFrames = user.ownedDecorations
      .filter((o) => o.decorationType === 'frame')
      .map((owned) => {
        const frame = frameMap.get(owned.decorationId.toString());
        return frame
          ? { ...frame.toObject(), purchasedAt: owned.purchasedAt }
          : null;
      })
      .filter(Boolean);

    const ownedBackgrounds = user.ownedDecorations
      .filter((o) => o.decorationType === 'background')
      .map((owned) => {
        const background = backgroundMap.get(owned.decorationId.toString());
        return background
          ? { ...background.toObject(), purchasedAt: owned.purchasedAt }
          : null;
      })
      .filter(Boolean);

    const ownedCards = user.ownedDecorations
      .filter((o) => o.decorationType === 'card')
      .map((owned) => {
        const card = cardMap.get(owned.decorationId.toString());
        return card
          ? { ...card.toObject(), purchasedAt: owned.purchasedAt }
          : null;
      })
      .filter(Boolean);

    const equippedFrameId = user.equippedDecorations?.frame?.toString() ?? null;
    const equippedAvatarId = user.equippedDecorations?.avatar?.toString() ?? null;
    const equippedBackgroundId =
      user.equippedDecorations?.background?.toString() ?? null;
    const equippedCardId = user.equippedDecorations?.card?.toString() ?? null;

    const toDecorationItem = (
      type: 'avatar' | 'frame' | 'background' | 'card',
      doc: { _id: Types.ObjectId; imageUrl?: string },
    ) => {
      const id = doc._id.toString();
      const equipped =
        (type === 'frame' && id === equippedFrameId) ||
        (type === 'avatar' && id === equippedAvatarId) ||
        (type === 'background' && id === equippedBackgroundId) ||
        (type === 'card' && id === equippedCardId);
      return {
        id,
        type,
        imageUrl: doc.imageUrl ?? '',
        isEquipped: equipped,
      };
    };

    const decorations = [
      ...(ownedAvatars as Array<{ _id: Types.ObjectId; imageUrl?: string }>).map(
        (d) => toDecorationItem('avatar', d),
      ),
      ...(ownedFrames as Array<{ _id: Types.ObjectId; imageUrl?: string }>).map(
        (d) => toDecorationItem('frame', d),
      ),
      ...(ownedBackgrounds as Array<{
        _id: Types.ObjectId;
        imageUrl?: string;
      }>).map((d) => toDecorationItem('background', d)),
      ...(ownedCards as Array<{ _id: Types.ObjectId; imageUrl?: string }>).map(
        (d) => toDecorationItem('card', d),
      ),
    ];

    return {
      ownedAvatars,
      ownedFrames,
      ownedBackgrounds,
      ownedCards,
      equippedDecorations: user.equippedDecorations,
      decorations,
    };
  }

  // --- Suggested decorations (user proposals + voting) ---

  /** Цена в магазине по количеству голосов: 0–4 голоса = бесплатно, иначе 50 + votes*15 (макс 500). */
  private priceByVotes(votesCount: number): number {
    if (votesCount < 5) return 0;
    return Math.min(500, 50 + votesCount * 15);
  }

  async getSuggestedDecorations(status: 'pending' | 'accepted' | 'rejected' = 'pending') {
    const list = await this.suggestedDecorationModel
      .aggregate([
        { $match: { status } },
        {
          $addFields: {
            votesCount: { $size: { $ifNull: ['$votedUserIds', []] } },
          },
        },
        { $sort: { votesCount: -1, createdAt: -1 } },
      ])
      .exec();
    return list.map((s: any) => ({
      id: s._id.toString(),
      type: s.type,
      name: s.name,
      description: s.description ?? '',
      imageUrl: s.imageUrl,
      authorId: s.authorId?.toString(),
      votesCount: s.votesCount ?? 0,
      status: s.status,
      createdAt: s.createdAt,
      userHasVoted: false,
    }));
  }

  async getSuggestedDecorationsWithUserVote(userId: string | null) {
    const list = await this.getSuggestedDecorations('pending');
    if (!userId) return list;
    const oid = new Types.ObjectId(userId);
    const withVote = await this.suggestedDecorationModel
      .find({ status: 'pending' })
      .select('_id votedUserIds')
      .lean();
    const votedSet = new Set<string>();
    for (const s of withVote) {
      const ids = (s as any).votedUserIds as Types.ObjectId[];
      if (ids?.some((id: Types.ObjectId) => id.equals(oid))) {
        votedSet.add((s as any)._id.toString());
      }
    }
    return list.map((s) => ({
      ...s,
      userHasVoted: votedSet.has(s.id),
    }));
  }

  /** Один пользователь — одно предложение в неделю (по автору, за последние 7 дней). */
  private async checkUserCanSuggest(userId: string): Promise<void> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existing = await this.suggestedDecorationModel.findOne({
      authorId: new Types.ObjectId(userId),
      createdAt: { $gte: weekAgo },
    });
    if (existing) {
      throw new BadRequestException(
        'Один аккаунт может предложить только одну декорацию в неделю. Повторите через неделю после предыдущего предложения.',
      );
    }
  }

  async createSuggestion(
    userId: string,
    payload: {
      type: 'avatar' | 'frame' | 'background' | 'card';
      name: string;
      description?: string;
      imageUrl: string;
    },
  ) {
    await this.checkUserCanSuggest(userId);

    const suggestion = await this.suggestedDecorationModel.create({
      type: payload.type,
      name: payload.name.trim(),
      description: payload.description?.trim() ?? '',
      imageUrl: payload.imageUrl,
      authorId: new Types.ObjectId(userId),
      votedUserIds: [],
      status: 'pending',
    });
    this.logger.log(
      `User ${userId} suggested ${payload.type} decoration: ${suggestion._id} (${payload.name})`,
    );
    return {
      id: suggestion._id.toString(),
      type: suggestion.type,
      name: suggestion.name,
      description: suggestion.description,
      imageUrl: suggestion.imageUrl,
      authorId: suggestion.authorId.toString(),
      votesCount: 0,
      status: suggestion.status,
      createdAt: suggestion.createdAt,
    };
  }

  async deleteSuggestion(suggestionId: string) {
    const oid = new Types.ObjectId(suggestionId);
    const suggestion = await this.suggestedDecorationModel.findByIdAndDelete(oid);
    if (!suggestion) {
      throw new NotFoundException('Suggested decoration not found');
    }
    this.logger.log(`Suggestion ${suggestionId} deleted (admin)`);
    return { message: 'Suggestion deleted successfully' };
  }

  async voteSuggestion(suggestionId: string, userId: string) {
    const oid = new Types.ObjectId(suggestionId);
    const suggestion = await this.suggestedDecorationModel.findById(oid);
    if (!suggestion) {
      throw new NotFoundException('Suggested decoration not found');
    }
    if (suggestion.status !== 'pending') {
      throw new BadRequestException('This suggestion is no longer accepting votes');
    }
    const userOid = new Types.ObjectId(userId);
    const hasVoted = suggestion.votedUserIds.some((id) => id.equals(userOid));
    if (hasVoted) {
      throw new BadRequestException('You have already voted for this suggestion');
    }
    suggestion.votedUserIds.push(userOid);
    await suggestion.save();
    this.logger.log(`User ${userId} voted for suggestion ${suggestionId}`);
    return {
      votesCount: suggestion.votedUserIds.length,
      userHasVoted: true,
    };
  }

  /** Редактирование предложения только автором и только в течение 1 часа после создания. */
  async updateSuggestion(
    suggestionId: string,
    userId: string,
    payload: { name?: string; description?: string; imageUrl?: string },
  ) {
    const oid = new Types.ObjectId(suggestionId);
    const suggestion = await this.suggestedDecorationModel.findById(oid);
    if (!suggestion) {
      throw new NotFoundException('Suggested decoration not found');
    }
    if (suggestion.status !== 'pending') {
      throw new BadRequestException('Это предложение больше нельзя редактировать');
    }
    const userOid = new Types.ObjectId(userId);
    if (!suggestion.authorId.equals(userOid)) {
      throw new BadRequestException('Редактировать может только автор предложения');
    }
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const createdAt = suggestion.createdAt instanceof Date ? suggestion.createdAt : new Date(suggestion.createdAt);
    if (createdAt < oneHourAgo) {
      throw new BadRequestException(
        'Редактировать предложение можно только в течение 1 часа после отправки. Время вышло.',
      );
    }
    if (payload.name !== undefined) suggestion.name = payload.name.trim();
    if (payload.description !== undefined) suggestion.description = payload.description?.trim() ?? '';
    if (payload.imageUrl !== undefined) suggestion.imageUrl = payload.imageUrl;
    await suggestion.save();
    this.logger.log(`User ${userId} updated suggestion ${suggestionId}`);
    return {
      id: suggestion._id.toString(),
      type: suggestion.type,
      name: suggestion.name,
      description: suggestion.description,
      imageUrl: suggestion.imageUrl,
      authorId: suggestion.authorId.toString(),
      votesCount: suggestion.votedUserIds.length,
      status: suggestion.status,
      createdAt: suggestion.createdAt,
    };
  }

  /** Еженедельно: принять предложение с наибольшим числом голосов и добавить в магазин. Цена от голосов. */
  async acceptWeeklyWinner() {
    const pending = await this.suggestedDecorationModel
      .aggregate([
        { $match: { status: 'pending' } },
        { $addFields: { votesCount: { $size: { $ifNull: ['$votedUserIds', []] } } } },
        { $sort: { votesCount: -1, createdAt: -1 } },
        { $limit: 1 },
      ])
      .exec();
    if (pending.length === 0) {
      this.logger.log('Accept weekly winner: no pending suggestions');
      return null;
    }
    const winner = pending[0] as any;
    const suggestionId = winner._id.toString();
    const votesCount = Array.isArray(winner.votedUserIds) ? winner.votedUserIds.length : 0;
    const price = this.priceByVotes(votesCount);
    const authorId = winner.authorId;

    const doc: Record<string, unknown> = {
      name: winner.name,
      imageUrl: winner.imageUrl,
      price,
      rarity: 'common',
      description: winner.description ?? '',
      isAvailable: true,
      authorId: authorId ?? undefined,
    };

    let decoration: any;
    switch (winner.type) {
      case 'avatar':
        decoration = await this.avatarDecorationModel.create(doc);
        break;
      case 'frame':
        decoration = await this.avatarFrameDecorationModel.create(doc);
        break;
      case 'background':
        decoration = await this.backgroundDecorationModel.create(doc);
        break;
      case 'card':
        decoration = await this.cardDecorationModel.create(doc);
        break;
      default:
        this.logger.warn(`Accept weekly winner: unknown type ${winner.type}`);
        return null;
    }

    await this.suggestedDecorationModel.findByIdAndUpdate(winner._id, {
      status: 'accepted',
      acceptedDecorationId: decoration._id,
      acceptedAt: new Date(),
    });

    // Удалить остальные ожидающие предложения после выбора победителя
    const deleteResult = await this.suggestedDecorationModel.deleteMany({
      status: 'pending',
      _id: { $ne: winner._id },
    });
    this.logger.log(
      `Deleted ${deleteResult.deletedCount} other pending suggestions after accepting winner`,
    );

    if (typeof this.cacheManager.del === 'function') {
      await this.cacheManager.del('shop:decorations:all');
      await this.cacheManager.del(`shop:decorations:${winner.type}`);
    }

    this.logger.log(
      `Accepted weekly winner suggestion ${suggestionId} -> ${winner.type} decoration ${decoration._id} (price=${price}, votes=${votesCount})`,
    );
    return {
      suggestionId,
      decorationId: decoration._id.toString(),
      type: winner.type,
      price,
      votesCount,
    };
  }
}
