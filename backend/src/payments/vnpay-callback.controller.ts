import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('payments')
@Controller('api/payment/vnpay')
export class VnpayCallbackController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Get('return')
  @Public()
  @ApiOperation({ summary: 'VNPAY browser return theo VNPAY_RETURN_URL' })
  async vnpayReturn(@Query() query: Record<string, unknown>, @Res() response: Response) {
    const result = await this.paymentsService.handlePaymentCallback(query);
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      new URL(this.config.getOrThrow<string>('VNPAY_RETURN_URL')).origin,
    );
    const redirectUrl = new URL('/payment/result', frontendUrl);
    if (result.transactionRef) redirectUrl.searchParams.set('txnRef', result.transactionRef);
    redirectUrl.searchParams.set('status', result.ok ? 'success' : 'failed');
    return response.redirect(302, redirectUrl.toString());
  }

  @Get('ipn')
  @Public()
  @ApiOperation({ summary: 'VNPAY server IPN; chỉ acknowledge sau khi xác minh chữ ký' })
  async vnpayIpn(@Query() query: Record<string, unknown>, @Res() response: Response) {
    const result = await this.paymentsService.handlePaymentCallback(query);
    const messages: Record<string, string> = {
      '00': 'Confirm Success',
      '01': 'Order not found',
      '04': 'Invalid amount',
      '97': 'Invalid signature',
      '99': 'Unknown error',
    };
    return response.status(200).json({
      RspCode: result.acknowledgmentCode,
      Message: messages[result.acknowledgmentCode] ?? 'Payment not successful',
    });
  }
}