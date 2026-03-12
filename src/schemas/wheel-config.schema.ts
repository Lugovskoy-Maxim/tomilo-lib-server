import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type WheelConfigDocument = WheelConfig & Document;

const wheelSegmentSchema = new MongooseSchema(
  {
    rewardType: {
      type: String,
      enum: ['xp', 'coins', 'item', 'element_bonus', 'empty'],
      required: true,
    },
    weight: { type: Number, required: true },
    param: MongooseSchema.Types.Mixed, // xp: number; coins: number; item: { itemId, count }; element_bonus: object
    label: { type: String, default: '' },
  },
  { _id: false },
);

@Schema({ timestamps: true, _id: true })
export class WheelConfig {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true, default: 'default' })
  id: string;

  @Prop({ required: true })
  spinCostCoins: number;

  @Prop({ type: [wheelSegmentSchema], default: [] })
  segments: {
    rewardType: 'xp' | 'coins' | 'item' | 'element_bonus' | 'empty';
    weight: number;
    param?:
      | number
      | { itemId: string; count: number }
      | Record<string, unknown>;
    label: string;
  }[];
}

export const WheelConfigSchema = SchemaFactory.createForClass(WheelConfig);
