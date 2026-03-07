import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PushSubscription,
  PushSubscriptionSchema,
} from '../schemas/push-subscription.schema';
import { PushService } from './push.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
    ]),
  ],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
