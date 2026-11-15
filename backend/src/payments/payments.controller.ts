import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service.js';

type AuthRequest = Request & { user: { id: string } };

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('courses/:courseId/checkout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo URL thanh toán VNPAY cho khóa học' })
  createCheckout(@Param('courseId') courseId: string, @Req() request: AuthRequest) {
    return this.paymentsService.createCheckout(courseId, request.user.id, request.ip ?? '127.0.0.1');
  }

  @Get(':transactionRef')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trạng thái giao dịch của tài khoản hiện tại' })
  status(@Param('transactionRef') transactionRef: string, @Req() request: AuthRequest) {
    return this.paymentsService.paymentStatus(transactionRef, request.user.id);
  }

  @Post(':transactionRef/confirm-enrollment')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xác nhận đăng ký sau khi VNPAY báo giao dịch thành công' })
  confirmEnrollment(@Param('transactionRef') transactionRef: string, @Req() request: AuthRequest) {
    return this.paymentsService.confirmEnrollment(
      transactionRef,
      request.user.id,
      request.ip ?? '127.0.0.1',
    );
  }

  @Post(':transactionRef/refund')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yêu cầu hoàn tiền trong vòng hai giờ từ lúc đăng ký' })
  refund(@Param('transactionRef') transactionRef: string, @Req() request: AuthRequest) {
    return this.paymentsService.refund(
      transactionRef,
      request.user.id,
      request.ip ?? '127.0.0.1',
    );
  }
}