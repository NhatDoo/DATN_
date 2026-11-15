import { UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { StatisticsService } from './statistics.service.js';

describe('StatisticsService', () => {
  it('counts admin users, active courses, and recently active accounts', async () => {
    const userCount = vi.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(3);
    const courseCount = vi.fn().mockResolvedValue(5);
    const service = new StatisticsService({
      user: { count: userCount },
      course: { count: courseCount },
    } as unknown as PrismaService);

    await expect(service.forUser({ id: 'admin-id', role: UserRole.ADMIN })).resolves.toEqual({
      role: UserRole.ADMIN,
      users: 12,
      courses: 5,
      onlineUsers: 3,
      onlineWindowMinutes: 5,
    });
    expect(courseCount).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });

  it('sorts instructor course activity and sums only paid revenue', async () => {
    const courseFindMany = vi.fn().mockResolvedValue([
      { id: 'course-a', title: 'A', slug: 'a', status: 'PUBLISHED', _count: { enrollments: 2, reviews: 1 } },
      { id: 'course-b', title: 'B', slug: 'b', status: 'DRAFT', _count: { enrollments: 4, reviews: 3 } },
    ]);
    const activityGroupBy = vi.fn().mockResolvedValue([
      { courseId: 'course-a', _count: { _all: 2 } },
      { courseId: 'course-b', _count: { _all: 5 } },
    ]);
    const paymentGroupBy = vi.fn().mockResolvedValue([
      { courseId: 'course-a', _sum: { amount: { toNumber: () => 100 } } },
      { courseId: 'course-b', _sum: { amount: { toNumber: () => 25 } } },
    ]);
    const service = new StatisticsService({
      course: { findMany: courseFindMany },
      activityEvent: { groupBy: activityGroupBy },
      payment: { groupBy: paymentGroupBy },
      courseReview: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);

    const result = await service.forUser(
      { id: 'instructor-id', role: UserRole.INSTRUCTOR },
      'activity',
      'asc',
    );

    expect(result).toMatchObject({
      role: UserRole.INSTRUCTOR,
      totalRevenue: 125,
      courses: [{ id: 'course-a', activity: 2 }, { id: 'course-b', activity: 5 }],
    });
    expect(paymentGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { courseId: { in: ['course-a', 'course-b'] }, status: 'PAID' },
      }),
    );
  });
});
