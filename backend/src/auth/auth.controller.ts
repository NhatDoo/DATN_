import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import { LoginDto, RegisterDto } from './auth.dto.js';

type AuthRequest = Request & { user: { id: string; email: string; role: string } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Tạo tài khoản học viên hoặc giảng viên' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập và nhận JWT bearer token' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin tài khoản hiện tại' })
  me(@Req() request: AuthRequest) {
    return request.user;
  }

  @Post('presence')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật lần hoạt động gần nhất của tài khoản' })
  presence(@Req() request: AuthRequest) {
    return this.authService.updatePresence(request.user.id);
  }
}