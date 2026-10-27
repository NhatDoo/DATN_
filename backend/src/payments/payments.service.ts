import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

type VnpayQuery = Record<string, unknown>;
type PaymentCallback = {
  ok: boolean;
  responseCode: string;
  acknowledgmentCode: string;
  transactionRef?: string;
};

@Injectable()
export class PaymentsService {
  private readonly version = '2.1.0';
  private readonly refundUrl = 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createCheckout(courseId: string, userId: string, ipAddress: string) {
    const config = this.getConfig();
    const now = new Date();
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: 'PUBLISHED' },
      select: { id: true, title: true, price: true },
    });
    if (!course) throw new NotFoundException('Published course not found');
    const existingEnrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true },
    });
    if (existingEnrollment) throw new ConflictException('You already own this course');

    const amountVnd = Math.round(course.price.toNumber());
    if (amountVnd <= 0) throw new ConflictException('Free courses do not require payment');
    const transactionRef = randomUUID().replace(/-/g, '');
    const payment = await this.prisma.payment.create({
      data: {
        transactionRef,
        amount: amountVnd,
        vnpCreateDate: formatVnpDate(now),
        userId,
        courseId,
      },
      select: { id: true },
    });
    const params: Record<string, string> = {
      vnp_Version: this.version,
      vnp_Command: 'pay',
      vnp_TmnCode: config.tmnCode,
      vnp_Amount: String(amountVnd * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: transactionRef,
      vnp_OrderInfo: `Thanh toan khoa hoc ${transactionRef}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: config.returnUrl,
      vnp_IpAddr: this.normalizeIp(ipAddress),
      vnp_CreateDate: formatVnpDate(now),
      vnp_ExpireDate: formatVnpDate(new Date(now.getTime() + 15 * 60 * 1000)),
    };
    const secureHash = this.signQuery(params, config.hashSecret);
    const paymentUrl = new URL(config.paymentUrl);
    for (const key of Object.keys(params).sort()) paymentUrl.searchParams.set(key, params[key]);
    paymentUrl.searchParams.set('vnp_SecureHash', secureHash);

    return { paymentId: payment.id, transactionRef, paymentUrl: paymentUrl.toString() };
  }

  async handlePaymentCallback(rawQuery: VnpayQuery): Promise<PaymentCallback> {
    const config = this.getConfig();
    const params = normalizeQuery(rawQuery);
    if (!params || !verifyQuerySignature(params, config.hashSecret)) {
      return { ok: false, responseCode: '97', acknowledgmentCode: '97' };
    }
    if (params.vnp_TmnCode !== config.tmnCode) {
      return { ok: false, responseCode: '97', acknowledgmentCode: '97' };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { transactionRef: params.vnp_TxnRef },
      select: {
        id: true,
        amount: true,
        status: true,
        transactionRef: true,
        vnpCreateDate: true,
      },
    });
    if (!payment) {
      return {
        ok: false,
        responseCode: '01',
        acknowledgmentCode: '01',
        transactionRef: params.vnp_TxnRef,
      };
    }
    if (Number(params.vnp_Amount) !== Math.round(payment.amount.toNumber()) * 100) {
      return {
        ok: false,
        responseCode: '04',
        acknowledgmentCode: '04',
        transactionRef: payment.transactionRef,
      };
    }

    if (payment.status === PaymentStatus.PAID) {
      return {
        ok: true,
        responseCode: '00',
        acknowledgmentCode: '00',
        transactionRef: payment.transactionRef,
      };
    }
    const paid = params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';
    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: {
        status: paid ? PaymentStatus.PAID : PaymentStatus.FAILED,
        responseCode: params.vnp_ResponseCode,
        bankCode: params.vnp_BankCode,
        transactionNo: params.vnp_TransactionNo,
        vnpCreateDate: params.vnp_CreateDate,
        payDate: params.vnp_PayDate,
        ...(paid ? { paidAt: new Date() } : {}),
      },
    });
    return {
      ok: paid,
      responseCode: paid ? '00' : params.vnp_ResponseCode || '99',
      acknowledgmentCode: '00',
      transactionRef: payment.transactionRef,
    };
  }

  async paymentStatus(transactionRef: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { transactionRef, userId },
      select: {
        transactionRef: true,
        amount: true,
        status: true,
        responseCode: true,
        paidAt: true,
        refundedAt: true,
        course: { select: { id: true, title: true, slug: true } },
        enrollment: { select: { enrolledAt: true, refundExpiresAt: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async confirmEnrollment(transactionRef: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { transactionRef, userId },
      select: { id: true, courseId: true, status: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.PAID) {
      throw new ConflictException('Payment has not been confirmed by VNPAY');
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: payment.courseId } },
      });
      if (current) {
        if (current.paymentId === payment.id) return current;
        throw new ConflictException('You already own this course');
      }
      const enrolledAt = new Date();
      return tx.enrollment.create({
        data: {
          userId,
          courseId: payment.courseId,
          paymentId: payment.id,
          enrolledAt,
          refundExpiresAt: new Date(enrolledAt.getTime() + 60 * 60 * 1000),
        },
      });
    });
  }

  async refund(transactionRef: string, userId: string, serverIp: string) {
    const config = this.getConfig();
    const payment = await this.prisma.payment.findFirst({
      where: { transactionRef, userId },
      include: { enrollment: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.PAID || !payment.enrollment) {
      throw new ConflictException('Only a confirmed enrollment can be refunded');
    }
    if (!payment.enrollment.refundExpiresAt || Date.now() > payment.enrollment.refundExpiresAt.getTime()) {
      throw new ConflictException('The one-hour refund period has expired');
    }
    if (!payment.vnpCreateDate) throw new ConflictException('VNPAY transaction date is missing');

    const requestId = randomUUID().replace(/-/g, '');
    const createDate = formatVnpDate(new Date());
    const amount = String(Math.round(payment.amount.toNumber()) * 100);
    const transactionType = '02';
    const orderInfo = `Hoan tien khoa hoc ${payment.transactionRef}`;
    const payload: Record<string, string> = {
      vnp_RequestId: requestId,
      vnp_Version: this.version,
      vnp_Command: 'refund',
      vnp_TmnCode: config.tmnCode,
      vnp_TransactionType: transactionType,
      vnp_TxnRef: payment.transactionRef,
      vnp_Amount: amount,
      vnp_TransactionNo: payment.transactionNo ?? '',
      vnp_TransactionDate: payment.vnpCreateDate,
      vnp_CreateBy: userId,
      vnp_CreateDate: createDate,
      vnp_IpAddr: this.config.get<string>('VNPAY_SERVER_IP') ?? this.normalizeIp(serverIp),
      vnp_OrderInfo: orderInfo,
    };
    const signatureData = [
      payload.vnp_RequestId,
      payload.vnp_Version,
      payload.vnp_Command,
      payload.vnp_TmnCode,
      payload.vnp_TransactionType,
      payload.vnp_TxnRef,
      payload.vnp_Amount,
      payload.vnp_TransactionNo,
      payload.vnp_TransactionDate,
      payload.vnp_CreateBy,
      payload.vnp_CreateDate,
      payload.vnp_IpAddr,
      payload.vnp_OrderInfo,
    ].join('|');
    payload.vnp_SecureHash = hmacSha512(config.hashSecret, signatureData);

    const locked = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PAID },
      data: { status: PaymentStatus.REFUND_PENDING, refundRequestId: requestId },
    });
    if (!locked.count) throw new ConflictException('A refund is already being processed');

    let response: Record<string, unknown>;
    try {
      const result = await fetch(config.refundUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      response = (await result.json()) as Record<string, unknown>;
      if (!result.ok) throw new Error('VNPAY refund request failed');
    } catch {
      throw new BadGatewayException('Refund status is being reconciled with VNPAY');
    }

    const responseCode = scalarValue(response.vnp_ResponseCode) || '99';
    if (!this.verifyRefundResponse(response, config.hashSecret)) {
      throw new BadGatewayException('VNPAY refund response signature is invalid');
    }
    if (responseCode !== '00') {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.REFUND_PENDING },
        data: { status: PaymentStatus.PAID, refundResponseCode: responseCode },
      });
      throw new BadGatewayException(`VNPAY rejected the refund request (${responseCode})`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.learningProgress.deleteMany({
        where: {
          userId,
          lesson: { section: { courseId: payment.courseId } },
        },
      });
      await tx.enrollment.deleteMany({ where: { id: payment.enrollment!.id } });
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          refundResponseCode: responseCode,
          refundedAt: new Date(),
        },
      });
    });
    return { status: PaymentStatus.REFUNDED, transactionRef: payment.transactionRef };
  }

  private verifyRefundResponse(response: Record<string, unknown>, secret: string) {
    const fields = [
      'vnp_ResponseId',
      'vnp_Command',
      'vnp_ResponseCode',
      'vnp_Message',
      'vnp_TmnCode',
      'vnp_TxnRef',
      'vnp_Amount',
      'vnp_BankCode',
      'vnp_PayDate',
      'vnp_TransactionNo',
      'vnp_TransactionType',
      'vnp_TransactionStatus',
      'vnp_OrderInfo',
    ];
    const expected = hmacSha512(secret, fields.map((field) => scalarValue(response[field])).join('|'));
    return safeHashEquals(expected, scalarValue(response.vnp_SecureHash));
  }

  private getConfig() {
    const tmnCode = this.config.get<string>('VNPAY_TMN_CODE');
    const hashSecret = this.config.get<string>('VNPAY_HASH_SECRET');
    const paymentUrl = this.config.get<string>('VNPAY_URL');
    const returnUrl = this.config.get<string>('VNPAY_RETURN_URL');
    if (!tmnCode || !hashSecret || !paymentUrl || !returnUrl) {
      throw new ServiceUnavailableException('VNPAY configuration is incomplete');
    }
    return {
      tmnCode,
      hashSecret,
      paymentUrl,
      returnUrl,
      refundUrl: this.config.get<string>('VNPAY_REFUND_URL', this.refundUrl),
    };
  }

  private signQuery(params: Record<string, string>, secret: string) {
    const data = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return hmacSha512(secret, data);
  }

  private normalizeIp(ipAddress: string) {
    return ipAddress?.replace(/^::ffff:/, '').slice(0, 45) || '127.0.0.1';
  }
}

export function formatVnpDate(date: Date) {
  const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return [
    vietnamTime.getUTCFullYear(),
    String(vietnamTime.getUTCMonth() + 1).padStart(2, '0'),
    String(vietnamTime.getUTCDate()).padStart(2, '0'),
    String(vietnamTime.getUTCHours()).padStart(2, '0'),
    String(vietnamTime.getUTCMinutes()).padStart(2, '0'),
    String(vietnamTime.getUTCSeconds()).padStart(2, '0'),
  ].join('');
}

function hmacSha512(secret: string, data: string) {
  return createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}

function safeHashEquals(expected: string, supplied: string) {
  if (!/^[a-f\d]{128}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

function scalarValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function normalizeQuery(query: VnpayQuery): Record<string, string> | null {
  const entries = Object.entries(query);
  if (entries.some(([, value]) => typeof value !== 'string')) return null;
  return Object.fromEntries(
    entries
      .filter(([key]) => key !== 'vnp_SecureHashType')
      .map(([key, value]) => [key, String(value)]),
  );
}

function verifyQuerySignature(params: Record<string, string>, secret: string) {
  const supplied = params.vnp_SecureHash;
  if (!supplied) return false;
  const data = Object.keys(params)
    .filter((key) => key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return safeHashEquals(hmacSha512(secret, data), supplied);
}