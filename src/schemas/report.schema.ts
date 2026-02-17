import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportDocument = Report & Document;

export enum ReportType {
  ERROR = 'error',
  TYPO = 'typo',
  COMPLAINT = 'complaint',
}

@Schema({ timestamps: true })
export class Report {
  _id: Types.ObjectId;

  @Prop({ required: true, enum: ReportType })
  reportType: ReportType;

  @Prop({ required: true, minlength: 10, maxlength: 5000 })
  content: string;

  @Prop({ type: Types.ObjectId, default: null })
  entityId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  entityType: string | null;

  @Prop({ type: String, default: null })
  url: string | null;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  creatorId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Title', default: null })
  titleId: Types.ObjectId | null;

  @Prop({ default: false })
  isResolved: boolean;

  @Prop({ type: String, default: null })
  resolvedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;

  @Prop({ type: String, default: null, maxlength: 2000 })
  resolutionMessage: string | null;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

ReportSchema.index({ reportType: 1 });
ReportSchema.index({ userId: 1 });
ReportSchema.index({ isResolved: 1 });
