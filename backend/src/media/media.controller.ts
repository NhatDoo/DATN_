import {
  Controller,
  ParseFilePipe,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname } from 'node:path';
import { Roles } from '../auth/auth.decorators.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MediaService } from './media.service.js';

type AuthRequest = Request & { user: { id: string; role: UserRole } };

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', 100, {
      preservePath: true,
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_request, file, callback) =>
          callback(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 100 * 1024 * 1024, files: 100 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiQuery({ name: 'courseId', required: false, format: 'uuid' })
  @ApiOperation({ summary: 'Upload ảnh hoặc bộ HLS .m3u8 và segment vào S3 storage' })
  upload(
    @UploadedFiles(new ParseFilePipe({ fileIsRequired: true })) files: Express.Multer.File[],
    @Query('courseId') courseId: string | undefined,
    @Req() request: AuthRequest,
  ) {
    return this.mediaService
      .upload(files, courseId, request.user)
      .finally(() =>
        Promise.all(files.filter((file) => file.path).map((file) => rm(file.path, { force: true }))),
      );
  }
}