import { ConflictException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from './payments.service.js';

const secret = 'unit-test-secret';
const settings: Record<string, string> = {
  VNPAY_TMN_CODE: 'TESTCODE',
  VNPAY_HASH_SECRET: secret,
  VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  VNPAY_RETURN_URL: 'https://merchant.example/api/payment/vnpay/return',
};

function signedCallback(overrides: Record<string, string> = {}) {
  const params: Record<string, string> = {
    vnp_TmnCode: 'TESTCODE',
    vnp_TxnRef: 'transaction-123',
    vnp_Amount: '12500000',
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
    vnp_BankCode: 'NCB',
    vnp_TransactionNo: '987654321',
    vnp_PayDate: '20261027090000',
    vnp_CreateDate: '20261027083000',
    ...overrides,
  };
  const data = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  params.vnp_SecureHash = createHmac('sha512', secret).update(data).digest('hex');
  return params;
}

function makeService(payment: Record<string, unknown>) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findUnique = vi.fn().mockResolvedValue(payment);
  const prisma = { payment: { findUnique, updateMany } } as unknown as PrismaService;
  const config = {
    get: (name: string, fallback?: string) => settings[name] ?? fallback,
  } as unknown as ConfigService;
  return { service: new PaymentsService(prisma, config), findUnique, updateMany };
}

describe('PaymentsService', () => {
  it('creates a VNPAY checkout URL with amount scaled by 100 and a valid signature', async () => {
    const courseFind = vi.fn().mockResolvedValue({
      id: 'course-id',
      title: 'Course',
      price: { toNumber: () => 125000 },
    });
    const enrollmentFind = vi.fn().mockResolvedValue(null);
    const paymentCreate = vi.fn().mockResolvedValue({ id: 'payment-id' });
    const prisma = {
      course: { findFirst: courseFind },
      enrollment: { findUnique: enrollmentFind },
      payment: { create: paymentCreate },
    } as unknown as PrismaService;
    const config = {
      get: (name: string, fallback?: string) => settings[name] ?? fallback,
    } as unknown as ConfigService;
    const service = new PaymentsService(prisma, config);

    const checkout = await service.createCheckout('course-id', 'user-id', '127.0.0.1');
    const url = new URL(checkout.paymentUrl);
    const params = Object.fromEntries(url.searchParams.entries());
    const suppliedSignature = params.vnp_SecureHash;
    delete params.vnp_SecureHash;
    const data = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
    const expectedSignature = createHmac('sha512', secret).update(data).digest('hex');

    expect(url.origin + url.pathname).toBe(settings.VNPAY_URL);
    expect(params.vnp_Amount).toBe('12500000');
    expect(params.vnp_ReturnUrl).toBe(settings.VNPAY_RETURN_URL);
    expect(suppliedSignature).toBe(expectedSignature);
    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ courseId: 'course-id', userId: 'user-id' }) }),
    );
  });

  it('marks a correctly signed, matching VNPAY payment as paid', async () => {
    const payment = {
      id: 'payment-id',
      amount: { toNumber: () => 125000 },
      status: PaymentStatus.PENDING,
      transactionRef: 'transaction-123',
    };
    const { service, updateMany } = makeService(payment);

    const result = await service.handlePaymentCallback(signedCallback());

    expect(result).toEqual({
      ok: true,
      responseCode: '00',
      acknowledgmentCode: '00',
      transactionRef: 'transaction-123',
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment-id', status: PaymentStatus.PENDING },
        data: expect.objectContaining({ status: PaymentStatus.PAID }),
      }),
    );
  });

  it('rejects a callback whose amount changed after signing', async () => {
    const { service, findUnique } = makeService({
      id: 'payment-id',
      amount: { toNumber: () => 125000 },
      status: PaymentStatus.PENDING,
      transactionRef: 'transaction-123',
    });
    const query = signedCallback();
    query.vnp_Amount = '1';

    const result = await service.handlePaymentCallback(query);

    expect(result.responseCode).toBe('97');
    expect(result.acknowledgmentCode).toBe('97');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('refuses refunds after the enrollment refund deadline', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'payment-id',
      amount: { toNumber: () => 125000 },
      status: PaymentStatus.PAID,
      transactionRef: 'transaction-123',
      enrollment: { id: 'enrollment-id', refundExpiresAt: new Date(Date.now() - 1_000) },
    });
    const prisma = { payment: { findFirst } } as unknown as PrismaService;
    const config = {
      get: (name: string, fallback?: string) => settings[name] ?? fallback,
    } as unknown as ConfigService;
    const service = new PaymentsService(prisma, config);

    await expect(service.refund('transaction-123', 'user-id', '127.0.0.1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it('creates enrollment with a refund deadline exactly one hour later', async () => {
    const paidPayment = {
      id: 'payment-id',
      courseId: 'course-id',
      status: PaymentStatus.PAID,
    };
    const paymentFind = vi.fn().mockResolvedValue(paidPayment);
    const enrollmentFind = vi.fn().mockResolvedValue(null);
    const enrollmentCreate = vi.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const prisma = {
      payment: { findFirst: paymentFind },
      $transaction: vi.fn((callback) =>
        callback({
          enrollment: { findUnique: enrollmentFind, create: enrollmentCreate },
        }),
      ),
    } as unknown as PrismaService;
    const config = {
      get: (name: string, fallback?: string) => settings[name] ?? fallback,
    } as unknown as ConfigService;
    const service = new PaymentsService(prisma, config);

    const enrollment = await service.confirmEnrollment('transaction-123', 'user-id');
    const elapsed = enrollment.refundExpiresAt.getTime() - enrollment.enrolledAt.getTime();

    expect(enrollment.paymentId).toBe('payment-id');
    expect(enrollment.courseId).toBe('course-id');
    expect(elapsed).toBe(60 * 60 * 1000);
    expect(enrollmentCreate).toHaveBeenCalledOnce();
  });
});