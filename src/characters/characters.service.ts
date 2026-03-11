import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Character,
  CharacterDocument,
  CharacterRole,
  CharacterModerationStatus,
} from '../schemas/character.schema';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { TitlesService } from '../titles/titles.service';
import { FilesService } from '../files/files.service';

@Injectable()
export class CharactersService {
  constructor(
    @InjectModel(Character.name)
    private characterModel: Model<CharacterDocument>,
    private titlesService: TitlesService,
    private filesService: FilesService,
  ) {}

  /** Список персонажей на модерации (для админов). */
  async findPendingForModeration(): Promise<CharacterDocument[]> {
    const list = await this.characterModel
      .find({
        $or: [
          { status: CharacterModerationStatus.PENDING },
          { pendingUpdate: { $exists: true, $ne: null } },
          { pendingImage: { $exists: true, $nin: [null, ''] } },
        ],
      })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return list.map((doc) => this.toResponse(doc)) as CharacterDocument[];
  }

  /** Список всех персонажей с пагинацией (для страницы /characters). Показываем всех, кроме явно отклонённых. */
  async findPaginated(
    page: number = 1,
    limit: number = 24,
  ): Promise<{ characters: CharacterDocument[]; total: number }> {
    const skip = Math.max(0, (page - 1) * limit);
    const cap = Math.min(100, Math.max(1, limit));
    const filter: Record<string, unknown> = {
      $or: [
        { status: { $ne: CharacterModerationStatus.REJECTED } },
        { status: { $exists: false } },
      ],
    };
    const [list, total] = await Promise.all([
      this.characterModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(skip)
        .limit(cap)
        .lean()
        .exec(),
      this.characterModel.countDocuments(filter),
    ]);
    return {
      characters: list.map((doc) =>
        this.toResponse(doc),
      ) as CharacterDocument[],
      total,
    };
  }

  async findByTitleId(titleId: string): Promise<CharacterDocument[]> {
    await this.titlesService.findById(titleId);
    const list = await this.characterModel
      .find({
        titleId: new Types.ObjectId(titleId),
        $or: [
          { status: CharacterModerationStatus.APPROVED },
          { status: { $exists: false } },
          { status: null },
        ],
      })
      .sort({ sortOrder: 1, name: 1 })
      .lean()
      .exec();
    return list.map((doc) => this.toResponse(doc)) as CharacterDocument[];
  }

  async findById(id: string): Promise<CharacterDocument> {
    const doc = await this.characterModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException('Character not found');
    }
    return this.toResponse(doc) as CharacterDocument;
  }

  async create(dto: CreateCharacterDto): Promise<CharacterDocument> {
    await this.titlesService.findById(dto.titleId);
    const role = dto.role ?? CharacterRole.OTHER;
    const doc = await this.characterModel.create({
      titleId: new Types.ObjectId(dto.titleId),
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      role,
      altNames: Array.isArray(dto.altNames) ? dto.altNames.filter(Boolean) : [],
      age: dto.age?.trim() || undefined,
      gender: dto.gender?.trim() || undefined,
      guild: dto.guild?.trim() || undefined,
      clan: dto.clan?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
      voiceActor: dto.voiceActor?.trim() || undefined,
      sortOrder: dto.sortOrder ?? 0,
      status: CharacterModerationStatus.APPROVED,
    });
    const saved = await doc.save();
    const out = await this.characterModel.findById(saved._id).lean().exec();
    return this.toResponse(out!) as CharacterDocument;
  }

  /** Создать персонажа со статусом «на модерации» (любой авторизованный пользователь). */
  async proposeCreate(
    dto: CreateCharacterDto,
    userId: string,
  ): Promise<CharacterDocument> {
    await this.titlesService.findById(dto.titleId);
    const role = dto.role ?? CharacterRole.OTHER;
    const doc = await this.characterModel.create({
      titleId: new Types.ObjectId(dto.titleId),
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      role,
      altNames: Array.isArray(dto.altNames) ? dto.altNames.filter(Boolean) : [],
      age: dto.age?.trim() || undefined,
      gender: dto.gender?.trim() || undefined,
      guild: dto.guild?.trim() || undefined,
      clan: dto.clan?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
      voiceActor: dto.voiceActor?.trim() || undefined,
      sortOrder: dto.sortOrder ?? 0,
      status: CharacterModerationStatus.PENDING,
      proposedBy: new Types.ObjectId(userId),
    });
    const saved = await doc.save();
    const out = await this.characterModel.findById(saved._id).lean().exec();
    return this.toResponse(out!) as CharacterDocument;
  }

  async proposeCreateWithImage(
    dto: CreateCharacterDto,
    file: Express.Multer.File,
    userId: string,
  ): Promise<CharacterDocument> {
    const created = await this.proposeCreate(dto, userId);
    const avatarPath = await this.filesService.saveCharacterAvatar(
      file,
      dto.titleId,
      created._id.toString(),
    );
    await this.characterModel
      .findByIdAndUpdate(created._id, { avatar: avatarPath })
      .exec();
    return this.findById(created._id.toString());
  }

  async createWithImage(
    dto: CreateCharacterDto,
    file: Express.Multer.File,
  ): Promise<CharacterDocument> {
    const created = await this.create(dto);
    const avatarPath = await this.filesService.saveCharacterAvatar(
      file,
      dto.titleId,
      created._id.toString(),
    );
    await this.characterModel
      .findByIdAndUpdate(created._id, { avatar: avatarPath })
      .exec();
    return this.findById(created._id.toString());
  }

  async update(
    id: string,
    dto: UpdateCharacterDto,
  ): Promise<CharacterDocument> {
    const existing = await this.characterModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Character not found');
    }
    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name.trim();
    if (dto.description !== undefined)
      update.description = dto.description?.trim() || null;
    if (dto.role !== undefined) update.role = dto.role;
    if (dto.altNames !== undefined)
      update.altNames = dto.altNames.filter(Boolean);
    if (dto.age !== undefined) update.age = dto.age?.trim() || null;
    if (dto.gender !== undefined) update.gender = dto.gender?.trim() || null;
    if (dto.guild !== undefined) update.guild = dto.guild?.trim() || null;
    if (dto.clan !== undefined) update.clan = dto.clan?.trim() || null;
    if (dto.notes !== undefined) update.notes = dto.notes?.trim() || null;
    if (dto.voiceActor !== undefined)
      update.voiceActor = dto.voiceActor?.trim() || null;
    if (dto.sortOrder !== undefined) update.sortOrder = dto.sortOrder;

    await this.characterModel.findByIdAndUpdate(id, { $set: update }).exec();
    return this.findById(id);
  }

  async updateImage(
    id: string,
    file: Express.Multer.File,
  ): Promise<CharacterDocument> {
    const existing = await this.characterModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Character not found');
    }
    const titleId = existing.titleId.toString();
    const avatarPath = await this.filesService.saveCharacterAvatar(
      file,
      titleId,
      id,
    );
    await this.characterModel
      .findByIdAndUpdate(id, { avatar: avatarPath })
      .exec();
    return this.findById(id);
  }

  /** Предложить правки к персонажу (на модерацию). Сохраняем в pendingUpdate. */
  async proposeUpdate(
    id: string,
    dto: UpdateCharacterDto,
    userId: string,
  ): Promise<CharacterDocument> {
    const existing = await this.characterModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Character not found');
    }
    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name.trim();
    if (dto.description !== undefined)
      update.description = dto.description?.trim() ?? null;
    if (dto.role !== undefined) update.role = dto.role;
    if (dto.altNames !== undefined)
      update.altNames = dto.altNames.filter(Boolean);
    if (dto.age !== undefined) update.age = dto.age?.trim() ?? null;
    if (dto.gender !== undefined) update.gender = dto.gender?.trim() ?? null;
    if (dto.guild !== undefined) update.guild = dto.guild?.trim() ?? null;
    if (dto.clan !== undefined) update.clan = dto.clan?.trim() ?? null;
    if (dto.notes !== undefined) update.notes = dto.notes?.trim() ?? null;
    if (dto.voiceActor !== undefined)
      update.voiceActor = dto.voiceActor?.trim() ?? null;
    if (dto.sortOrder !== undefined) update.sortOrder = dto.sortOrder;

    await this.characterModel
      .findByIdAndUpdate(id, {
        $set: {
          pendingUpdate: update,
          proposedBy: new Types.ObjectId(userId),
        },
      })
      .exec();
    return this.findById(id);
  }

  /** Предложить новое изображение персонажа (на модерацию). */
  async proposeImage(
    id: string,
    file: Express.Multer.File,
    userId: string,
  ): Promise<CharacterDocument> {
    const existing = await this.characterModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Character not found');
    }
    const titleId = existing.titleId.toString();
    const pendingPath = await this.filesService.saveCharacterPendingImage(
      file,
      titleId,
      id,
    );
    await this.characterModel
      .findByIdAndUpdate(id, {
        $set: {
          pendingImage: pendingPath,
          proposedBy: new Types.ObjectId(userId),
        },
      })
      .exec();
    return this.findById(id);
  }

  /** Одобрить персонажа или правки (только админ). */
  async approve(id: string): Promise<CharacterDocument> {
    const doc = await this.characterModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Character not found');
    }
    const setPayload: Record<string, unknown> = {
      status: CharacterModerationStatus.APPROVED,
    };
    const unsetPayload: Record<string, 1> = { pendingUpdate: 1, proposedBy: 1 };
    if (doc.pendingUpdate && typeof doc.pendingUpdate === 'object') {
      const pu = doc.pendingUpdate;
      if (pu.name !== undefined) setPayload.name = pu.name;
      if (pu.description !== undefined) setPayload.description = pu.description;
      if (pu.role !== undefined) setPayload.role = pu.role;
      if (pu.altNames !== undefined) setPayload.altNames = pu.altNames;
      if (pu.age !== undefined) setPayload.age = pu.age;
      if (pu.gender !== undefined) setPayload.gender = pu.gender;
      if (pu.guild !== undefined) setPayload.guild = pu.guild;
      if (pu.clan !== undefined) setPayload.clan = pu.clan;
      if (pu.notes !== undefined) setPayload.notes = pu.notes;
      if (pu.voiceActor !== undefined) setPayload.voiceActor = pu.voiceActor;
      if (pu.sortOrder !== undefined) setPayload.sortOrder = pu.sortOrder;
    }
    if (doc.pendingImage) {
      setPayload.avatar = doc.pendingImage;
      unsetPayload.pendingImage = 1;
    }
    await this.characterModel
      .findByIdAndUpdate(id, { $set: setPayload, $unset: unsetPayload })
      .exec();
    return this.findById(id);
  }

  /** Отклонить заявку: сбрасываем pending и ставим rejected (для новых) или просто очищаем pending. */
  async reject(id: string): Promise<CharacterDocument> {
    const doc = await this.characterModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Character not found');
    }
    if (
      doc.status === CharacterModerationStatus.PENDING &&
      !doc.pendingUpdate &&
      !doc.pendingImage
    ) {
      await this.characterModel
        .findByIdAndUpdate(id, {
          $set: { status: CharacterModerationStatus.REJECTED },
          $unset: { proposedBy: 1 },
        })
        .exec();
    } else {
      await this.characterModel
        .findByIdAndUpdate(id, {
          $unset: { pendingUpdate: 1, pendingImage: 1, proposedBy: 1 },
        })
        .exec();
    }
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.characterModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Character not found');
    }
    const titleId = existing.titleId.toString();
    await this.filesService.deleteCharacterAvatar(titleId, id);
    await this.characterModel.findByIdAndDelete(id).exec();
  }

  /** Формат ответа: добавляем image (alias avatar) и нормализуем id/titleId для клиента */
  private toResponse(doc: any): any {
    if (!doc) return doc;
    const id = doc._id?.toString?.() ?? doc._id;
    const titleId = doc.titleId?.toString?.() ?? doc.titleId;
    return {
      ...doc,
      _id: id,
      titleId,
      image: doc.avatar ?? undefined,
      status: doc.status ?? 'approved',
    };
  }
}
