import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, CourseStatus, PaymentStatus, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import {
  CreateCourseDto,
  CreateCourseQuizDto,
  CreateCourseReviewDto,
  CreateLessonDto,
  CreateSectionDto,
  UpdateCourseDto,
} from './courses.dto.js';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async list(query: string | undefined, page: number, limit: number, userId?: string) {
    const search = query?.trim();
    if (search && userId) {
      await this.prisma.activityEvent.create({
        data: { userId, type: ActivityType.COURSE_SEARCH, searchQuery: search },
      });
    }
    const where = {
      status: CourseStatus.PUBLISHED,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        include: {
          instructor: { select: { id: true, name: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.course.count({ where }),
    ]);
    return {
      items: await this.withPublicThumbnails(await this.withRatings(items)),
      total,
      page,
      limit,
    };
  }

  async filterOptions() {
    const [categories, levels] = await Promise.all([
      this.prisma.course.findMany({
        where: { status: CourseStatus.PUBLISHED, deletedAt: null },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
      this.prisma.course.findMany({
        where: { status: CourseStatus.PUBLISHED, deletedAt: null },
        distinct: ['level'],
        select: { level: true },
        orderBy: { level: 'asc' },
      }),
    ]);
    return {
      categories: categories.map(({ category }) => category),
      levels: levels.map(({ level }) => level),
    };
  }

  recentReviews() {
    return this.prisma.courseReview.findMany({
      where: {
        course: { is: { status: CourseStatus.PUBLISHED, deletedAt: null } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        user: { select: { name: true } },
        course: { select: { id: true, title: true, slug: true } },
      },
    });
  }

  async recommendations(userId: string, limit: number) {
    const [enrollments, userActivity, popularityGroups] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId },
        select: {
          courseId: true,
          course: { select: { category: true, tags: true, instructorId: true } },
        },
      }),
      this.prisma.activityEvent.findMany({
        where: {
          userId,
          type: { in: [ActivityType.COURSE_SEARCH, ActivityType.COURSE_VIEW, ActivityType.LESSON_PROGRESS] },
        },
        select: { courseId: true, searchQuery: true, type: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.activityEvent.groupBy({
        by: ['courseId'],
        where: {
          courseId: { not: null },
          type: { in: [ActivityType.COURSE_VIEW, ActivityType.LESSON_PROGRESS] },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _count: { _all: true },
      }),
    ]);

    const excludedCourseIds = enrollments.map(({ courseId }) => courseId);
    const viewedCourseIds = [
      ...new Set(
        userActivity
          .map(({ courseId }) => courseId)
          .filter((courseId): courseId is string => Boolean(courseId)),
      ),
    ];
    const interestCourses = viewedCourseIds.length
      ? await this.prisma.course.findMany({
          where: { id: { in: viewedCourseIds }, deletedAt: null },
          select: { id: true, category: true, tags: true, instructorId: true },
        })
      : [];
    const categoryPreferences = new Map<string, number>();
    const tagPreferences = new Map<string, number>();
    const instructorPreferences = new Map<string, number>();
    const addPreference = (preferences: Map<string, number>, key: string, weight: number) => {
      preferences.set(key, (preferences.get(key) ?? 0) + weight);
    };
    for (const { course } of enrollments) {
      addPreference(categoryPreferences, course.category.toLocaleLowerCase('vi'), 4);
      for (const tag of course.tags) addPreference(tagPreferences, tag.toLocaleLowerCase('vi'), 4);
      addPreference(instructorPreferences, course.instructorId, 3);
    }
    const interestCourseById = new Map(interestCourses.map((course) => [course.id, course]));
    for (const activity of userActivity) {
      if (!activity.courseId) continue;
      const course = interestCourseById.get(activity.courseId);
      if (!course) continue;
      const weight = activity.type === ActivityType.LESSON_PROGRESS ? 2 : 1;
      addPreference(categoryPreferences, course.category.toLocaleLowerCase('vi'), weight);
      for (const tag of course.tags) addPreference(tagPreferences, tag.toLocaleLowerCase('vi'), weight);
      addPreference(instructorPreferences, course.instructorId, weight);
    }
    const searchTerms = [
      ...new Set(
        userActivity
          .flatMap(({ searchQuery }) =>
            searchQuery?.toLocaleLowerCase('vi').split(/[^\p{L}\p{N}]+/u) ?? [],
          )
          .filter((term) => term.length >= 3),
      ),
    ].slice(0, 5);
    const popularity = new Map<string, number>();
    for (const { courseId, _count } of popularityGroups) {
      if (courseId) popularity.set(courseId, _count._all);
    }
    const candidates = await this.prisma.course.findMany({
      where: {
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
        id: { notIn: excludedCourseIds },
      },
      include: {
        instructor: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const reviewGroups = candidates.length
      ? await this.prisma.courseReview.groupBy({
          by: ['courseId'],
          where: { courseId: { in: candidates.map(({ id }) => id) } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : [];
    const reviewsByCourse = new Map(reviewGroups.map((group) => [group.courseId, group]));
    const globalAverage =
      reviewGroups.length > 0
        ? reviewGroups.reduce((total, group) => total + (group._avg.rating ?? 0) * group._count._all, 0) /
          reviewGroups.reduce((total, group) => total + group._count._all, 0)
        : 3;
    const ranked = candidates
      .map((course) => {
        const title = course.title.toLocaleLowerCase('vi');
        const description = course.description.toLocaleLowerCase('vi');
        const searchScore = searchTerms.reduce(
          (score, term) => score + (title.includes(term) ? 4 : 0) + (description.includes(term) ? 2 : 0),
          0,
        );
        const categoryScore = categoryPreferences.get(course.category.toLocaleLowerCase('vi')) ?? 0;
        const tagScore = course.tags.reduce(
          (score, tag) => score + (tagPreferences.get(tag.toLocaleLowerCase('vi')) ?? 0),
          0,
        );
        const instructorScore = instructorPreferences.get(course.instructorId) ?? 0;
        const review = reviewsByCourse.get(course.id);
        const reviewCount = review?._count._all ?? 0;
        const averageRating = review?._avg.rating ?? globalAverage;
        const qualityScore =
          (averageRating * reviewCount + globalAverage * 5) / (reviewCount + 5);
        const score =
          searchScore +
          categoryScore * 2 +
          tagScore * 2.5 +
          instructorScore +
          Math.log1p(popularity.get(course.id) ?? 0) * 1.5 +
          Math.log1p(course._count.enrollments) +
          (qualityScore - 3) * Math.min(reviewCount, 20) * 0.3;
        return {
          course: {
            ...course,
            rating: Math.round(averageRating * 10) / 10,
            reviewCount,
          },
          score,
        };
      })
      .sort((left, right) => right.score - left.score || left.course.id.localeCompare(right.course.id));

    let items = ranked.slice(0, Math.min(Math.max(limit, 1), 50)).map(({ course }) => course);
    if (items.length) {
      await this.prisma.activityEvent.createMany({
        data: items.map(({ id }) => ({
          userId,
          courseId: id,
          type: ActivityType.RECOMMENDATION_IMPRESSION,
        })),
      });
      items = await this.withPublicThumbnails(items);
    }
    return { items };
  }

  async trackRecommendationClick(userId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: CourseStatus.PUBLISHED, deletedAt: null },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Published course not found');
    const impression = await this.prisma.activityEvent.findFirst({
      where: {
        userId,
        courseId,
        type: ActivityType.RECOMMENDATION_IMPRESSION,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (!impression) throw new BadRequestException('Course was not recently recommended to this user');
    await this.prisma.activityEvent.create({
      data: { userId, courseId, type: ActivityType.RECOMMENDATION_CLICK },
    });
    return { tracked: true };
  }

  async recommendationMetrics() {
    const groups = await this.prisma.activityEvent.groupBy({
      by: ['type'],
      where: {
        type: {
          in: [
            ActivityType.RECOMMENDATION_IMPRESSION,
            ActivityType.RECOMMENDATION_CLICK,
            ActivityType.RECOMMENDATION_ENROLLMENT,
            ActivityType.RECOMMENDATION_COMPLETION,
          ],
        },
      },
      _count: { _all: true },
    });
    const counts = new Map(groups.map(({ type, _count }) => [type, _count._all]));
    const impressions = counts.get(ActivityType.RECOMMENDATION_IMPRESSION) ?? 0;
    const clicks = counts.get(ActivityType.RECOMMENDATION_CLICK) ?? 0;
    const enrollments = counts.get(ActivityType.RECOMMENDATION_ENROLLMENT) ?? 0;
    const completions = counts.get(ActivityType.RECOMMENDATION_COMPLETION) ?? 0;
    return {
      impressions,
      clicks,
      enrollments,
      completions,
      clickThroughRate: impressions ? clicks / impressions : 0,
      enrollmentRate: impressions ? enrollments / impressions : 0,
      completionRate: enrollments ? completions / enrollments : 0,
    };
  }

  async listMine(user: { id: string; role: UserRole }) {
    const items = await this.prisma.course.findMany({
      where: user.role === UserRole.ADMIN ? undefined : { instructorId: user.id },
      include: {
        _count: { select: { sections: true } },
        sections: {
          select: { id: true, title: true, lessons: { select: { id: true, title: true } } },
        },
        quizzes: { select: { id: true, title: true, questions: { select: { id: true } } } },
        materials: { select: { id: true, originalName: true, sizeBytes: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const courses = items.map(({ sections, ...course }) => ({
      ...course,
      _count: {
        ...course._count,
        lessons: sections.reduce((total, section) => total + section.lessons.length, 0),
      },
    }));
    return this.withPublicThumbnails(courses);
  }

  async findOne(courseId: string, viewer?: { id: string; role: UserRole }) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(courseId);
    const course = await this.prisma.course.findFirst({
      where: {
        ...(isUuid ? { id: courseId } : { slug: courseId }),
        status: CourseStatus.PUBLISHED,
        OR: [
          { deletedAt: null },
          ...(viewer
            ? [{ deletedAt: { not: null }, enrollments: { some: { userId: viewer.id } } }]
            : []),
        ],
      },
      include: {
        instructor: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
        sections: {
          orderBy: { position: 'asc' },
          include: { lessons: { orderBy: { position: 'asc' } } },
        },
        quizzes: {
          orderBy: { createdAt: 'asc' },
          include: {
            questions: {
              orderBy: { position: 'asc' },
              select: { id: true, prompt: true, options: true, position: true },
            },
          },
        },
        reviews: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const enrollment = viewer
      ? await this.prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: viewer.id, courseId: course.id } },
          include: { payment: { select: { transactionRef: true, status: true } } },
        })
      : null;
    if (viewer) {
      await this.prisma.activityEvent.create({
        data: { userId: viewer.id, courseId: course.id, type: ActivityType.COURSE_VIEW },
      });
    }
    const hasAccess = Boolean(enrollment);
    const isCourseManager = Boolean(
      viewer &&
        (viewer.role === UserRole.ADMIN ||
          (viewer.role === UserRole.INSTRUCTOR && course.instructorId === viewer.id)),
    );
    const [ratingSummary, ownReview, materials] = await Promise.all([
      this.prisma.courseReview.aggregate({
        where: { courseId: course.id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      viewer
        ? this.prisma.courseReview.findUnique({
            where: { userId_courseId: { userId: viewer.id, courseId: course.id } },
            select: { id: true, rating: true, comment: true, createdAt: true },
          })
        : null,
      hasAccess || isCourseManager
        ? this.prisma.courseMaterial.findMany({
            where: { courseId: course.id },
            select: { id: true, originalName: true, sizeBytes: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          })
        : [],
    ]);
    const [courseWithThumbnail] = await this.withPublicThumbnails([course]);
    return {
      ...courseWithThumbnail,
      sections: course.sections.map((section) => ({
        ...section,
        lessons: section.lessons.map(({ videoUrl, ...lesson }) => ({
          ...lesson,
          hasVideo: Boolean(hasAccess && videoUrl),
        })),
      })),
      rating: Math.round((ratingSummary._avg.rating ?? 0) * 10) / 10,
      reviewCount: ratingSummary._count._all,
      enrollmentCount: course._count.enrollments,
      reviews: course.reviews,
      ownReview,
      materials,
      hasAccess,
      refundExpiresAt: enrollment?.refundExpiresAt ?? null,
      transactionRef: enrollment?.payment?.transactionRef ?? null,
      paymentStatus: enrollment?.payment?.status ?? null,
    };
  }

  async review(
    courseId: string,
    dto: CreateCourseReviewDto,
    user: { id: string; role: UserRole },
  ) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(courseId);
    const course = await this.prisma.course.findFirst({
      where: {
        ...(isUuid ? { id: courseId } : { slug: courseId }),
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
      },
      select: { id: true, instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId === user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Instructors cannot review their own courses');
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
      select: { id: true },
    });
    if (!enrollment) throw new ForbiddenException('Enroll in the course before reviewing it');
    return this.prisma.courseReview.upsert({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
      create: {
        userId: user.id,
        courseId: course.id,
        rating: dto.rating,
        comment: dto.comment.trim(),
      },
      update: { rating: dto.rating, comment: dto.comment.trim() },
      include: { user: { select: { name: true } } },
    });
  }

  create(dto: CreateCourseDto, instructorId: string) {
    const slug = dto.title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return this.prisma.course.create({
      data: {
        title: dto.title,
        slug: `${slug || 'course'}-${randomUUID().slice(0, 8)}`,
        description: dto.description,
        category: dto.category ?? 'Chưa phân loại',
        level: dto.level ?? 'Mọi cấp độ',
        tags: dto.tags ?? [],
        price: dto.price ?? 0,
        thumbnail: dto.thumbnail,
        instructorId,
      },
    });
  }

  async setStatus(courseId: string, status: CourseStatus, user: { id: string; role: UserRole }) {
    await this.assertCourseOwner(courseId, user);
    return this.prisma.course.update({ where: { id: courseId }, data: { status } });
  }

  async update(courseId: string, dto: UpdateCourseDto, user: { id: string; role: UserRole }) {
    await this.assertCourseOwner(courseId, user);
    return this.prisma.course.update({ where: { id: courseId }, data: dto });
  }

  async remove(courseId: string, user: { id: string; role: UserRole }, serverIp: string) {
    await this.assertCourseOwner(courseId, user);
    const deletion = await this.prisma.course.updateMany({
      where: { id: courseId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!deletion.count) throw new ConflictException('Course has already been deleted');

    const refunds = await this.paymentsService.refundCoursePurchases(courseId, serverIp);
    const outstandingPayments = await this.prisma.payment.findMany({
      where: {
        courseId,
        status: { in: [PaymentStatus.PAID, PaymentStatus.REFUND_PENDING] },
      },
      select: { userId: true },
    });
    const freeEnrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId,
        paymentId: null,
        userId: { notIn: outstandingPayments.map(({ userId }) => userId) },
      },
      select: { id: true, userId: true },
    });
    if (freeEnrollments.length) {
      const userIds = freeEnrollments.map(({ userId }) => userId);
      await this.prisma.$transaction(async (tx) => {
        await tx.learningProgress.deleteMany({
          where: { userId: { in: userIds }, lesson: { section: { courseId } } },
        });
        await tx.enrollment.deleteMany({
          where: { id: { in: freeEnrollments.map(({ id }) => id) } },
        });
      });
    }
    return { deleted: true, refunds, removedFreeEnrollments: freeEnrollments.length };
  }

  async createSection(courseId: string, dto: CreateSectionDto, user: { id: string; role: UserRole }) {
    await this.assertCourseOwner(courseId, user);
    const lastSection = await this.prisma.courseSection.findFirst({
      where: { courseId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = dto.position ?? (lastSection ? lastSection.position + 1 : 0);
    return this.prisma.courseSection.create({
      data: { title: dto.title, position, courseId },
    });
  }

  async createLesson(sectionId: string, dto: CreateLessonDto, user: { id: string; role: UserRole }) {
    const section = await this.prisma.courseSection.findUnique({
      where: { id: sectionId },
      select: { courseId: true, _count: { select: { lessons: true } } },
    });
    if (!section) throw new NotFoundException('Section not found');
    await this.assertCourseOwner(section.courseId, user);
    return this.prisma.courseLesson.create({
      data: {
        title: dto.title,
        description: dto.description,
        position: dto.position ?? section._count.lessons,
        durationSec: dto.durationSec,
        videoUrl: dto.videoUrl,
        sectionId,
      },
    });
  }

  async createQuiz(courseId: string, dto: CreateCourseQuizDto, user: { id: string; role: UserRole }) {
    await this.assertCourseOwner(courseId, user);
    if (dto.questions.some(({ correctOption, options }) => correctOption >= options.length)) {
      throw new BadRequestException('Đáp án đúng phải trỏ tới một lựa chọn trong câu hỏi.');
    }
    return this.prisma.courseQuiz.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        questions: {
          create: dto.questions.map(({ prompt, options, correctOption }, position) => ({
            prompt,
            options,
            correctOption,
            position,
          })),
        },
      },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
  }

  private async assertCourseOwner(courseId: string, user: { id: string; role: UserRole }) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true, deletedAt: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.deletedAt) throw new ConflictException('Deleted courses cannot be changed');
    if (user.role !== UserRole.ADMIN && course.instructorId !== user.id) {
      throw new ForbiddenException('You can only manage your own courses');
    }
  }

  private async withPublicThumbnails<T extends { thumbnail: string | null }>(courses: T[]): Promise<T[]> {
    const imageUrls = await this.mediaService.resolvePublicImageUrls(courses.map(({ thumbnail }) => thumbnail));
    return courses.map((course) => ({
      ...course,
      thumbnail: course.thumbnail ? imageUrls.get(course.thumbnail) ?? course.thumbnail : null,
    }));
  }

  private async withRatings<T extends { id: string }>(courses: T[]) {
    const groups = courses.length
      ? await this.prisma.courseReview.groupBy({
          by: ['courseId'],
          where: { courseId: { in: courses.map(({ id }) => id) } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : [];
    const ratings = new Map(groups.map((group) => [group.courseId, group]));
    return courses.map((course) => {
      const stats = ratings.get(course.id);
      return {
        ...course,
        rating: Math.round((stats?._avg.rating ?? 0) * 10) / 10,
        reviewCount: stats?._count._all ?? 0,
      };
    });
  }
}
