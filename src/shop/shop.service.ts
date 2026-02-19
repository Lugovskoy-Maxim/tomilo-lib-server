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
import { UsersService } from '../users/users.service';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class ShopService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(AvatarDecoration.name)
    private avatarDecorationModel: Model<AvatarDecorationDocument>,
    @InjectModel(BackgroundDecoration.name)
    private backgroundDecorationModel: Model<BackgroundDecorationDocument>,
    @InjectModel(CardDecoration.name)
    private cardDecorationModel: Model<CardDecorationDocument>,
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

    const [avatars, backgrounds, cards] = await Promise.all([
      this.avatarDecorationModel.find({ isAvailable: true }),
      this.backgroundDecorationModel.find({ isAvailable: true }),
      this.cardDecorationModel.find({ isAvailable: true }),
    ]);

    const result = {
      avatars,
      backgrounds,
      cards,
    };
    await this.cacheManager.set(cacheKey, result);
    return result;
  }

  // Get decorations by type
  async getDecorationsByType(type: 'avatar' | 'background' | 'card') {
    const cacheKey = `shop:decorations:${type}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached as Awaited<ReturnType<ShopService['getDecorationsByType']>>;

    this.logger.log(`Fetching ${type} decorations`);

    let decorations;
    switch (type) {
      case 'avatar':
        decorations = await this.avatarDecorationModel.find({
          isAvailable: true,
        });
        break;
      case 'background':
        decorations = await this.backgroundDecorationModel.find({
          isAvailable: true,
        });
        break;
      case 'card':
        decorations = await this.cardDecorationModel.find({
          isAvailable: true,
        });
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
    decorationType: 'avatar' | 'background' | 'card',
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

    // Check if user has enough balance
    if (user.balance < price) {
      throw new BadRequestException('Insufficient balance');
    }

    // Deduct balance and add decoration to owned list
    user.balance -= price;
    user.ownedDecorations.push({
      decorationType,
      decorationId: new Types.ObjectId(decorationId),
      purchasedAt: new Date(),
    });

    // Create UpdateUserDto from user object
    const updateUserDto = {
      balance: user.balance,
      ownedDecorations: user.ownedDecorations,
    };

    await this.usersService.update(userId, updateUserDto);

    this.logger.log(
      `User ${userId} successfully purchased ${decorationType} decoration ${decorationId}`,
    );
    return {
      message: 'Decoration purchased successfully',
      decoration,
      newBalance: user.balance,
    };
  }

  // Equip decoration
  async equipDecoration(
    userId: string,
    decorationType: 'avatar' | 'background' | 'card',
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
    decorationType: 'avatar' | 'background' | 'card',
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
    type: 'avatar' | 'background' | 'card',
    file: Express.Multer.File,
    payload: {
      name: string;
      price: number;
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      description?: string;
      isAvailable?: boolean;
    },
  ) {
    if (!file || !file.filename) {
      throw new BadRequestException('Image file is required');
    }

    const imageUrl = `/uploads/decorations/${file.filename}`;

    const doc = {
      name: payload.name,
      imageUrl,
      price: Number(payload.price),
      rarity: payload.rarity,
      description: payload.description ?? '',
      isAvailable: payload.isAvailable !== false,
    };

    let decoration;
    switch (type) {
      case 'avatar':
        decoration = await this.avatarDecorationModel.create(doc);
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

  // Get user's owned decorations (bulk fetch to avoid N+1 queries)
  async getUserDecorations(userId: string) {
    this.logger.log(`Fetching owned decorations for user ${userId}`);

    const user = await this.usersService.findById(userId);

    const avatarIds = user.ownedDecorations
      .filter((o) => o.decorationType === 'avatar')
      .map((o) => o.decorationId);
    const backgroundIds = user.ownedDecorations
      .filter((o) => o.decorationType === 'background')
      .map((o) => o.decorationId);
    const cardIds = user.ownedDecorations
      .filter((o) => o.decorationType === 'card')
      .map((o) => o.decorationId);

    const [avatars, backgrounds, cards] = await Promise.all([
      avatarIds.length > 0
        ? this.avatarDecorationModel.find({ _id: { $in: avatarIds } })
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

    return {
      ownedAvatars,
      ownedBackgrounds,
      ownedCards,
      equippedDecorations: user.equippedDecorations,
    };
  }
}
