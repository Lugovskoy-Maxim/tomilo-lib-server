import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as webpush from 'web-push';
import {
  PushSubscription as PushSubscriptionModel,
  PushSubscriptionDocument,
} from '../schemas/push-subscription.schema';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_MAILTO = process.env.VAPID_MAILTO || 'mailto:support@tomilo-lib.ru';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private vapidConfigured = false;

  constructor(
    @InjectModel(PushSubscriptionModel.name)
    private pushModel: Model<PushSubscriptionDocument>,
  ) {
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      this.vapidConfigured = true;
    } else {
      this.logger.warn(
        'Web Push: VAPID keys not set (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY). Push notifications disabled.',
      );
    }
  }

  isConfigured(): boolean {
    return this.vapidConfigured;
  }

  async saveSubscription(
    userId: string,
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      expirationTime?: number | null;
    },
    userAgent?: string,
  ): Promise<PushSubscriptionDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID');
    }
    const payload = {
      userId: new Types.ObjectId(userId),
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      expirationTime: subscription.expirationTime ?? null,
      userAgent: userAgent ?? undefined,
    };
    const doc = await this.pushModel.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { $set: payload },
      { new: true, upsert: true },
    );
    return doc;
  }

  async removeSubscription(
    userId: string,
    endpoint: string,
  ): Promise<{ deleted: boolean }> {
    const result = await this.pushModel.deleteOne({
      userId: new Types.ObjectId(userId),
      endpoint,
    });
    return { deleted: result.deletedCount > 0 };
  }

  /** Minimal subscription shape for sending (from DB lean) */
  private static toSendShape(doc: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    expirationTime?: number | null;
  }): { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null } {
    return {
      endpoint: doc.endpoint,
      keys: doc.keys,
      expirationTime: doc.expirationTime ?? undefined,
    };
  }

  async getSubscriptionsByUserIds(
    userIds: string[],
  ): Promise<Map<string, Array<{ endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null }>>> {
    const validIds = userIds.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) return new Map();
    const list = await this.pushModel
      .find({
        userId: { $in: validIds.map((id) => new Types.ObjectId(id)) },
      })
      .lean()
      .exec();
    const map = new Map<string, Array<{ endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null }>>();
    for (const doc of list) {
      const uid = (doc.userId as Types.ObjectId).toString();
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid)!.push(PushService.toSendShape(doc));
    }
    return map;
  }

  /**
   * Send a Web Push notification to multiple users (e.g. "new chapter").
   * subscriptionMap: userId -> list of subscription objects for that user.
   */
  async sendToSubscriptions(
    subscriptionMap: Map<string, Array<{ endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null }>>,
    payload: {
      title: string;
      body?: string;
      url?: string;
      tag?: string;
      data?: Record<string, unknown>;
    },
  ): Promise<{ sent: number; failed: number }> {
    if (!this.vapidConfigured) return { sent: 0, failed: 0 };

    const payloadStr = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      icon: '/favicons/favicon-192x192.png',
      badge: '/favicons/favicon-96x96.png',
      tag: payload.tag ?? 'default',
      data: {
        url: payload.url ?? '/',
        ...payload.data,
      },
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const [, subs] of subscriptionMap) {
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
              expirationTime: sub.expirationTime,
            },
            payloadStr,
            { TTL: 86400 },
          );
          sent++;
        } catch (err: any) {
          failed++;
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          }
          this.logger.debug(
            `Push send failed: ${err?.message ?? err} for endpoint ${sub.endpoint?.slice(0, 50)}`,
          );
        }
      }
    }

    if (expiredEndpoints.length > 0) {
      await this.pushModel
        .deleteMany({ endpoint: { $in: expiredEndpoints } })
        .exec();
      this.logger.log(
        `Removed ${expiredEndpoints.length} expired push subscription(s)`,
      );
    }

    return { sent, failed };
  }
}
