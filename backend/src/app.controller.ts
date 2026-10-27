import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/auth.decorators.js';

@ApiTags('health')
@Controller()
export class AppController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Kiểm tra API đang hoạt động' })
  getHealth() {
    return { status: 'ok', service: 'course-platform-api' };
  }
}
