import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
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
  CreateCourseQuizDto,
  CreateCourseReviewDto,
  CreateLessonDto,
  CreateSectionDto,
  UpdateCourseDto,
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
  @Get('filters')
  @ApiOperation({ summary: 'Danh mục và cấp độ đang có khóa học xuất bản' })
  filterOptions() {
    return this.coursesService.filterOptions();
  }

  @Public()
  @Get('reviews/recent')
  @ApiOperation({ summary: 'Đánh giá khóa học mới nhất' })
  recentReviews() {
    return this.coursesService.recentReviews();
  }

  @Get('recommendations/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gợi ý khóa học theo lịch sử tìm kiếm và học tập' })
  recommendations(
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.recommendations(request.user!.id, limit);
  }

  @Post(':courseId/recommendation-click')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ghi nhận lượt nhấp vào khóa học được gợi ý' })
  trackRecommendationClick(
    @Param('courseId') courseId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.trackRecommendationClick(request.user!.id, courseId);
  }

  @Get('recommendations/metrics')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Chỉ số lượt hiển thị và nhấp vào khóa học gợi ý' })
  recommendationMetrics() {
    return this.coursesService.recommendationMetrics();
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách khóa học của giảng viên, gồm cả bản nháp' })
  listMine(@Req() request: RequestWithUser) {
    return this.coursesService.listMine(request.user!);
  }

  @Public()
  @Get(':courseId')
  @ApiOperation({ summary: 'Chi tiết khóa học và nội dung bài học' })
  findOne(@Param('courseId') courseId: string, @Req() request: RequestWithUser) {
    return this.coursesService.findOne(courseId, request.user);
  }

  @Post(':courseId/reviews')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đánh giá khóa học đã đăng ký bằng số sao và bình luận' })
  review(
    @Param('courseId') courseId: string,
    @Body() dto: CreateCourseReviewDto,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.review(courseId, dto, request.user!);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo khóa học nháp' })
  create(@Body() dto: CreateCourseDto, @Req() request: RequestWithUser) {
    return this.coursesService.create(dto, request.user!.id);
  }

  @Patch(':courseId')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật thông tin khóa học' })
  update(
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseDto,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.update(courseId, dto, request.user!);
  }

  @Delete(':courseId')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Ẩn vĩnh viễn khóa học và tự động hoàn tiền các giao dịch đã thanh toán' })
  remove(@Param('courseId') courseId: string, @Req() request: RequestWithUser) {
    return this.coursesService.remove(courseId, request.user!, request.ip ?? '127.0.0.1');
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

  @Post(':courseId/quizzes')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm bài kiểm tra trắc nghiệm vào khóa học' })
  createQuiz(
    @Param('courseId') courseId: string,
    @Body() dto: CreateCourseQuizDto,
    @Req() request: RequestWithUser,
  ) {
    return this.coursesService.createQuiz(courseId, dto, request.user!);
  }
}
