import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const maxVideoSizeBytes = 10 * 1024 ** 3;

export class CreateVideoUploadDto {
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(maxVideoSizeBytes)
  sizeBytes!: number;

  @IsUUID()
  courseId!: string;
}

export class PresignVideoPartsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10_000, { each: true })
  partNumbers!: number[];
}

export class CompleteVideoUploadPartDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  partNumber!: number;

  @IsString()
  @MinLength(1)
  etag!: string;
}

export class CompleteVideoUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => CompleteVideoUploadPartDto)
  parts!: CompleteVideoUploadPartDto[];
}
