import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export type CollectionDocument = Collection & Document;

@Schema({ timestamps: true })
export class Collection {
  _id: Types.ObjectId;

  @Prop()
  cover: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Title' }] })
  titles: Types.ObjectId[];

  @Prop([String])
  comments: string[];

  @Prop({ default: 0 })
  views: number;
}

export const CollectionSchema = SchemaFactory.createForClass(Collection);

CollectionSchema.index({ name: 'text', description: 'text' });
CollectionSchema.index({ views: -1 });
