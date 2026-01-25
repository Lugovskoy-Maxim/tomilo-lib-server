import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IPActivityDocument = IPActivity & Document;

export interface IPActivityLog {
  endpoint: string;
  method: string;
  timestamp: Date;
  userAgent?: string;
  details?: Record<string, any>;
}

@Schema({ timestamps: true, collection: 'ip_activities' })
export class IPActivity {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  ip: string;

  @Prop({ default: null, type: Date })
  blockedAt: Date | null;

  @Prop({ default: null, type: Date })
  blockedUntil: Date | null;

  @Prop({ default: null, type: String })
  blockedReason: string | null;

  // Статистика запросов
  @Prop({ default: 0 })
  totalRequests: number;

  @Prop({ default: 0 })
  requestsToday: number;

  @Prop({ default: null, type: Date })
  lastRequestAt: Date | null;

  // Rate limiting
  @Prop({ default: 0 })
  requestsLastMinute: number;

  @Prop({ default: null, type: Date })
  lastRateLimitReset: Date | null;

  // Bot/подозрительная активность
  @Prop({ default: 0 })
  botScore: number;

  @Prop({ default: false })
  isSuspicious: boolean;

  @Prop({ default: false })
  isBlocked: boolean;

  // Геолокация (опционально)
  @Prop({ type: String })
  country: string;

  @Prop({ type: String })
  city: string;

  @Prop({ type: String })
  userAgent: string;

  // Лог активности
  @Prop({
    type: [
      {
        endpoint: { type: String, required: true },
        method: { type: String, default: 'GET' },
        timestamp: { type: Date, default: Date.now },
        userAgent: String,
        details: { type: Map, of: String, default: {} },
      },
    ],
    default: [],
  })
  activityLog: IPActivityLog[];

  // Лог подозрительной активности
  @Prop({
    type: [
      {
        score: { type: Number, required: true },
        reasons: [{ type: String, required: true }],
        endpoint: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  suspiciousActivityLog: {
    score: number;
    reasons: string[];
    endpoint?: string;
    timestamp: Date;
  }[];

  // Разрешенные endpoints (для исключений)
  @Prop({ type: [String], default: [] })
  whitelistedEndpoints: string[];

  @Prop({ type: Date })
  firstSeenAt: Date;
}

export const IPActivitySchema = SchemaFactory.createForClass(IPActivity);

// Индексы для оптимизации запросов
IPActivitySchema.index({ ip: 1 });
IPActivitySchema.index({ isBlocked: 1 });
IPActivitySchema.index({ botScore: -1 });
IPActivitySchema.index({ lastRequestAt: -1 });
IPActivitySchema.index({ requestsLastMinute: 1 });
IPActivitySchema.index({ createdAt: 1 });
