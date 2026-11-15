import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { VnpayCallbackController } from './vnpay-callback.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, VnpayCallbackController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}