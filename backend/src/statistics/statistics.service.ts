import { Injectable } from '@nestjs/common';
import { ActivityType, PaymentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const onlineWindowMs = 5 * 60 * 1000;
const activityWindowMs = 30 * 24 * 60 * 60 * 1000;
const sortableMetrics = new Set(['activity', 'revenue', 'reviews', 'enrollments']);

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(
    user: { id: string; role: UserRole },
    sortBy = 'revenue',
    order = 'desc',
  ) {
    if (user.role === UserRole.ADMIN) return this.adminStatistics();
    if (user.role === UserRole.INSTRUCTOR) {
      return this.instructorStatistics(
        user.id,
        sortableMetrics.has(sortBy) ? sortBy : 'revenue',
        order === 'asc' ? 'asc' : 'desc',
      );
    }
    return this.studentStatistics(user.id);
  }

  private async adminStatistics() {
    const [users, courses, onlineUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.course.count({ where: { deletedAt: null } }),
      this.prisma.user.count({
        where: { lastSeenAt: { gte: new Date(Date.now() - onlineWindowMs) } },
      }),
    ]);
    return { role: UserRole.ADMIN, users, courses, onlineUsers, onlineWindowMinutes: 5 };
  }

  private async studentStatistics(userId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [enrolledCourses, completedLessons, weeklyProgress] = await Promise.all([
      this.prisma.enrollment.count({ where: { userId } }),
      this.prisma.learningProgress.count({ where: { userId, completedAt: { not: null } } }),
      this.prisma.activityEvent.findMany({
        where: { userId, type: ActivityType.LESSON_PROGRESS, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);
    const activeDays = new Set(weeklyProgress.map(({ createdAt }) => createdAt.toISOString().slice(0, 10)));
    return {
      role: UserRole.STUDENT,
      enrolledCourses,
      completedLessons,
      lessonProgressEventsThisWeek: weeklyProgress.length,
      activeDaysThisWeek: activeDays.size,
    };
  }

  private async instructorStatistics(
    instructorId: string,
    sortBy: string,
    order: 'asc' | 'desc',
  ) {
    const courses = await this.prisma.course.findMany({
      where: { instructorId, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        _count: { select: { enrollments: true, reviews: true } },
      },
    });
    const courseIds = courses.map(({ id }) => id);
    if (!courseIds.length) {
      return {
        role: UserRole.INSTRUCTOR,
        totalRevenue: 0,
        courses: [],
        recentReviews: [],
        activityWindowDays: 30,
      };
    }
    const activitySince = new Date(Date.now() - activityWindowMs);
    const [activityGroups, revenueGroups, reviews] = await Promise.all([
      this.prisma.activityEvent.groupBy({
        by: ['courseId'],
        where: {
          courseId: { in: courseIds },
          type: ActivityType.LESSON_PROGRESS,
          createdAt: { gte: activitySince },
        },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['courseId'],
        where: { courseId: { in: courseIds }, status: PaymentStatus.PAID },
        _sum: { amount: true },
      }),
      this.prisma.courseReview.findMany({
        where: { courseId: { in: courseIds } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          user: { select: { name: true } },
          course: { select: { id: true, title: true, slug: true } },
        },
      }),
    ]);
    const activityByCourse = new Map(
      activityGroups.map(({ courseId, _count }) => [courseId, _count._all]),
    );
    const revenueByCourse = new Map(
      revenueGroups.map(({ courseId, _sum }) => [courseId, _sum.amount?.toNumber() ?? 0]),
    );
    const courseStats = courses.map((course) => ({
      ...course,
      activity: activityByCourse.get(course.id) ?? 0,
      revenue: revenueByCourse.get(course.id) ?? 0,
      reviews: course._count.reviews,
      enrollments: course._count.enrollments,
    }));
    courseStats.sort((left, right) => {
      const metricValue = (course: (typeof courseStats)[number]) => {
        if (sortBy === 'activity') return course.activity;
        if (sortBy === 'reviews') return course.reviews;
        if (sortBy === 'enrollments') return course.enrollments;
        return course.revenue;
      };
      const difference = metricValue(left) - metricValue(right);
      return (order === 'asc' ? difference : -difference) || left.title.localeCompare(right.title);
    });
    return {
      role: UserRole.INSTRUCTOR,
      totalRevenue: courseStats.reduce((total, course) => total + course.revenue, 0),
      activityWindowDays: 30,
      courses: courseStats,
      recentReviews: reviews,
    };
  }
}
