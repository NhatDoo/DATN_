import { ActivityType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { trackRecommendationConversion } from './recommendation-attribution.js';

describe('trackRecommendationConversion', () => {
  it('records an attributed enrollment only after a recent recommendation click', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'click-id' })
      .mockResolvedValueOnce(null);
    const create = vi.fn().mockResolvedValue({});
    const prisma = { activityEvent: { findFirst, create } } as unknown as PrismaService;

    await trackRecommendationConversion(
      prisma,
      'student-id',
      'course-id',
      ActivityType.RECOMMENDATION_ENROLLMENT,
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'student-id',
        courseId: 'course-id',
        type: ActivityType.RECOMMENDATION_ENROLLMENT,
      },
    });
  });

  it('does not count conversions that have no recommendation click', async () => {
    const create = vi.fn();
    const prisma = {
      activityEvent: { findFirst: vi.fn().mockResolvedValue(null), create },
    } as unknown as PrismaService;

    await trackRecommendationConversion(
      prisma,
      'student-id',
      'course-id',
      ActivityType.RECOMMENDATION_ENROLLMENT,
    );

    expect(create).not.toHaveBeenCalled();
  });
});
