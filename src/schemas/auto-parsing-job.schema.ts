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

  @Prop()
  lastChecked: Date;

  @Prop({ default: true })
  enabled: boolean;
}

export const AutoParsingJobSchema =
  SchemaFactory.createForClass(AutoParsingJob);

AutoParsingJobSchema.index({ titleId: 1 });
AutoParsingJobSchema.index({ enabled: 1 });
