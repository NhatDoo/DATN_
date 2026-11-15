import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, CourseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { trackRecommendationConversion } from '../courses/recommendation-attribution.js';
import { UpdateProgressDto } from './learning.dto.js';

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async enroll(userId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: CourseStatus.PUBLISHED },
      select: { id: true, price: true },
    });
    if (!course) throw new NotFoundException('Published course not found');
    if (course.price.toNumber() > 0) {
      throw new ForbiddenException('Paid courses must be purchased through VNPAY');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const enrollment = await tx.enrollment.create({ data: { userId, courseId } });
        await trackRecommendationConversion(
          tx,
          userId,
          courseId,
          ActivityType.RECOMMENDATION_ENROLLMENT,
        );
        return enrollment;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Already enrolled in this course');
      }
      throw error;
    }
  }

  async updateProgress(userId: string, lessonId: string, dto: UpdateProgressDto) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { durationSec: true, section: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: lesson.section.courseId } },
      select: { id: true },
    });
    if (!enrollment) throw new ConflictException('Enroll in the course before tracking progress');

    const completed = lesson.durationSec > 0 && dto.positionSec >= lesson.durationSec * 0.9;
    const progress = await this.prisma.learningProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        lessonId,
        positionSec: dto.positionSec,
        watchedSeconds: dto.watchedSeconds ?? 0,
        completedAt: completed ? new Date() : null,
      },
      update: {
        positionSec: dto.positionSec,
        watchedSeconds: { increment: dto.watchedSeconds ?? 0 },
        ...(completed ? { completedAt: new Date() } : {}),
      },
    });
    await this.prisma.activityEvent.create({
      data: { userId, courseId: lesson.section.courseId, type: ActivityType.LESSON_PROGRESS },
    });
    if (completed) {
      await trackRecommendationConversion(
        this.prisma,
        userId,
        lesson.section.courseId,
        ActivityType.RECOMMENDATION_COMPLETION,
      );
    }
    return progress;
  }

  async myCourses(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            instructor: { select: { id: true, name: true } },
            sections: {
              orderBy: { position: 'asc' },
              include: {
                lessons: {
                  orderBy: { position: 'asc' },
                  include: { progress: { where: { userId }, select: { completedAt: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    const result = enrollments.map(({ course, ...enrollment }) => {
      const sections = course.sections.map((section) => ({
        ...section,
        lessons: section.lessons.map(({ videoUrl, ...lesson }) => ({
          ...lesson,
          hasVideo: Boolean(videoUrl),
        })),
      }));
      const lessons = sections.flatMap((section) => section.lessons);
      const completedLessons = lessons.filter((lesson) => lesson.progress[0]?.completedAt).length;
      return {
        ...enrollment,
        course: { ...course, sections },
        progress: {
          completedLessons,
          totalLessons: lessons.length,
          percent: lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0,
        },
      };
    });
    const thumbnails = await this.mediaService.resolvePublicImageUrls(
      result.map(({ course }) => course.thumbnail),
    );
    return result.map((enrollment) => ({
      ...enrollment,
      course: {
        ...enrollment.course,
        thumbnail: enrollment.course.thumbnail
          ? thumbnails.get(enrollment.course.thumbnail) ?? enrollment.course.thumbnail
          : null,
      },
    }));
  }

  activity(userId: string, limit: number) {
    return this.prisma.activityEvent.findMany({
      where: { userId },
      include: { course: { select: { id: true, title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }
}