import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TranslatorTeam,
  TranslatorTeamDocument,
} from '../schemas/translator-team.schema';
import { Title, TitleDocument } from '../schemas/title.schema';
import { CreateTranslatorTeamDto } from './dto/create-translator-team.dto';
import { UpdateTranslatorTeamDto } from './dto/update-translator-team.dto';
import { AddMemberDto } from './dto/add-member.dto';

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toResponse(doc: TranslatorTeamDocument) {
  const obj = doc.toObject ? doc.toObject() : doc;
  const id = (obj as any)._id?.toString?.();
  return {
    ...obj,
    _id: id || (obj as any)._id,
    chaptersCount: 0,
    subscribersCount: 0,
    totalViews: 0,
    members: ((obj as any).members || []).map((m: any) => ({
      ...m,
      _id: m._id?.toString?.() ?? m._id,
      userId: m.userId?.toString?.(),
    })),
    titleIds: ((obj as any).titleIds || []).map((id: any) =>
      typeof id === 'string' ? id : id?.toString?.() ?? id,
    ),
  };
}

@Injectable()
export class TranslatorTeamsService {
  constructor(
    @InjectModel(TranslatorTeam.name)
    private teamModel: Model<TranslatorTeamDocument>,
    @InjectModel(Title.name)
    private titleModel: Model<TitleDocument>,
  ) {}

  async getTitlesForTeam(titleIds: Types.ObjectId[]) {
    if (!titleIds?.length) return [];
    const titles = await this.titleModel
      .find({ _id: { $in: titleIds } })
      .select('name slug coverImage totalChapters')
      .lean()
      .exec();
    return titles.map((t: any) => ({
      _id: t._id?.toString?.() ?? t._id,
      name: t.name,
      slug: t.slug,
      coverImage: t.coverImage,
      totalChapters: t.totalChapters ?? 0,
    }));
  }

  async findAll(options: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { isActive: { $ne: false } };
    if (options.search?.trim()) {
      query.$or = [
        { name: { $regex: options.search.trim(), $options: 'i' } },
        { description: { $regex: options.search.trim(), $options: 'i' } },
      ];
    }

    const [teams, total] = await Promise.all([
      this.teamModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.teamModel.countDocuments(query),
    ]);

    return {
      teams: teams.map((t) => toResponse(t as unknown as TranslatorTeamDocument)),
      total,
      page,
      limit,
    };
  }

  async findById(id: string): Promise<TranslatorTeamDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid team ID');
    }
    const team = await this.teamModel.findById(id).exec();
    if (!team) {
      throw new NotFoundException('Translator team not found');
    }
    return team;
  }

  async findBySlug(slug: string): Promise<TranslatorTeamDocument> {
    const team = await this.teamModel.findOne({ slug, isActive: { $ne: false } }).exec();
    if (!team) {
      throw new NotFoundException('Translator team not found');
    }
    return team;
  }

  async findByTitleId(titleId: string) {
    if (!Types.ObjectId.isValid(titleId)) {
      return [];
    }
    const oid = new Types.ObjectId(titleId);
    const teams = await this.teamModel
      .find({ titleIds: oid, isActive: { $ne: false } })
      .sort({ name: 1 })
      .lean()
      .exec();
    return teams.map((t) => toResponse(t as unknown as TranslatorTeamDocument));
  }

  async create(dto: CreateTranslatorTeamDto): Promise<TranslatorTeamDocument> {
    const slug = dto.slug?.trim() || slugify(dto.name) || `team-${Date.now()}`;
    const existing = await this.teamModel.findOne({ slug }).exec();
    if (existing) {
      throw new ConflictException(`Team with slug "${slug}" already exists`);
    }

    const members = (dto.members || []).map((m) => ({
      _id: new Types.ObjectId(),
      userId: m.userId ? new Types.ObjectId(m.userId) : undefined,
      name: m.name,
      avatar: m.avatar,
      role: m.role,
      socialLinks: m.socialLinks || {},
    }));

    const titleIds = (dto.titleIds || [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const doc = new this.teamModel({
      name: dto.name,
      slug,
      description: dto.description ?? '',
      avatar: dto.avatar,
      banner: dto.banner,
      members,
      titleIds,
      socialLinks: dto.socialLinks ?? {},
      donationLinks: dto.donationLinks ?? {},
      isVerified: dto.isVerified ?? false,
      isActive: dto.isActive !== false,
    });
    const saved = await doc.save();
    return saved;
  }

  async update(
    id: string,
    dto: UpdateTranslatorTeamDto,
  ): Promise<TranslatorTeamDocument> {
    const team = await this.findById(id);

    if (dto.slug !== undefined && dto.slug.trim()) {
      const slug = dto.slug.trim();
      const existing = await this.teamModel
        .findOne({ slug, _id: { $ne: team._id } })
        .exec();
      if (existing) {
        throw new ConflictException(`Team with slug "${slug}" already exists`);
      }
    }

    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.slug !== undefined) update.slug = dto.slug.trim() || slugify(team.name);
    if (dto.description !== undefined) update.description = dto.description;
    if (dto.avatar !== undefined) update.avatar = dto.avatar;
    if (dto.banner !== undefined) update.banner = dto.banner;
    if (dto.socialLinks !== undefined) update.socialLinks = dto.socialLinks;
    if (dto.donationLinks !== undefined) update.donationLinks = dto.donationLinks;
    if (dto.isVerified !== undefined) update.isVerified = dto.isVerified;
    if (dto.isActive !== undefined) update.isActive = dto.isActive;
    if (dto.members !== undefined) {
      update.members = dto.members.map((m) => ({
        _id: new Types.ObjectId(),
        userId: m.userId ? new Types.ObjectId(m.userId) : undefined,
        name: m.name,
        avatar: m.avatar,
        role: m.role,
        socialLinks: m.socialLinks || {},
      }));
    }
    if (dto.titleIds !== undefined) {
      update.titleIds = dto.titleIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
    }

    const updated = await this.teamModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Translator team not found');
    return updated;
  }

  async delete(id: string): Promise<void> {
    const team = await this.findById(id);
    await this.teamModel.findByIdAndDelete(team._id).exec();
  }

  async addMember(teamId: string, dto: AddMemberDto): Promise<TranslatorTeamDocument> {
    const team = await this.findById(teamId);
    const newMember = {
      _id: new Types.ObjectId(),
      userId: dto.userId ? new Types.ObjectId(dto.userId) : undefined,
      name: dto.name,
      avatar: dto.avatar,
      role: dto.role,
      socialLinks: {},
    };
    const updated = await this.teamModel
      .findByIdAndUpdate(
        teamId,
        { $push: { members: newMember } },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Translator team not found');
    return updated;
  }

  async removeMember(
    teamId: string,
    memberId: string,
  ): Promise<TranslatorTeamDocument> {
    await this.findById(teamId);
    if (!Types.ObjectId.isValid(memberId)) {
      throw new BadRequestException('Invalid member ID');
    }
    const updated = await this.teamModel
      .findByIdAndUpdate(
        teamId,
        { $pull: { members: { _id: new Types.ObjectId(memberId) } } },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Translator team not found');
    return updated;
  }

  async addTitle(teamId: string, titleId: string): Promise<TranslatorTeamDocument> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }
    const team = await this.findById(teamId);
    const oid = new Types.ObjectId(titleId);
    if (team.titleIds.some((id) => id.equals(oid))) {
      return team;
    }
    const updated = await this.teamModel
      .findByIdAndUpdate(
        teamId,
        { $addToSet: { titleIds: oid } },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Translator team not found');
    return updated;
  }

  async removeTitle(
    teamId: string,
    titleId: string,
  ): Promise<TranslatorTeamDocument> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }
    await this.findById(teamId);
    const updated = await this.teamModel
      .findByIdAndUpdate(
        teamId,
        { $pull: { titleIds: new Types.ObjectId(titleId) } },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Translator team not found');
    return updated;
  }
}
