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

  @Prop({ required: true })
  url: string;

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
