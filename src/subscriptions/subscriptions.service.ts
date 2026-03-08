import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TitleSubscription,
  TitleSubscriptionDocument,
} from '../schemas/title-subscription.schema';
import { Title } from '../schemas/title.schema';
import { LoggerService } from '../common/logger/logger.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new LoggerService();

  constructor(
    @InjectModel(TitleSubscription.name)
    private subscriptionModel: Model<TitleSubscriptionDocument>,
    @InjectModel(Title.name) private titleModel: Model<any>,
  ) {
    this.logger.setContext(SubscriptionsService.name);
  }

  private async ensureTitleExists(titleId: string): Promise<void> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }
    const exists = await this.titleModel.exists({ _id: new Types.ObjectId(titleId) }).exec();
    if (!exists) {
      throw new NotFoundException('Title not found');
    }
  }

  async getMyTitleSubscriptions(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    subscriptions: TitleSubscriptionDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    const uid = new Types.ObjectId(userId);
    const skip = (page - 1) * limit;
    const [subscriptions, total] = await Promise.all([
      this.subscriptionModel
        .find({ userId: uid })
        .populate('titleId', 'name slug coverImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.subscriptionModel.countDocuments({ userId: uid }).exec(),
    ]);

    const list = (subscriptions as any[]).map((s) => ({
      _id: s._id.toString(),
      userId: s.userId.toString(),
      titleId: s.titleId?._id?.toString?.() ?? s.titleId?.toString?.() ?? '',
      titleInfo: s.titleId && typeof s.titleId === 'object'
        ? {
            _id: (s.titleId as any)._id?.toString?.() ?? (s.titleId as any).toString?.(),
            name: (s.titleId as any).name,
            slug: (s.titleId as any).slug,
            coverImage: (s.titleId as any).coverImage,
          }
        : undefined,
      notifyOnNewChapter: s.notifyOnNewChapter ?? true,
      notifyOnAnnouncement: s.notifyOnAnnouncement ?? true,
      createdAt: (s as any).createdAt,
    }));

    return {
      subscriptions: list as any,
      total,
      page,
      limit,
    };
  }

  async checkTitleSubscription(
    userId: string,
    titleId: string,
  ): Promise<{ isSubscribed: boolean; subscription?: any }> {
    if (!Types.ObjectId.isValid(titleId)) {
      return { isSubscribed: false };
    }
    const sub = await this.subscriptionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        titleId: new Types.ObjectId(titleId),
      })
      .lean()
      .exec();

    if (!sub) return { isSubscribed: false };

    return {
      isSubscribed: true,
      subscription: {
        _id: (sub as any)._id.toString(),
        userId: (sub as any).userId.toString(),
        titleId: (sub as any).titleId.toString(),
        notifyOnNewChapter: (sub as any).notifyOnNewChapter ?? true,
        notifyOnAnnouncement: (sub as any).notifyOnAnnouncement ?? true,
        createdAt: (sub as any).createdAt,
      },
    };
  }

  async subscribeToTitle(
    userId: string,
    titleId: string,
    options: { notifyOnNewChapter?: boolean; notifyOnAnnouncement?: boolean } = {},
  ): Promise<any> {
    await this.ensureTitleExists(titleId);
    const uid = new Types.ObjectId(userId);
    const tid = new Types.ObjectId(titleId);

    const existing = await this.subscriptionModel
      .findOne({ userId: uid, titleId: tid })
      .exec();
    if (existing) {
      existing.notifyOnNewChapter = options.notifyOnNewChapter ?? true;
      existing.notifyOnAnnouncement = options.notifyOnAnnouncement ?? true;
      await existing.save();
      return this.toSubscriptionDto(existing);
    }

    const sub = await this.subscriptionModel.create({
      userId: uid,
      titleId: tid,
      notifyOnNewChapter: options.notifyOnNewChapter ?? true,
      notifyOnAnnouncement: options.notifyOnAnnouncement ?? true,
    });
    return this.toSubscriptionDto(sub);
  }

  async unsubscribeFromTitle(userId: string, titleId: string): Promise<void> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }
    const result = await this.subscriptionModel
      .deleteOne({
        userId: new Types.ObjectId(userId),
        titleId: new Types.ObjectId(titleId),
      })
      .exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Subscription not found');
    }
  }

  async updateTitleSubscription(
    userId: string,
    titleId: string,
    updates: { notifyOnNewChapter?: boolean; notifyOnAnnouncement?: boolean },
  ): Promise<any> {
    if (!Types.ObjectId.isValid(titleId)) {
      throw new BadRequestException('Invalid title ID');
    }
    const sub = await this.subscriptionModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId), titleId: new Types.ObjectId(titleId) },
        { $set: updates },
        { new: true },
      )
      .exec();
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }
    return this.toSubscriptionDto(sub);
  }

  async getTitleSubscribersCount(titleId: string): Promise<number> {
    if (!Types.ObjectId.isValid(titleId)) return 0;
    return this.subscriptionModel
      .countDocuments({ titleId: new Types.ObjectId(titleId) })
      .exec();
  }

  /**
   * Get user IDs subscribed to a title with notifyOnNewChapter = true (for new chapter notifications).
   */
  async getSubscriberIdsForNewChapter(titleId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(titleId)) return [];
    const subs = await this.subscriptionModel
      .find({
        titleId: new Types.ObjectId(titleId),
        notifyOnNewChapter: true,
      })
      .select('userId')
      .lean()
      .exec();
    return (subs as any[]).map((s) => s.userId.toString());
  }

  private toSubscriptionDto(doc: TitleSubscriptionDocument | any): any {
    const d = doc.toObject ? doc.toObject() : doc;
    return {
      _id: d._id.toString(),
      userId: d.userId?.toString?.() ?? d.userId,
      titleId: d.titleId?.toString?.() ?? d.titleId,
      notifyOnNewChapter: d.notifyOnNewChapter ?? true,
      notifyOnAnnouncement: d.notifyOnAnnouncement ?? true,
      createdAt: d.createdAt,
    };
  }
}
