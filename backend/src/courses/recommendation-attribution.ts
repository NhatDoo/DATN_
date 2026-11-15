import { ActivityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type ConversionType =
  | 'RECOMMENDATION_ENROLLMENT'
  | 'RECOMMENDATION_COMPLETION';

export async function trackRecommendationConversion(
  prisma: Pick<PrismaService, 'activityEvent'>,
  userId: string,
  courseId: string,
  type: ConversionType,
) {
  const attributedSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const click = await prisma.activityEvent.findFirst({
    where: {
      userId,
      courseId,
      type: ActivityType.RECOMMENDATION_CLICK,
      createdAt: { gte: attributedSince },
    },
    select: { id: true },
  });
  if (!click) return;

  const existing = await prisma.activityEvent.findFirst({
    where: { userId, courseId, type },
    select: { id: true },
  });
  if (!existing) {
    await prisma.activityEvent.create({ data: { userId, courseId, type } });
  }
}
