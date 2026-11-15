import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { CoursesService } from './courses.service.js';

function makePaymentsService() {
  return {
    refundCoursePurchases: vi.fn().mockResolvedValue([]),
  } as unknown as PaymentsService;
}

describe('CoursesService recommendations', () => {
  it('ranks related content using behavior, search, popularity, and quality while excluding enrollments', async () => {
    const candidates = [
      {
        id: 'popular-course',
        title: 'Photography basics',
        description: '',
        category: 'photo',
        tags: [],
        instructorId: 'other-instructor',
        instructor: { id: 'other-instructor', name: 'Popular Instructor' },
        _count: { enrollments: 1 },
      },
      {
        id: 'related-course',
        title: 'Introduction to design',
        description: '',
        category: 'design',
        tags: ['UI'],
        instructorId: 'recent-instructor',
        instructor: { id: 'recent-instructor', name: 'Recent Instructor' },
        _count: { enrollments: 0 },
      },
      {
        id: 'search-course',
        title: 'Python for beginners',
        description: 'Analyze real-world data',
        category: 'data',
        tags: [],
        instructorId: 'python-instructor',
        instructor: { id: 'python-instructor', name: 'Python Instructor' },
        _count: { enrollments: 0 },
      },
    ];
    const findManyActivity = vi.fn(() =>
      Promise.resolve(
        [{ courseId: 'viewed-course', searchQuery: 'python data', type: 'COURSE_SEARCH' }],
      ),
    );
    const findManyCourse = vi.fn(({ select }: { select?: { id?: boolean } }) =>
      Promise.resolve(
        select?.id
          ? [{ id: 'viewed-course', category: 'design', tags: ['UI'], instructorId: 'recent-instructor' }]
          : candidates,
      ),
    );
    const prisma = {
      enrollment: {
        findMany: vi.fn().mockResolvedValue([
          {
            courseId: 'owned-course',
            course: { category: 'design', tags: ['UI'], instructorId: 'recent-instructor' },
          },
        ]),
      },
      activityEvent: {
        findMany: findManyActivity,
        groupBy: vi.fn().mockResolvedValue([{ courseId: 'popular-course', _count: { _all: 2 } }]),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      course: { findMany: findManyCourse },
      courseReview: {
        groupBy: vi.fn().mockResolvedValue([
          { courseId: 'popular-course', _avg: { rating: 5 }, _count: { _all: 3 } },
        ]),
      },
    } as unknown as PrismaService;
    const mediaService = { resolvePublicImageUrls: vi.fn().mockResolvedValue(new Map()) } as unknown as MediaService;
    const service = new CoursesService(prisma, mediaService, makePaymentsService());

    const result = await service.recommendations('student-id', 2);

    expect(result.items.map(({ id }) => id)).toEqual(['related-course', 'search-course']);
    expect(findManyCourse).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: ['owned-course'] },
        }),
      }),
    );
  });

  it('requires enrollment before creating or updating a course review', async () => {
    const upsert = vi.fn();
    const prisma = {
      course: {
        findFirst: vi.fn().mockResolvedValue({ id: 'course-id', instructorId: 'instructor-id' }),
      },
      enrollment: { findUnique: vi.fn().mockResolvedValue(null) },
      courseReview: { upsert },
    } as unknown as PrismaService;
    const service = new CoursesService(
      prisma,
      { resolvePublicImageUrls: vi.fn().mockResolvedValue(new Map()) } as unknown as MediaService,
      makePaymentsService(),
    );

    await expect(
      service.review(
        'course-id',
        { rating: 5, comment: 'Rất hữu ích' },
        { id: 'student-id', role: UserRole.STUDENT },
      ),
    ).rejects.toThrow('Enroll in the course before reviewing it');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('only counts a recommendation click after that user saw the recommendation', async () => {
    const create = vi.fn();
    const prisma = {
      course: { findFirst: vi.fn().mockResolvedValue({ id: 'course-id' }) },
      activityEvent: { findFirst: vi.fn().mockResolvedValue(null), create },
    } as unknown as PrismaService;
    const service = new CoursesService(
      prisma,
      { resolvePublicImageUrls: vi.fn().mockResolvedValue(new Map()) } as unknown as MediaService,
      makePaymentsService(),
    );

    await expect(service.trackRecommendationClick('student-id', 'course-id')).rejects.toThrow(
      'Course was not recently recommended to this user',
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('CoursesService course management', () => {
  const mediaService = {
    resolvePublicImageUrls: vi.fn().mockResolvedValue(new Map()),
  } as unknown as MediaService;

  it('soft-deletes the course, refunds paid purchases, and removes free enrollments', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const progressDelete = vi.fn().mockResolvedValue({ count: 2 });
    const enrollmentDelete = vi.fn().mockResolvedValue({ count: 1 });
    const paymentFindMany = vi.fn().mockResolvedValue([{ userId: 'paid-student' }]);
    const enrollmentFindMany = vi.fn().mockResolvedValue([{ id: 'free-enrollment', userId: 'student-id' }]);
    const prisma = {
      course: {
        findUnique: vi.fn().mockResolvedValue({ instructorId: 'instructor-id', deletedAt: null }),
        updateMany,
      },
      enrollment: { findMany: enrollmentFindMany },
      payment: { findMany: paymentFindMany },
      $transaction: vi.fn((callback) =>
        callback({
          learningProgress: { deleteMany: progressDelete },
          enrollment: { deleteMany: enrollmentDelete },
        }),
      ),
    } as unknown as PrismaService;
    const refundCoursePurchases = vi.fn().mockResolvedValue([]);
    const paymentsService = { refundCoursePurchases } as unknown as PaymentsService;
    const service = new CoursesService(prisma, mediaService, paymentsService);

    await expect(
      service.remove('course-id', { id: 'instructor-id', role: UserRole.INSTRUCTOR }, '127.0.0.1'),
    ).resolves.toEqual({ deleted: true, refunds: [], removedFreeEnrollments: 1 });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'course-id', deletedAt: null },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    expect(refundCoursePurchases).toHaveBeenCalledWith('course-id', '127.0.0.1');
    expect(enrollmentFindMany).toHaveBeenCalledWith({
      where: {
        courseId: 'course-id',
        paymentId: null,
        userId: { notIn: ['paid-student'] },
      },
      select: { id: true, userId: true },
    });
    expect(progressDelete).toHaveBeenCalledOnce();
    expect(enrollmentDelete).toHaveBeenCalledWith({ where: { id: { in: ['free-enrollment'] } } });
  });

  it('rejects quiz answers that do not point to an available option', async () => {
    const courseQuiz = { create: vi.fn() };
    const prisma = {
      course: { findUnique: vi.fn().mockResolvedValue({ instructorId: 'instructor-id' }) },
      courseQuiz,
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, mediaService, makePaymentsService());

    await expect(
      service.createQuiz(
        'course-id',
        {
          title: 'Kiểm tra',
          questions: [{ prompt: 'Câu hỏi?', options: ['A', 'B'], correctOption: 2 }],
        },
        { id: 'instructor-id', role: UserRole.INSTRUCTOR },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(courseQuiz.create).not.toHaveBeenCalled();
  });

  it('creates a new section after the last existing position', async () => {
    const courseSection = {
      findFirst: vi.fn().mockResolvedValue({ position: 2 }),
      create: vi.fn().mockResolvedValue({ id: 'section-id' }),
    };
    const prisma = {
      course: { findUnique: vi.fn().mockResolvedValue({ instructorId: 'instructor-id' }) },
      courseSection,
    } as unknown as PrismaService;
    const service = new CoursesService(prisma, mediaService, makePaymentsService());

    await service.createSection(
      'course-id',
      { title: 'Nội dung khóa học' },
      { id: 'instructor-id', role: UserRole.INSTRUCTOR },
    );

    expect(courseSection.create).toHaveBeenCalledWith({
      data: { title: 'Nội dung khóa học', position: 3, courseId: 'course-id' },
    });
  });
});
