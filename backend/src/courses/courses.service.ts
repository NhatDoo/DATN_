import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, CourseStatus, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCourseDto, CreateLessonDto, CreateSectionDto } from './courses.dto.js';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: string | undefined, page: number, limit: number, userId?: string) {
    const search = query?.trim();
    if (search && userId) {
      await this.prisma.activityEvent.create({
        data: { userId, type: ActivityType.COURSE_SEARCH, searchQuery: search },
      });
    }
    const where = {
      status: CourseStatus.PUBLISHED,
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
        include: { instructor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.course.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(courseId: string, userId?: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: CourseStatus.PUBLISHED },
      include: {
        instructor: { select: { id: true, name: true } },
        sections: {
          orderBy: { position: 'asc' },
          include: { lessons: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const enrollment = userId
      ? await this.prisma.enrollment.findUnique({
          where: { userId_courseId: { userId, courseId } },
          include: { payment: { select: { transactionRef: true } } },
        })
      : null;
    if (userId) {
      await this.prisma.activityEvent.create({
        data: { userId, courseId, type: ActivityType.COURSE_VIEW },
      });
    }
    const hasAccess = Boolean(enrollment);
    return {
      ...course,
      sections: course.sections.map((section) => ({
        ...section,
        lessons: section.lessons.map(({ videoUrl, ...lesson }) => ({
          ...lesson,
          videoUrl: hasAccess ? videoUrl : null,
        })),
      })),
      hasAccess,
      refundExpiresAt: enrollment?.refundExpiresAt ?? null,
      transactionRef: enrollment?.payment?.transactionRef ?? null,
    };
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

  async createSection(courseId: string, dto: CreateSectionDto, user: { id: string; role: UserRole }) {
    await this.assertCourseOwner(courseId, user);
    const position = dto.position ?? (await this.prisma.courseSection.count({ where: { courseId } }));
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

  private async assertCourseOwner(courseId: string, user: { id: string; role: UserRole }) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== UserRole.ADMIN && course.instructorId !== user.id) {
      throw new ForbiddenException('You can only manage your own courses');
    }
  }
}