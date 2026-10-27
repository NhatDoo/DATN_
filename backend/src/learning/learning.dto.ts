import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class EnrollDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courseId!: string;
}

export class UpdateProgressDto {
  @ApiProperty({ minimum: 0, description: 'Vị trí phát hiện tại, tính bằng giây' })
  @IsInt()
  @Min(0)
  positionSec!: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Số giây học mới từ lần cập nhật trước' })
  @IsOptional()
  @IsInt()
  @Min(0)
  watchedSeconds?: number;
}