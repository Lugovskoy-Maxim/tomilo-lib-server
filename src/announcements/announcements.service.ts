import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Announcement,
  AnnouncementDocument,
} from '../schemas/announcement.schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { QueryAnnouncementDto } from './dto/query-announcement.dto';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectModel(Announcement.name)
    private announcementModel: Model<AnnouncementDocument>,
    private filesService: FilesService,
    private notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateAnnouncementDto): Promise<AnnouncementDocument> {
    const slug =
      dto.slug?.trim() || slugify(dto.title) || `announcement-${Date.now()}`;

    const existing = await this.announcementModel.findOne({ slug }).exec();
    if (existing) {
      throw new ConflictException(`Announcement with slug "${slug}" already exists`);
    }

    const payload: Partial<Announcement> = {
      ...dto,
      slug,
      publishedAt: dto.isPublished ? new Date() : null,
      contentBlocks: dto.contentBlocks ?? [],
      images: dto.images ?? [],
      tags: dto.tags ?? [],
      style: dto.style ?? {},
      metadata: dto.metadata ?? {},
    };

    const doc = new this.announcementModel(payload);
    const saved = await doc.save();
    if (dto.isPublished) {
      this.notificationsService
        .sendNewsAnnouncementPush(
          saved.title,
          saved.slug,
          (saved as any)._id?.toString?.() ?? String((saved as any).id),
        )
        .then(({ sent, failed }) => {
          if (sent > 0 || failed > 0) {
            this.logger.log(
              `News push for "${saved.slug}": sent=${sent}, failed=${failed}`,
            );
          }
        })
        .catch((err) => {
          this.logger.warn(`News push failed: ${err?.message ?? err}`);
        });
    }
    return saved;
  }

  async update(
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<AnnouncementDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid announcement ID');
    }

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim();
      const existing = await this.announcementModel
        .findOne({ slug, _id: { $ne: new Types.ObjectId(id) } })
        .exec();
      if (existing) {
        throw new ConflictException(`Announcement with slug "${slug}" already exists`);
      }
    }

    const current = await this.announcementModel.findById(id).exec();
    if (!current) {
      throw new NotFoundException('Announcement not found');
    }

    const justPublished = dto.isPublished === true && !current.isPublished;
    if (justPublished) {
      (dto as Record<string, unknown>).publishedAt = new Date();
    }

    const updated = await this.announcementModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('Announcement not found');
    }
    if (justPublished) {
      this.notificationsService
        .sendNewsAnnouncementPush(
          updated.title,
          updated.slug,
          (updated as any)._id?.toString?.() ?? String((updated as any).id),
        )
        .then(({ sent, failed }) => {
          if (sent > 0 || failed > 0) {
            this.logger.log(
              `News push for "${updated.slug}": sent=${sent}, failed=${failed}`,
            );
          }
        })
        .catch((err) => {
          this.logger.warn(`News push failed: ${err?.message ?? err}`);
        });
    }
    return updated;
  }

  async findById(
    id: string,
    options: { forPublic?: boolean } = {},
  ): Promise<AnnouncementDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid announcement ID');
    }
    const doc = await this.announcementModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Announcement not found');
    }
    if (options.forPublic && !doc.isPublished) {
      throw new NotFoundException('Announcement not found');
    }
    return doc;
  }

  async findBySlug(
    slug: string,
    options: { forPublic?: boolean } = {},
  ): Promise<AnnouncementDocument> {
    const doc = await this.announcementModel.findOne({ slug }).exec();
    if (!doc) {
      throw new NotFoundException('Announcement not found');
    }
    if (options.forPublic && !doc.isPublished) {
      throw new NotFoundException('Announcement not found');
    }
    return doc;
  }

  async findAll(
    query: QueryAnnouncementDto,
    options: { forPublic?: boolean } = {},
  ): Promise<{
    announcements: AnnouncementDocument[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const { page = 1, limit = 20, tag, isPinned, includeDraft } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (options.forPublic !== false) {
      filter.isPublished = true;
      if (includeDraft) {
        delete filter.isPublished;
      }
    } else if (!includeDraft) {
      filter.isPublished = true;
    }

    if (tag) {
      filter.tags = tag;
    }
    if (isPinned !== undefined) {
      filter.isPinned = isPinned;
    }

    const [announcements, total] = await Promise.all([
      this.announcementModel
        .find(filter)
        .sort({ isPinned: -1, publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.announcementModel.countDocuments(filter),
    ]);

    return {
      announcements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid announcement ID');
    }
    const doc = await this.announcementModel.findByIdAndDelete(id).exec();
    if (!doc) {
      throw new NotFoundException('Announcement not found');
    }
    await this.filesService.deleteAnnouncementImages(id);
  }

  /** Сохраняет загруженное изображение и возвращает URL для вставки в контент */
  async saveImage(
    file: Express.Multer.File,
    announcementId?: string,
  ): Promise<{ url: string }> {
    const url = await this.filesService.saveAnnouncementImage(
      file,
      announcementId,
    );
    return { url };
  }
}
