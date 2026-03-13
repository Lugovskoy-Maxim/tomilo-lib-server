import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CardDecoration,
  CardDecorationDocument,
  CARD_STAGE_ORDER,
  CardStage,
  CardStageRank,
} from '../schemas/card-decoration.schema';
import {
  CardDeck,
  CardDeckDocument,
  CardDeckPityRarity,
} from '../schemas/card-deck.schema';
import { Character, CharacterDocument } from '../schemas/character.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { GameItemsService } from './game-items.service';

const DEFAULT_REQUIRED_LEVELS: Record<CardStageRank, number> = {
  F: 1,
  E: 5,
  D: 9,
  C: 13,
  B: 18,
  A: 24,
  S: 30,
  SS: 36,
  SSS: 42,
};

function stageIndex(rank: string | undefined | null): number {
  return CARD_STAGE_ORDER.indexOf((rank ?? 'F') as CardStageRank);
}

function normalizeStageRank(rank: string | undefined | null): CardStageRank {
  return CARD_STAGE_ORDER[stageIndex(rank)] ?? 'F';
}

function getNextStageRank(rank: string | undefined | null): CardStageRank | null {
  const idx = stageIndex(rank);
  if (idx < 0 || idx >= CARD_STAGE_ORDER.length - 1) return null;
  return CARD_STAGE_ORDER[idx + 1];
}

function sortStages(stages: CardStage[] = []): CardStage[] {
  return [...stages].sort((a, b) => stageIndex(a.rank) - stageIndex(b.rank));
}

function ensurePositiveNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getEntityId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const raw = value as { _id?: { toString(): string }; toString?: () => string };
    if (raw._id?.toString) return raw._id.toString();
    if (raw.toString) return raw.toString();
  }
  return null;
}

const RARITY_ORDER: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

function rarityScore(rarity: string | undefined | null): number {
  return RARITY_ORDER[String(rarity ?? 'common').toLowerCase()] ?? 0;
}

@Injectable()
export class CardsService {
  constructor(
    @InjectModel(CardDecoration.name)
    private cardDecorationModel: Model<CardDecorationDocument>,
    @InjectModel(CardDeck.name)
    private cardDeckModel: Model<CardDeckDocument>,
    @InjectModel(Character.name)
    private characterModel: Model<CharacterDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private gameItemsService: GameItemsService,
  ) {}

  private getStageConfig(
    stages: CardStage[] | undefined,
    rank: string | undefined | null,
  ): CardStage | null {
    const normalized = normalizeStageRank(rank);
    const found = sortStages(stages).find((stage) => stage.rank === normalized);
    return found ?? null;
  }

  private getRequiredLevelForStage(
    stages: CardStage[] | undefined,
    rank: string | undefined | null,
  ): number {
    const normalized = normalizeStageRank(rank);
    const config = this.getStageConfig(stages, normalized);
    return Math.max(
      1,
      ensurePositiveNumber(config?.requiredLevel, DEFAULT_REQUIRED_LEVELS[normalized]),
    );
  }

  private getDiscipleLevelForCharacter(user: UserDocument | any, characterId: string): number {
    const disciple = (user.disciples ?? []).find(
      (entry: any) =>
        (entry.characterId?.toString?.() ?? String(entry.characterId)) === characterId,
    );
    return disciple?.level ?? 0;
  }

  private hasInventoryItem(user: UserDocument | any, itemId: string, count: number): boolean {
    if (!itemId || count <= 0) return true;
    const entry = (user.inventory ?? []).find((item: any) => item.itemId === itemId);
    return (entry?.count ?? 0) >= count;
  }

  private getDeckPityConfig(deck: CardDeckDocument | any) {
    const isTitleDeck = !!getEntityId(deck?.titleId);
    const defaultThreshold = isTitleDeck ? 5 : 8;
    const defaultRarity: CardDeckPityRarity = isTitleDeck ? 'epic' : 'rare';
    return {
      threshold: Math.max(0, ensurePositiveNumber(deck?.pityThreshold, defaultThreshold)),
      targetRarity: String(deck?.pityTargetRarity ?? defaultRarity) as CardDeckPityRarity,
    };
  }

  private getDeckPityEntry(user: UserDocument | any, deckId: string) {
    return (user?.cardDeckPity ?? []).find(
      (entry: any) => entry.deckId?.toString?.() === deckId,
    );
  }

  private serializeDeck(deck: CardDeckDocument | any, user?: UserDocument | any) {
    const pity = this.getDeckPityConfig(deck);
    const deckId = deck?._id?.toString?.() ?? deck?.id?.toString?.() ?? '';
    const pityEntry = user ? this.getDeckPityEntry(user, deckId) : null;
    const titleId = getEntityId(deck?.titleId);
    return {
      _id: deckId,
      id: deckId,
      name: deck?.name ?? '',
      description: deck?.description ?? '',
      imageUrl: deck?.imageUrl ?? '',
      price: deck?.price ?? 0,
      isAvailable: deck?.isAvailable ?? true,
      quantity:
        deck?.quantity === undefined || deck?.quantity === null
          ? undefined
          : Number(deck.quantity),
      titleId,
      titleName: deck?.titleId?.title ?? deck?.titleId?.name ?? '',
      cardsPerOpen: deck?.cardsPerOpen ?? 3,
      titleFocusChance: deck?.titleFocusChance ?? 0.75,
      isTitleDeck: !!titleId,
      isPremium: !!titleId,
      pityThreshold: pity.threshold,
      pityTargetRarity: pity.targetRarity,
      pityProgress: pityEntry?.misses ?? 0,
      pityRemaining:
        pity.threshold > 0
          ? Math.max(0, pity.threshold - (pityEntry?.misses ?? 0))
          : 0,
    };
  }

  private sortCardsForShowcase(cards: any[], mode: string | undefined | null) {
    if (!mode || mode === 'manual') return cards;
    return [...cards].sort((a, b) => {
      if (mode === 'rarity') {
        return (
          rarityScore(b.rarity) - rarityScore(a.rarity) ||
          stageIndex(b.currentStage) - stageIndex(a.currentStage) ||
          (a.characterName ?? '').localeCompare(b.characterName ?? '')
        );
      }
      if (mode === 'favorites') {
        return (
          Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)) ||
          rarityScore(b.rarity) - rarityScore(a.rarity) ||
          (a.characterName ?? '').localeCompare(b.characterName ?? '')
        );
      }
      if (mode === 'last_upgraded') {
        return (
          new Date(b.lastUpgradedAt ?? 0).getTime() -
            new Date(a.lastUpgradedAt ?? 0).getTime() ||
          rarityScore(b.rarity) - rarityScore(a.rarity) ||
          (a.characterName ?? '').localeCompare(b.characterName ?? '')
        );
      }
      return 0;
    });
  }

  private serializeCard(card: any, entry?: any, user?: UserDocument | any) {
    const currentStage = normalizeStageRank(entry?.currentStage ?? 'F');
    const nextStage = getNextStageRank(currentStage);
    const discipleLevel = card?.characterId?._id
      ? this.getDiscipleLevelForCharacter(user, card.characterId._id.toString())
      : 0;
    const currentStageConfig = this.getStageConfig(card?.stages, currentStage);
    const nextStageConfig = nextStage ? this.getStageConfig(card?.stages, nextStage) : null;
    const requiredLevel = nextStage
      ? this.getRequiredLevelForStage(card?.stages, nextStage)
      : null;
    const canUpgradeByLevel = nextStage ? discipleLevel >= (requiredLevel ?? 0) : false;
    const hasNextStageImage = !!nextStageConfig?.imageUrl;
    const hasUpgradeMaterials = nextStageConfig
      ? this.hasInventoryItem(
          user,
          nextStageConfig.upgradeItemId ?? '',
          nextStageConfig.upgradeItemCount ?? 0,
        )
      : false;
    const hasCoins = nextStageConfig
      ? (user?.balance ?? 0) >= (nextStageConfig.upgradeCoins ?? 0)
      : false;
    const favoriteIds = new Set(
      (user?.favoriteCharacters ?? []).map((favorite: any) => favorite?.toString?.()),
    );
    const characterId = card?.characterId?._id?.toString?.() ?? null;
    const nextStageShardCost = Math.max(
      0,
      ensurePositiveNumber(nextStageConfig?.upgradeItemCount, 0),
    );
    const upgradeBlockReason = !nextStage
      ? 'max_stage'
      : !hasNextStageImage
        ? 'missing_stage_image'
        : !canUpgradeByLevel
          ? 'disciple_level_too_low'
          : !hasCoins
            ? 'not_enough_coins'
            : !hasUpgradeMaterials
              ? 'missing_upgrade_materials'
              : null;

    return {
      id: card?._id?.toString?.() ?? '',
      name: card?.name ?? '',
      description: card?.description ?? '',
      imageUrl: card?.imageUrl ?? currentStageConfig?.imageUrl ?? '',
      price: card?.price ?? 0,
      rarity: card?.rarity ?? 'common',
      characterId,
      characterName: card?.characterId?.name ?? '',
      characterAvatar: card?.characterId?.avatar ?? '',
      titleId: getEntityId(card?.titleId),
      titleName: card?.titleId?.title ?? card?.titleId?.name ?? '',
      currentStage,
      copies: entry?.copies ?? 0,
      shards: entry?.shards ?? 0,
      lastUpgradedAt: entry?.lastUpgradedAt ?? null,
      isFavorite: characterId ? favoriteIds.has(characterId) : false,
      stageImageUrl: currentStageConfig?.imageUrl ?? '',
      stages: sortStages(card?.stages).map((stage) => ({
        rank: stage.rank,
        imageUrl: stage.imageUrl ?? '',
        requiredLevel: this.getRequiredLevelForStage(card?.stages, stage.rank),
        upgradeCoins: stage.upgradeCoins ?? 0,
        upgradeItemId: stage.upgradeItemId ?? '',
        upgradeItemCount: stage.upgradeItemCount ?? 0,
        upgradeSuccessChance: stage.upgradeSuccessChance ?? 1,
      })),
      progression: {
        discipleLevel,
        nextStage,
        nextStageImageUrl: nextStageConfig?.imageUrl ?? '',
        nextStageRequiredLevel: requiredLevel,
        nextStageUpgradeCoins: nextStageConfig?.upgradeCoins ?? 0,
        nextStageUpgradeItemId: nextStageConfig?.upgradeItemId ?? '',
        nextStageUpgradeItemCount: nextStageConfig?.upgradeItemCount ?? 0,
        nextStageShardCost,
        nextStageSuccessChance: nextStageConfig?.upgradeSuccessChance ?? 1,
        canUpgradeByLevel,
        hasNextStageImage,
        hasUpgradeMaterials,
        hasCoins,
        upgradeBlockReason,
        shardProgress: {
          current: entry?.shards ?? 0,
          required: nextStageShardCost,
          enough: nextStageShardCost <= 0 ? true : (entry?.shards ?? 0) >= nextStageShardCost,
        },
        copyOverflow: Math.max(0, entry?.copies ?? 0),
        canUpgrade:
          !!nextStage &&
          canUpgradeByLevel &&
          hasNextStageImage &&
          hasUpgradeMaterials &&
          hasCoins,
      },
    };
  }

  async listCardsAdmin() {
    const cards = await this.cardDecorationModel
      .find({})
      .populate('characterId', 'name avatar titleId')
      .populate('titleId', 'title name')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return { cards };
  }

  async createCard(body: {
    name: string;
    description?: string;
    price?: number;
    imageUrl?: string;
    rarity?: string;
    isAvailable?: boolean;
    quantity?: number | null;
    characterId: string;
    stages: CardStage[];
  }) {
    if (!Types.ObjectId.isValid(body.characterId)) {
      throw new BadRequestException('Неверный characterId');
    }
    const character = await this.characterModel
      .findById(new Types.ObjectId(body.characterId))
      .select('_id name titleId')
      .lean()
      .exec();
    if (!character) {
      throw new NotFoundException('Персонаж не найден');
    }
    const existing = await this.cardDecorationModel
      .findOne({ characterId: character._id })
      .select('_id')
      .lean()
      .exec();
    if (existing) {
      throw new BadRequestException('Карточка для этого персонажа уже существует');
    }
    const stages = sortStages((body.stages ?? []).map((stage) => ({
      ...stage,
      rank: normalizeStageRank(stage.rank),
      requiredLevel: this.getRequiredLevelForStage(body.stages, stage.rank),
      upgradeCoins: Math.max(0, ensurePositiveNumber(stage.upgradeCoins, 0)),
      upgradeItemCount: Math.max(0, ensurePositiveNumber(stage.upgradeItemCount, 0)),
      upgradeSuccessChance: Math.min(
        1,
        Math.max(0, ensurePositiveNumber(stage.upgradeSuccessChance, 1)),
      ),
    } as CardStage)));
    const baseStage = stages.find((stage) => stage.rank === 'F');
    const imageUrl = body.imageUrl || baseStage?.imageUrl || '';
    const card = await this.cardDecorationModel.create({
      name: body.name.trim(),
      description: body.description ?? '',
      imageUrl,
      price: Math.max(0, ensurePositiveNumber(body.price, 0)),
      rarity: body.rarity ?? 'common',
      isAvailable: body.isAvailable !== false,
      quantity: body.quantity ?? undefined,
      characterId: character._id,
      titleId: character.titleId,
      stages,
    });
    return card.toObject();
  }

  async updateCard(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      price: number;
      imageUrl: string;
      rarity: string;
      isAvailable: boolean;
      quantity: number | null;
      characterId: string;
      stages: CardStage[];
    }>,
  ) {
    const card = await this.cardDecorationModel.findById(new Types.ObjectId(id));
    if (!card) throw new NotFoundException('Карточка не найдена');
    if (body.characterId) {
      if (!Types.ObjectId.isValid(body.characterId)) {
        throw new BadRequestException('Неверный characterId');
      }
      const character = await this.characterModel
        .findById(new Types.ObjectId(body.characterId))
        .select('_id titleId')
        .lean()
        .exec();
      if (!character) throw new NotFoundException('Персонаж не найден');
      const existing = await this.cardDecorationModel
        .findOne({
          _id: { $ne: card._id },
          characterId: character._id,
        })
        .select('_id')
        .lean()
        .exec();
      if (existing) {
        throw new BadRequestException('Карточка для этого персонажа уже существует');
      }
      card.characterId = character._id;
      card.titleId = character.titleId as Types.ObjectId;
    }
    if (body.name !== undefined) card.name = body.name;
    if (body.description !== undefined) card.description = body.description;
    if (body.price !== undefined) card.price = Math.max(0, Number(body.price));
    if (body.imageUrl !== undefined) card.imageUrl = body.imageUrl;
    if (body.rarity !== undefined) card.rarity = body.rarity;
    if (body.isAvailable !== undefined) card.isAvailable = body.isAvailable;
    if (body.quantity !== undefined) {
      card.quantity = body.quantity === null ? undefined : Number(body.quantity);
    }
    if (body.stages !== undefined) {
      card.stages = sortStages(
        (body.stages ?? []).map((stage) => ({
          ...stage,
          rank: normalizeStageRank(stage.rank),
          requiredLevel: this.getRequiredLevelForStage(body.stages, stage.rank),
          upgradeCoins: Math.max(0, ensurePositiveNumber(stage.upgradeCoins, 0)),
          upgradeItemCount: Math.max(0, ensurePositiveNumber(stage.upgradeItemCount, 0)),
          upgradeSuccessChance: Math.min(
            1,
            Math.max(0, ensurePositiveNumber(stage.upgradeSuccessChance, 1)),
          ),
        } as CardStage)),
      ) as any;
      if (!body.imageUrl) {
        const currentImage = this.getStageConfig(card.stages, 'F')?.imageUrl;
        if (currentImage) card.imageUrl = currentImage;
      }
    }
    await card.save();
    return card.toObject();
  }

  async deleteCard(id: string) {
    const card = await this.cardDecorationModel.findByIdAndDelete(
      new Types.ObjectId(id),
    );
    if (!card) throw new NotFoundException('Карточка не найдена');
    return { message: 'Deleted' };
  }

  async listDecksAdmin() {
    const decks = await this.cardDeckModel
      .find({})
      .populate('titleId', 'title name')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return { decks };
  }

  async createDeck(body: {
    name: string;
    description?: string;
    imageUrl: string;
    price?: number;
    isAvailable?: boolean;
    quantity?: number | null;
    titleId?: string | null;
    cardsPerOpen?: number;
    titleFocusChance?: number;
    pityThreshold?: number;
    pityTargetRarity?: CardDeckPityRarity;
  }) {
    const isTitleDeck = Boolean(body.titleId);
    const doc: Record<string, unknown> = {
      name: body.name.trim(),
      description: body.description ?? '',
      imageUrl: body.imageUrl,
      price: Math.max(0, ensurePositiveNumber(body.price, 0)),
      isAvailable: body.isAvailable !== false,
      quantity: body.quantity ?? undefined,
      cardsPerOpen: Math.max(1, ensurePositiveNumber(body.cardsPerOpen, 3)),
      titleFocusChance: Math.min(
        1,
        Math.max(
          0,
          ensurePositiveNumber(body.titleFocusChance, isTitleDeck ? 0.8 : 0.75),
        ),
      ),
      pityThreshold: Math.max(
        0,
        ensurePositiveNumber(body.pityThreshold, isTitleDeck ? 5 : 8),
      ),
      pityTargetRarity: body.pityTargetRarity ?? (isTitleDeck ? 'epic' : 'rare'),
    };
    if (body.titleId) {
      doc.titleId = new Types.ObjectId(body.titleId);
    }
    const deck = await this.cardDeckModel.create(doc);
    return deck.toObject();
  }

  async updateDeck(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      imageUrl: string;
      price: number;
      isAvailable: boolean;
      quantity: number | null;
      titleId: string | null;
      cardsPerOpen: number;
      titleFocusChance: number;
      pityThreshold: number;
      pityTargetRarity: CardDeckPityRarity;
    }>,
  ) {
    const deck = await this.cardDeckModel.findById(new Types.ObjectId(id));
    if (!deck) throw new NotFoundException('Колода не найдена');
    if (body.name !== undefined) deck.name = body.name;
    if (body.description !== undefined) deck.description = body.description;
    if (body.imageUrl !== undefined) deck.imageUrl = body.imageUrl;
    if (body.price !== undefined) deck.price = Math.max(0, Number(body.price));
    if (body.isAvailable !== undefined) deck.isAvailable = body.isAvailable;
    if (body.quantity !== undefined) {
      deck.quantity = body.quantity === null ? undefined : Number(body.quantity);
    }
    if (body.titleId !== undefined) {
      deck.titleId = body.titleId ? new Types.ObjectId(body.titleId) : null;
    }
    if (body.cardsPerOpen !== undefined) {
      deck.cardsPerOpen = Math.max(1, Number(body.cardsPerOpen));
    }
    if (body.titleFocusChance !== undefined) {
      deck.titleFocusChance = Math.min(1, Math.max(0, Number(body.titleFocusChance)));
    }
    if (body.pityThreshold !== undefined) {
      deck.pityThreshold = Math.max(0, Number(body.pityThreshold));
    }
    if (body.pityTargetRarity !== undefined) {
      deck.pityTargetRarity = body.pityTargetRarity;
    }
    await deck.save();
    return deck.toObject();
  }

  async deleteDeck(id: string) {
    const deck = await this.cardDeckModel.findByIdAndDelete(
      new Types.ObjectId(id),
    );
    if (!deck) throw new NotFoundException('Колода не найдена');
    return { message: 'Deleted' };
  }

  async getPublicDecks() {
    const filter = {
      isAvailable: true,
      $or: [
        { quantity: { $exists: false } },
        { quantity: null },
        { quantity: { $gt: 0 } },
      ],
    };
    const decks = await this.cardDeckModel
      .find(filter)
      .populate('titleId', 'title name')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return {
      decks: decks.map((deck) => this.serializeDeck(deck)),
    };
  }

  async grantCardToUser(userId: string, cardId: string, amount = 1) {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    const card = await this.cardDecorationModel
      .findById(new Types.ObjectId(cardId))
      .populate('characterId', 'name avatar')
      .populate('titleId', 'title name')
      .lean()
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const ownedCards = [...(user.ownedCards ?? [])];
    const existingIndex = ownedCards.findIndex(
      (entry: any) => entry.cardId?.toString?.() === cardId,
    );
    let isNew = false;
    let shardsGained = 0;

    if (existingIndex < 0) {
      ownedCards.push({
        cardId: new Types.ObjectId(cardId),
        currentStage: 'F',
        copies: 1,
        shards: Math.max(0, amount - 1),
        unlockedAt: new Date(),
        lastUpgradedAt: null,
      } as any);
      isNew = true;
      shardsGained = Math.max(0, amount - 1);
    } else {
      ownedCards[existingIndex].copies = (ownedCards[existingIndex].copies ?? 1) + amount;
      ownedCards[existingIndex].shards = (ownedCards[existingIndex].shards ?? 0) + amount;
      shardsGained = amount;
    }

    user.ownedCards = ownedCards as any;
    user.markModified('ownedCards');
    await user.save();

    const updatedEntry = ownedCards.find(
      (entry: any) => entry.cardId?.toString?.() === cardId,
    );

    return {
      isNew,
      shardsGained,
      card: this.serializeCard(card, updatedEntry, user),
    };
  }

  async getProfileCards(userId: string) {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select(
        'ownedCards profileCardsShowcase profileCardsShowcaseSort balance inventory disciples favoriteCharacters',
      )
      .lean()
      .exec();
    if (!user) throw new NotFoundException('User not found');

    const cardIds = Array.from(
      new Set(
        (user.ownedCards ?? []).map((entry: any) => entry.cardId?.toString?.()).filter(Boolean),
      ),
    );
    if (cardIds.length === 0) {
      return {
        cards: [],
        showcase: [],
        showcaseSort: (user as any).profileCardsShowcaseSort ?? 'manual',
        stats: { total: 0, uniqueTitles: 0 },
      };
    }

    const cards = await this.cardDecorationModel
      .find({ _id: { $in: cardIds.map((id) => new Types.ObjectId(id)) } })
      .populate('characterId', 'name avatar')
      .populate('titleId', 'title name')
      .lean()
      .exec();
    const cardMap = new Map(cards.map((card: any) => [card._id.toString(), card]));
    const serialized = (user.ownedCards ?? [])
      .map((entry: any) => {
        const card = cardMap.get(entry.cardId?.toString?.());
        if (!card) return null;
        return this.serializeCard(card, entry, user);
      })
      .filter(Boolean);
    const showcaseIds = (user.profileCardsShowcase ?? []).map((id: any) => id?.toString?.());
    const showcase = this.sortCardsForShowcase(
      showcaseIds
      .map((id) => serialized.find((card: any) => card.id === id))
      .filter(Boolean),
      (user as any).profileCardsShowcaseSort ?? 'manual',
    );
    const uniqueTitles = new Set(serialized.map((card: any) => card.titleId).filter(Boolean));

    return {
      cards: serialized,
      showcase,
      showcaseSort: (user as any).profileCardsShowcaseSort ?? 'manual',
      stats: {
        total: serialized.length,
        uniqueTitles: uniqueTitles.size,
      },
    };
  }

  async updateProfileShowcase(
    userId: string,
    cardIds: string[],
    sortMode?: 'manual' | 'rarity' | 'favorites' | 'last_upgraded',
  ) {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    const owned = new Set(
      (user.ownedCards ?? []).map((entry: any) => entry.cardId?.toString?.()),
    );
    const uniqueIds = Array.from(new Set((cardIds ?? []).filter(Boolean))).slice(0, 6);
    const invalid = uniqueIds.filter((id) => !owned.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException('В витрину можно добавить только свои карточки');
    }
    user.profileCardsShowcase = uniqueIds.map((id) => new Types.ObjectId(id));
    if (sortMode) {
      user.profileCardsShowcaseSort = sortMode;
      user.markModified('profileCardsShowcaseSort');
    }
    user.markModified('profileCardsShowcase');
    await user.save();
    return this.getProfileCards(userId);
  }

  async upgradeCard(userId: string, cardId: string) {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    const entry = (user.ownedCards ?? []).find(
      (item: any) => item.cardId?.toString?.() === cardId,
    );
    if (!entry) {
      throw new NotFoundException('Карточка не найдена в коллекции');
    }
    const card = await this.cardDecorationModel
      .findById(new Types.ObjectId(cardId))
      .populate('characterId', 'name avatar')
      .populate('titleId', 'title name')
      .lean()
      .exec();
    if (!card) throw new NotFoundException('Карточка не найдена');
    const nextStage = getNextStageRank(entry.currentStage);
    if (!nextStage) {
      throw new BadRequestException('Карточка уже достигла максимального этапа');
    }
    const nextConfig = this.getStageConfig(card.stages, nextStage);
    if (!nextConfig?.imageUrl) {
      throw new BadRequestException(
        'Следующий этап не настроен: без картинки карточка не может быть улучшена',
      );
    }
    const characterId = card.characterId?._id?.toString?.() ?? '';
    const discipleLevel = this.getDiscipleLevelForCharacter(user, characterId);
    const requiredLevel = this.getRequiredLevelForStage(card.stages, nextStage);
    if (discipleLevel < requiredLevel) {
      throw new BadRequestException(
        `Нужен уровень ученика ${requiredLevel} для открытия этапа ${nextStage}`,
      );
    }
    const upgradeCoins = nextConfig.upgradeCoins ?? 0;
    if ((user.balance ?? 0) < upgradeCoins) {
      throw new BadRequestException('Недостаточно монет для улучшения карточки');
    }
    const upgradeItemId = nextConfig.upgradeItemId ?? '';
    const upgradeItemCount = nextConfig.upgradeItemCount ?? 0;
    if (
      upgradeItemId &&
      upgradeItemCount > 0 &&
      !this.hasInventoryItem(user, upgradeItemId, upgradeItemCount)
    ) {
      throw new BadRequestException('Недостаточно предметов для улучшения карточки');
    }

    user.balance = (user.balance ?? 0) - upgradeCoins;
    if (upgradeItemId && upgradeItemCount > 0) {
      await this.gameItemsService.deductFromInventory(
        userId,
        upgradeItemId,
        upgradeItemCount,
      );
    }

    const successChance = Math.min(
      1,
      Math.max(0, ensurePositiveNumber(nextConfig.upgradeSuccessChance, 1)),
    );
    const success = Math.random() <= successChance;
    if (success) {
      entry.currentStage = nextStage;
      entry.lastUpgradedAt = new Date();
    }
    user.markModified('ownedCards');
    user.markModified('balance');
    await user.save();

    return {
      success,
      card: this.serializeCard(card, entry, user),
      balance: user.balance ?? 0,
      consumed: {
        coins: upgradeCoins,
        itemId: upgradeItemId || null,
        itemCount: upgradeItemCount,
      },
    };
  }

  async tryGrantReadingCard(userId: string, titleId: string) {
    const cards = await this.cardDecorationModel
      .find({
        characterId: { $ne: null },
        isAvailable: true,
      })
      .populate('characterId', 'name avatar')
      .populate('titleId', 'title name')
      .lean()
      .exec();
    if (cards.length === 0) return null;
    const titleCards = cards.filter(
      (card: any) => getEntityId(card.titleId) === titleId,
    );
    const featuredPool = titleCards.length > 0 ? titleCards : cards;
    const useFeatured = Math.random() <= 0.78;
    const pool = useFeatured ? featuredPool : cards;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (!picked) return null;
    return this.grantCardToUser(userId, picked._id.toString(), 1);
  }

  private pickDeckCard(
    cards: any[],
    deck: CardDeckDocument | any,
    options?: { minRarity?: CardDeckPityRarity | null },
  ): any | null {
    if (cards.length === 0) return null;
    const filteredByRarity = options?.minRarity
      ? cards.filter((card: any) => rarityScore(card.rarity) >= rarityScore(options.minRarity))
      : cards;
    const basePool = filteredByRarity.length > 0 ? filteredByRarity : cards;
    const titleId = deck.titleId?.toString?.() ?? null;
    const titleCards = titleId
      ? basePool.filter((card: any) => getEntityId(card.titleId) === titleId)
      : [];
    const focused = titleCards.length > 0 && Math.random() <= (deck.titleFocusChance ?? 0.75);
    const pool = focused ? titleCards : basePool;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  async openDeck(userId: string, deckId: string) {
    const user = await this.userModel.findById(new Types.ObjectId(userId));
    if (!user) throw new NotFoundException('User not found');
    const deck = await this.cardDeckModel.findById(new Types.ObjectId(deckId));
    if (!deck || !deck.isAvailable) {
      throw new NotFoundException('Колода не найдена');
    }
    if (deck.quantity !== undefined && deck.quantity !== null && deck.quantity < 1) {
      throw new BadRequestException('Колода закончилась');
    }
    if ((user.balance ?? 0) < (deck.price ?? 0)) {
      throw new BadRequestException('Недостаточно монет для открытия колоды');
    }
    const pityConfig = this.getDeckPityConfig(deck);
    const deckPity = this.getDeckPityEntry(user, deckId);
    const forcePity =
      pityConfig.threshold > 0 && (deckPity?.misses ?? 0) >= pityConfig.threshold;
    const cards = await this.cardDecorationModel
      .find({
        isAvailable: true,
        characterId: { $ne: null },
      })
      .populate('characterId', 'name avatar')
      .populate('titleId', 'title name')
      .lean()
      .exec();
    if (cards.length === 0) {
      throw new BadRequestException('В магазине пока нет карточек для колод');
    }

    user.balance = (user.balance ?? 0) - (deck.price ?? 0);
    user.markModified('balance');
    await user.save();

    const openedCards: any[] = [];
    let hitPityTarget = false;
    let pityTriggered = false;
    for (let i = 0; i < (deck.cardsPerOpen ?? 3); i += 1) {
      const shouldForceThisPick = forcePity && !pityTriggered;
      const picked = this.pickDeckCard(cards, deck, {
        minRarity: shouldForceThisPick ? pityConfig.targetRarity : null,
      });
      if (!picked) continue;
      if (shouldForceThisPick) pityTriggered = true;
      if (rarityScore(picked.rarity) >= rarityScore(pityConfig.targetRarity)) {
        hitPityTarget = true;
      }
      const granted = await this.grantCardToUser(userId, picked._id.toString(), 1);
      openedCards.push(granted);
    }

    if (deck.quantity !== undefined && deck.quantity !== null) {
      deck.quantity = Math.max(0, deck.quantity - 1);
      await deck.save();
    }

    const updatedUser = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('balance cardDeckPity')
      .exec();

    if (updatedUser) {
      const pityIndex = (updatedUser.cardDeckPity ?? []).findIndex(
        (entry: any) => entry.deckId?.toString?.() === deckId,
      );
      const nextMisses = hitPityTarget ? 0 : (deckPity?.misses ?? 0) + 1;
      const nextEntry = {
        deckId: new Types.ObjectId(deckId),
        misses: nextMisses,
        lastOpenedAt: new Date(),
      };
      if (pityIndex >= 0) {
        (updatedUser.cardDeckPity as any)[pityIndex] = nextEntry;
      } else {
        updatedUser.cardDeckPity = [...(updatedUser.cardDeckPity ?? []), nextEntry] as any;
      }
      updatedUser.markModified('cardDeckPity');
      await updatedUser.save();
    }

    return {
      deck: this.serializeDeck(deck, updatedUser ?? user),
      openedCards,
      balance: (updatedUser as any)?.balance ?? user.balance ?? 0,
      pity: {
        triggered: pityTriggered,
        hitTarget: hitPityTarget,
        threshold: pityConfig.threshold,
        targetRarity: pityConfig.targetRarity,
        progress: this.getDeckPityEntry(updatedUser ?? user, deckId)?.misses ?? 0,
        remaining:
          pityConfig.threshold > 0
            ? Math.max(
                0,
                pityConfig.threshold -
                  (this.getDeckPityEntry(updatedUser ?? user, deckId)?.misses ?? 0),
              )
            : 0,
      },
    };
  }

  async resolveCardMediaForUser(
    userId: string,
    characterId: string,
  ): Promise<{ mediaUrl: string; mediaType: 'image'; label?: string } | null> {
    const user = await this.userModel
      .findById(new Types.ObjectId(userId))
      .select('ownedCards')
      .lean()
      .exec();
    if (!user) return null;
    const cardIds = (user.ownedCards ?? []).map((entry: any) => entry.cardId);
    if (cardIds.length === 0) return null;
    const cards = await this.cardDecorationModel
      .find({
        _id: { $in: cardIds },
        characterId: new Types.ObjectId(characterId),
      })
      .lean()
      .exec();
    const picked = cards[0];
    if (!picked) return null;
    const entry = (user.ownedCards ?? []).find(
      (item: any) => item.cardId?.toString?.() === picked._id.toString(),
    );
    const stage = this.getStageConfig(picked.stages, entry?.currentStage ?? 'F');
    if (!stage?.imageUrl) return null;
    return {
      mediaUrl: stage.imageUrl,
      mediaType: 'image',
      label: entry?.currentStage ?? 'F',
    };
  }
}
