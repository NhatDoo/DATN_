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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { EnrollDto, UpdateProgressDto } from './learning.dto.js';
import { LearningService } from './learning.service.js';

type AuthRequest = Request & { user: { id: string } };

@ApiTags('learning')
@ApiBearerAuth()
@Controller('learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Post('enrollments')
  @ApiOperation({ summary: 'Đăng ký học khóa học đã xuất bản' })
  enroll(@Body() dto: EnrollDto, @Req() request: AuthRequest) {
    return this.learningService.enroll(request.user.id, dto.courseId);
  }

  @Patch('lessons/:lessonId/progress')
  @ApiOperation({ summary: 'Lưu vị trí video và thời gian học' })
  updateProgress(
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateProgressDto,
    @Req() request: AuthRequest,
  ) {
    return this.learningService.updateProgress(request.user.id, lessonId, dto);
  }

  @Get('me/courses')
  @ApiOperation({ summary: 'Khóa học đã đăng ký và phần trăm hoàn thành' })
  myCourses(@Req() request: AuthRequest) {
    return this.learningService.myCourses(request.user.id);
  }

  @Get('me/activity')
  @ApiOperation({ summary: 'Lịch sử tìm kiếm, xem khóa học và học bài' })
  activity(
    @Req() request: AuthRequest,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.learningService.activity(request.user.id, limit);
  }
}