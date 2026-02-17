import { Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  async create(
    createReportDto: CreateReportDto,
    userId: string,
  ): Promise<ReportDocument> {
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

    return report.save();
  }

  async findAll(
    page = 1,
    limit = 20,
    reportType?: ReportType,
    isResolved?: boolean,
  ) {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (reportType) {
      query.reportType = reportType;
    }

    if (isResolved !== undefined) {
      query.isResolved = isResolved;
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
