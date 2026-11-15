import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

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

  @ApiProperty({ enum: [UserRole.STUDENT, UserRole.INSTRUCTOR] })
  @IsEnum([UserRole.STUDENT, UserRole.INSTRUCTOR])
  role!: UserRole;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiProperty({ enum: [UserRole.STUDENT, UserRole.INSTRUCTOR] })
  @IsEnum([UserRole.STUDENT, UserRole.INSTRUCTOR])
  role!: UserRole;
}
