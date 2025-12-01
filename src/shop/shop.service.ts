import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
  ) {
    this.logger.setContext(ShopService.name);
  }

  // Get all available decorations
  async getAllDecorations() {
    this.logger.log('Fetching all available decorations');

    const [avatars, backgrounds, cards] = await Promise.all([
      this.avatarDecorationModel.find({ isAvailable: true }),
      this.backgroundDecorationModel.find({ isAvailable: true }),
      this.cardDecorationModel.find({ isAvailable: true }),
    ]);

    return {
      avatars,
      backgrounds,
      cards,
    };
  }

  // Get decorations by type
  async getDecorationsByType(type: 'avatar' | 'background' | 'card') {
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

  // Get user's owned decorations
  async getUserDecorations(userId: string) {
    this.logger.log(`Fetching owned decorations for user ${userId}`);

    const user = await this.usersService.findById(userId);

    // Populate decoration details
    const ownedAvatars: any[] = [];
    const ownedBackgrounds: any[] = [];
    const ownedCards: any[] = [];

    for (const owned of user.ownedDecorations) {
      switch (owned.decorationType) {
        case 'avatar': {
          const avatar = await this.avatarDecorationModel.findById(
            owned.decorationId,
          );
          if (avatar)
            ownedAvatars.push({
              ...avatar.toObject(),
              purchasedAt: owned.purchasedAt,
            });
          break;
        }
        case 'background': {
          const background = await this.backgroundDecorationModel.findById(
            owned.decorationId,
          );
          if (background)
            ownedBackgrounds.push({
              ...background.toObject(),
              purchasedAt: owned.purchasedAt,
            });
          break;
        }
        case 'card': {
          const card = await this.cardDecorationModel.findById(
            owned.decorationId,
          );
          if (card)
            ownedCards.push({
              ...card.toObject(),
              purchasedAt: owned.purchasedAt,
            });
          break;
        }
      }
    }

    return {
      ownedAvatars,
      ownedBackgrounds,
      ownedCards,
      equippedDecorations: user.equippedDecorations,
    };
  }
}
