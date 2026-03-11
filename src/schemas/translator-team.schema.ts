import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TranslatorTeamDocument = TranslatorTeam & Document;

export const TRANSLATOR_ROLES = [
  'translator',
  'editor',
  'proofreader',
  'cleaner',
  'typesetter',
  'leader',
] as const;
export type TranslatorRole = (typeof TRANSLATOR_ROLES)[number];

@Schema({ _id: true })
export class TranslatorTeamMemberSchema {
  _id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  avatar?: string;

  @Prop({ required: true, enum: TRANSLATOR_ROLES })
  role: string;

  @Prop({
    type: {
      telegram: String,
      discord: String,
      vk: String,
      boosty: String,
      patreon: String,
    },
    default: {},
  })
  socialLinks?: Record<string, string>;
}

export const TranslatorTeamMemberSchemaFactory = SchemaFactory.createForClass(
  TranslatorTeamMemberSchema,
);

@Schema({ timestamps: true })
export class TranslatorTeam {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ unique: true, sparse: true })
  slug: string;

  @Prop()
  description: string;

  @Prop()
  avatar: string;

  @Prop()
  banner: string;

  @Prop({ type: [TranslatorTeamMemberSchemaFactory], default: [] })
  members: {
    _id: Types.ObjectId;
    userId?: Types.ObjectId;
    name: string;
    avatar?: string;
    role: string;
    socialLinks?: Record<string, string>;
  }[];

  @Prop({ type: [Types.ObjectId], ref: 'Title', default: [] })
  titleIds: Types.ObjectId[];

  @Prop({
    type: {
      telegram: String,
      discord: String,
      vk: String,
      boosty: String,
      patreon: String,
      website: String,
    },
    default: {},
  })
  socialLinks?: Record<string, string>;

  @Prop({
    type: {
      boosty: String,
      patreon: String,
      donationalerts: String,
      yoomoney: String,
    },
    default: {},
  })
  donationLinks?: Record<string, string>;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const TranslatorTeamSchema =
  SchemaFactory.createForClass(TranslatorTeam);

TranslatorTeamSchema.index({ slug: 1 });
TranslatorTeamSchema.index({ titleIds: 1 });
TranslatorTeamSchema.index({ name: 'text', description: 'text' });
