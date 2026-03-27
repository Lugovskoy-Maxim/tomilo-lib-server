import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument, ReportType } from '../schemas/report.schema';
import { CreateReportDto } from './dto/create-report.dto';
import { User, UserDocument } from '../schemas/user.schema';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from '../schemas/notification.schema';
import {
  Comment,
  CommentDocument,
  CommentEntityType,
} from '../schemas/comment.schema';
import { Chapter, ChapterDocument } from '../schemas/chapter.schema';
import { UsersService } from '../users/users.service';
import { AutoParsingService } from '../auto-parsing/auto-parsing.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Chapter.name) private chapterModel: Model<ChapterDocument>,
    private usersService: UsersService,
    private autoParsingService: AutoParsingService,
  ) {}

  async create(
    createReportDto: CreateReportDto,
    userId: string,
  ): Promise<ReportDocument> {
    if (createReportDto.reportType === ReportType.COMMENT_REPORT) {
      return this.createCommentReport(createReportDto, userId);
    }

    const report = new this.reportModel({
      ...createReportDto,
      userId: new Types.ObjectId(userId),
      entityId: createReportDto.entityId
        ? new Types.ObjectId(createReportDto.entityId)
        : null,
      creatorId: createReportDto.creatorId
        ? new Types.ObjectId(createReportDto.creatorId)
        : null,
      titleId: createReportDto.titleId
        ? new Types.ObjectId(createReportDto.titleId)
        : null,
    });

    const saved = await report.save();
    void this.usersService.incrementReportsCount(userId);

    // При жалобе на отсутствие страниц в главе — запускаем синхронизацию из источников автопарсинга
    const reportType = createReportDto.reportType;
    const isMissingPages =
      reportType === ReportType.MISSING_PAGES ||
      (reportType === ReportType.ERROR &&
        typeof createReportDto.content === 'string' &&
        createReportDto.content.toLowerCase().includes('отсутствуют страницы'));
    if (
      isMissingPages &&
      createReportDto.entityType === 'chapter' &&
      createReportDto.entityId &&
      createReportDto.titleId
    ) {
      void this.autoParsingService
        .syncChapterPages(createReportDto.titleId, createReportDto.entityId)
        .then((r) => {
          if (r.synced) {
            this.logger.log(
              `Synced chapter ${createReportDto.entityId} after missing-pages report`,
            );
          } else if (r.error) {
            this.logger.debug(
              `Could not sync chapter after report: ${r.error}`,
            );
          }
        })
        .catch((err) =>
          this.logger.warn(
            `syncChapterPages after report failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    return saved;
  }

  private async createCommentReport(
    createReportDto: CreateReportDto,
    userId: string,
  ): Promise<ReportDocument> {
    if (createReportDto.entityType !== 'comment') {
      throw new BadRequestException(
        'Для жалобы на комментарий укажите entityType "comment"',
      );
    }
    if (!createReportDto.entityId || !Types.ObjectId.isValid(createReportDto.entityId)) {
      throw new BadRequestException('Некорректный идентификатор комментария');
    }
    const trimmed = createReportDto.content.trim();
    if (trimmed.length < 10) {
      throw new BadRequestException(
        'Опишите причину жалобы не короче 10 символов',
      );
    }

    const comment = await this.commentModel.findById(createReportDto.entityId);
    if (!comment || !comment.isVisible) {
      throw new NotFoundException('Комментарий не найден');
    }

    const commentOid = new Types.ObjectId(createReportDto.entityId);
    const dup = await this.reportModel.findOne({
      userId: new Types.ObjectId(userId),
      reportType: ReportType.COMMENT_REPORT,
      entityId: commentOid,
      isResolved: false,
    });
    if (dup) {
      throw new BadRequestException(
        'У вас уже есть открытая жалоба на этот комментарий',
      );
    }

    let titleId: Types.ObjectId | null = createReportDto.titleId
      ? new Types.ObjectId(createReportDto.titleId)
      : null;
    if (comment.entityType === CommentEntityType.TITLE) {
      titleId = comment.entityId as Types.ObjectId;
    } else if (comment.entityType === CommentEntityType.CHAPTER) {
      const chapter = await this.chapterModel
        .findById(comment.entityId)
        .select('titleId')
        .lean();
      const ref = chapter?.titleId;
      if (ref) {
        titleId = new Types.ObjectId(String(ref));
      }
    }

    const report = new this.reportModel({
      ...createReportDto,
      content: trimmed,
      reportType: ReportType.COMMENT_REPORT,
      entityType: 'comment',
      entityId: commentOid,
      userId: new Types.ObjectId(userId),
      creatorId: createReportDto.creatorId
        ? new Types.ObjectId(createReportDto.creatorId)
        : null,
      titleId,
      url: createReportDto.url ?? null,
    });

    const saved = await report.save();
    void this.usersService.incrementReportsCount(userId);
    return saved;
  }

  async findAll(
    page = 1,
    limit = 20,
    reportType?: ReportType,
    isResolved?: boolean,
    entityType?: string,
  ) {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (reportType) {
      query.reportType = reportType;
    }

    if (isResolved !== undefined) {
      query.isResolved = isResolved;
    }

    if (entityType) {
      query.entityType = entityType;
    }

    const [reports, total] = await Promise.all([
      this.reportModel
        .find(query)
        .populate('userId', 'username email')
        .populate('resolvedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.reportModel.countDocuments(query),
    ]);

    return {
      reports,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  async findOne(id: string): Promise<ReportDocument> {
    const report = await this.reportModel
      .findById(id)
      .populate('userId', 'username email')
      .populate('resolvedBy', 'username')
      .exec();

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return report;
  }

  async updateStatus(
    id: string,
    isResolved: boolean,
    resolvedById: string,
    resolutionMessage?: string,
  ): Promise<ReportDocument> {
    const report = await this.reportModel.findById(id);

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const wasPreviouslyResolved = report.isResolved;
    const normalizedResolutionMessage = resolutionMessage?.trim();
    report.isResolved = isResolved;
    if (isResolved) {
      report.resolvedBy = new Types.ObjectId(resolvedById);
      report.resolvedAt = new Date();
      report.resolutionMessage = normalizedResolutionMessage || null;
    } else {
      report.resolvedBy = null;
      report.resolvedAt = null;
      report.resolutionMessage = null;
    }

    const savedReport = await report.save();

    // Send notification to creator if report was just resolved
    if (isResolved && !wasPreviouslyResolved && report.creatorId) {
      await this.notificationModel.create({
        userId: report.creatorId,
        type: NotificationType.REPORT_RESOLVED,
        title: 'Ваша жалоба рассмотрена',
        message: normalizedResolutionMessage
          ? `Жалоба на ${
              report.entityType || 'контент'
            } была рассмотрена и закрыта. Ответ модератора: ${normalizedResolutionMessage}`
          : `Жалоба на ${
              report.entityType || 'контент'
            } была рассмотрена и закрыта.`,
        metadata: {
          reportId: report._id,
          reportType: report.reportType,
          entityType: report.entityType,
          entityId: report.entityId,
          resolutionMessage: normalizedResolutionMessage || null,
        },
      });
    }

    return savedReport;
  }

  async delete(id: string): Promise<void> {
    const result = await this.reportModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Report not found');
    }
  }
}
