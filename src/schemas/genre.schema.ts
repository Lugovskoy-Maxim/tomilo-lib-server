import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GenreDocument = Genre & Document;

@Schema({ timestamps: true })
export class Genre {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: '' })
  description: string;
}

export const GenreSchema = SchemaFactory.createForClass(Genre);
GenreSchema.index({ name: 1 });
// slug: index from @Prop({ unique: true })
