import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ enum: [UserRole.STUDENT, UserRole.INSTRUCTOR] })
  @IsOptional()
  @IsEnum([UserRole.STUDENT, UserRole.INSTRUCTOR])
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Bắt buộc nếu đăng ký tài khoản giảng viên' })
  @IsOptional()
  @IsString()
  inviteCode?: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}