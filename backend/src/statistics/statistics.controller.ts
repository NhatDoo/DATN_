import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { StatisticsService } from './statistics.service.js';

type StatisticsRequest = Request & { user: { id: string; role: UserRole } };

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thống kê theo vai trò của tài khoản hiện tại' })
  me(
    @Req() request: StatisticsRequest,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    return this.statisticsService.forUser(request.user, sortBy, order);
  }
}
