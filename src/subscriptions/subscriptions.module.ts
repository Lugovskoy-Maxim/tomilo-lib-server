import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TitleSubscription,
  TitleSubscriptionSchema,
} from '../schemas/title-subscription.schema';
import { Title, TitleSchema } from '../schemas/title.schema';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TitleSubscription.name, schema: TitleSubscriptionSchema },
      { name: Title.name, schema: TitleSchema },
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
