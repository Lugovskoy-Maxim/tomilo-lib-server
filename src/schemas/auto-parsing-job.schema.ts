import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type AutoParsingJobDocument = AutoParsingJob & Document;

export enum ParsingFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Schema({ timestamps: true })
export class AutoParsingJob {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Title', required: true })
  titleId: Types.ObjectId;

  /**
   * @deprecated Use sources instead. Kept for backward compatibility.
   */
  @Prop({ required: false })
  url?: string;

  /**
   * Array of source URLs to check sequentially for new chapters.
   * The service will try each source in order until new chapters are found.
   */
  @Prop({ type: [String], default: [] })
  sources: string[];

  /**
   * Index of the source that was last successfully used to find new chapters.
   * Used to prioritize the same source in future checks.
   */
  @Prop({ default: 0 })
  lastUsedSourceIndex: number;

  /**
   * URL of the source that was last successfully used.
   */
  @Prop({ required: false })
  lastUsedSourceUrl?: string;

  @Prop({
    type: String,
    enum: ParsingFrequency,
    default: ParsingFrequency.DAILY,
  })
  frequency: ParsingFrequency;

  /**
   * Hour of day (0-23) to run the job. If not set, job runs at default cron times
   * (daily: every 6h, weekly: once per week, monthly: 1st of month).
   * Allows spreading load across hours; does not affect existing jobs without this field.
   */
  @Prop({ type: Number, min: 0, max: 23, required: false })
  scheduleHour?: number;

  @Prop()
  lastChecked: Date;

  @Prop({ default: true })
  enabled: boolean;
}

export const AutoParsingJobSchema =
  SchemaFactory.createForClass(AutoParsingJob);

AutoParsingJobSchema.index({ titleId: 1 });
AutoParsingJobSchema.index({ enabled: 1 });
AutoParsingJobSchema.index({ frequency: 1, scheduleHour: 1, enabled: 1 });
