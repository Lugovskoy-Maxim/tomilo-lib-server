import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Genre, GenreDocument } from '../schemas/genre.schema';
import { Title, TitleDocument } from '../schemas/title.schema';

@Injectable()
export class GenresAdminService {
  constructor(
    @InjectModel(Genre.name) private genreModel: Model<GenreDocument>,
    @InjectModel(Title.name) private titleModel: Model<TitleDocument>,
  ) {}

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u0400-\u04FF-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async findAll(params: {
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (params.search?.trim()) {
      const s = params.search.trim();
      filter.$or = [
        { name: new RegExp(s, 'i') },
        { slug: new RegExp(s, 'i') },
        { description: new RegExp(s, 'i') },
      ];
    }

    const [genres, total] = await Promise.all([
      this.genreModel
        .find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.genreModel.countDocuments(filter),
    ]);

    const genreIds = genres.map((g) => (g as { _id: Types.ObjectId })._id);
    const namesById = new Map<string, string>();
    for (const g of genres) {
      const id = (g as { _id: Types.ObjectId })._id.toString();
      const name = (g as { name: string }).name;
      namesById.set(id, name);
    }

    const counts = await this.titleModel.aggregate<{ _id: string; count: number }>([
      { $unwind: '$genres' },
      { $match: { genres: { $in: Array.from(namesById.values()) } } },
      { $group: { _id: '$genres', count: { $sum: 1 } } },
    ]);

    const countByName = new Map<string, number>();
    for (const c of counts) {
      countByName.set(c._id, c.count);
    }

    const list = genres.map((g) => {
      const doc = g as unknown as { _id: Types.ObjectId; name: string; slug: string; description?: string; createdAt?: Date; updatedAt?: Date };
      const name = doc.name;
      const titlesCount = countByName.get(name) ?? 0;
      return {
        _id: doc._id.toString(),
        name: doc.name,
        slug: doc.slug,
        description: doc.description ?? '',
        titlesCount,
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
      };
    });

    const pages = Math.ceil(total / limit);
    return {
      genres: list,
      pagination: { total, page, limit, pages },
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid genre id');
    }
    const genre = await this.genreModel.findById(id).lean().exec();
    if (!genre) {
      throw new NotFoundException('Genre not found');
    }
    const g = genre as unknown as { _id: Types.ObjectId; name: string; slug: string; description?: string; createdAt?: Date; updatedAt?: Date };
    const titlesCount = await this.titleModel.countDocuments({
      genres: g.name,
    });
    return {
      _id: g._id.toString(),
      name: g.name,
      slug: g.slug,
      description: g.description ?? '',
      titlesCount,
      createdAt: g.createdAt ?? new Date(),
      updatedAt: g.updatedAt ?? new Date(),
    };
  }

  async create(body: { name: string; slug?: string; description?: string }) {
    const name = body.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    const slug = body.slug?.trim() || this.slugify(name);
    const existing = await this.genreModel.findOne({
      $or: [{ slug }, { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }],
    });
    if (existing) {
      throw new ConflictException('Genre with this name or slug already exists');
    }
    const genre = await this.genreModel.create({
      name,
      slug,
      description: body.description?.trim() ?? '',
    });
    return genre;
  }

  async update(
    id: string,
    body: { name?: string; slug?: string; description?: string },
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid genre id');
    }
    const genre = await this.genreModel.findById(id).exec();
    if (!genre) {
      throw new NotFoundException('Genre not found');
    }
    const oldName = genre.name;
    if (body.name !== undefined) genre.name = body.name.trim();
    if (body.slug !== undefined) genre.slug = body.slug.trim();
    if (body.description !== undefined) genre.description = body.description.trim();
    await genre.save();

    if (body.name !== undefined && oldName !== genre.name) {
      await this.titleModel.updateMany(
        { genres: oldName },
        { $pull: { genres: oldName }, $addToSet: { genres: genre.name } },
      );
    }
    return genre;
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid genre id');
    }
    const genre = await this.genreModel.findByIdAndDelete(id).exec();
    if (!genre) {
      throw new NotFoundException('Genre not found');
    }
    return { message: 'Genre deleted successfully' };
  }

  async merge(body: { sourceId: string; targetId: string }) {
    const { sourceId, targetId } = body;
    if (!sourceId || !targetId) {
      throw new BadRequestException('sourceId and targetId are required');
    }
    if (sourceId === targetId) {
      throw new BadRequestException('sourceId and targetId must be different');
    }
    if (!Types.ObjectId.isValid(sourceId) || !Types.ObjectId.isValid(targetId)) {
      throw new BadRequestException('Invalid genre id');
    }
    const [source, target] = await Promise.all([
      this.genreModel.findById(sourceId).exec(),
      this.genreModel.findById(targetId).exec(),
    ]);
    if (!source) throw new NotFoundException('Source genre not found');
    if (!target) throw new NotFoundException('Target genre not found');

    await this.titleModel.updateMany(
      { genres: source.name },
      { $pull: { genres: source.name }, $addToSet: { genres: target.name } },
    );
    await this.genreModel.findByIdAndDelete(sourceId);
    return {
      message: `Merged genre "${source.name}" into "${target.name}"`,
      targetId,
    };
  }
}
