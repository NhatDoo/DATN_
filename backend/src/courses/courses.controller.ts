import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CourseStatus, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Public, Roles } from '../auth/auth.decorators.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  CreateCourseDto,
  CreateLessonDto,
  CreateSectionDto,
  UpdateCourseStatusDto,
} from './courses.dto.js';
import { CoursesService } from './courses.service.js';

type RequestWithUser = Request & { user?: { id: string; role: UserRole } };

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Tìm kiếm và phân trang khóa học đã xuất bản' })
  @ApiQuery({ name: 'q', required: false })
  list(
    @Query('q') query: string | undefined,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.list(query, page, Math.min(limit, 100), request.user?.id);
  }

  @Public()
  @Get(':courseId')
  @ApiOperation({ summary: 'Chi tiết khóa học và nội dung bài học' })
  findOne(@Param('courseId') courseId: string, @Req() request: RequestWithUser) {
    return this.coursesService.findOne(courseId, request.user?.id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo khóa học nháp' })
  create(@Body() dto: CreateCourseDto, @Req() request: RequestWithUser) {
    return this.coursesService.create(dto, request.user!.id);
  }

  @Patch(':courseId/status')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xuất bản hoặc lưu trữ khóa học' })
  setStatus(
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseStatusDto,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.setStatus(courseId, dto.status as CourseStatus, request.user!);
  }

  @Post(':courseId/sections')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm chương vào khóa học' })
  createSection(
    @Param('courseId') courseId: string,
    @Body() dto: CreateSectionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.createSection(courseId, dto, request.user!);
  }

  @Post('sections/:sectionId/lessons')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm bài học vào chương' })
  createLesson(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateLessonDto,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.createLesson(sectionId, dto, request.user!);
  }
}