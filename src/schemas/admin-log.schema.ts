import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdminLogDocument = AdminLog & Document;

@Schema({ timestamps: true })
export class AdminLog {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  adminId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ type: Object })
  details: Record<string, any>;

  @Prop()
  targetType: string;

  @Prop({ type: Types.ObjectId })
  targetId: Types.ObjectId;

  @Prop()
  ip: string;

  @Prop()
  userAgent: string;
}

export const AdminLogSchema = SchemaFactory.createForClass(AdminLog);

AdminLogSchema.index({ adminId: 1 });
AdminLogSchema.index({ action: 1 });
AdminLogSchema.index({ createdAt: -1 });
AdminLogSchema.index({ targetType: 1, targetId: 1 });
