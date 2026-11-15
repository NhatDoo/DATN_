import {
  Controller,
  Body,
  Get,
  Logger,
  Param,
  ParseFilePipe,
  Post,
  Query,
  Req,
  Res,
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
import type { Response } from 'express';
import { pipeline, Readable } from 'node:stream';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname } from 'node:path';
import { Public, Roles } from '../auth/auth.decorators.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MediaService } from './media.service.js';
import {
  CompleteVideoUploadDto,
  CreateVideoUploadDto,
  PresignVideoPartsDto,
} from './media.dto.js';

type AuthRequest = Request & { user: { id: string; role: UserRole } };

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  @Get('lessons/:lessonId/playback')
  @ApiOperation({ summary: 'Cấp URL HLS tạm thời cho học viên đã đăng ký' })
  playback(@Param('lessonId') lessonId: string, @Req() request: AuthRequest) {
    return this.mediaService.playback(lessonId, request.user);
  }

  @Get('assets/:assetId/image')
  @Public()
  @ApiOperation({ summary: 'Phục vụ ảnh thumbnail công khai qua private storage' })
  async image(@Param('assetId') assetId: string, @Res() response: Response) {
    const result = await this.mediaService.image(assetId);
    response.type(result.contentType).setHeader('Cache-Control', 'public, max-age=3600');
    return this.sendBody(result.body, response);
  }

  @Get('assets/:assetId/stream')
  @Public()
  @ApiOperation({ summary: 'Phát HLS bằng ticket có thời hạn ngắn' })
  async stream(
    @Param('assetId') assetId: string,
    @Query('ticket') ticket: string | undefined,
    @Res() response: Response,
  ) {
    const result = await this.mediaService.stream(assetId, ticket);
    response
      .type(result.contentType)
      .setHeader('Cache-Control', 'private, no-store')
      .setHeader('X-Content-Type-Options', 'nosniff');
    return this.sendBody(result.body, response);
  }

  @Get('course-materials/:materialId/download')
  @ApiOperation({ summary: 'Tải tài liệu khóa học sau khi xác minh quyền truy cập' })
  async downloadCourseMaterial(
    @Param('materialId') materialId: string,
    @Req() request: AuthRequest,
    @Res() response: Response,
  ) {
    const result = await this.mediaService.downloadCourseMaterial(materialId, request.user);
    response
      .type('application/octet-stream')
      .setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.originalName)}`)
      .setHeader('Cache-Control', 'private, no-store')
      .setHeader('X-Content-Type-Options', 'nosniff');
    return this.sendBody(result.body, response);
  }

  @Post('courses/:courseId/materials')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_request, file, callback) =>
          callback(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 25 * 1024 * 1024, files: 10 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiOperation({ summary: 'Đính kèm tối đa 10 tài liệu (25 MB mỗi file) vào khóa học của giảng viên' })
  uploadCourseMaterials(
    @Param('courseId') courseId: string,
    @UploadedFiles(new ParseFilePipe({ fileIsRequired: true })) files: Express.Multer.File[],
    @Req() request: AuthRequest,
  ) {
    return this.mediaService
      .uploadCourseMaterials(files, courseId, request.user)
      .finally(() =>
        Promise.all(files.filter((file) => file.path).map((file) => rm(file.path, { force: true }))),
      );
  }

  @Post('video-uploads')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Khởi tạo upload video trực tiếp tới object storage' })
  createVideoUpload(@Body() dto: CreateVideoUploadDto, @Req() request: AuthRequest) {
    return this.mediaService.createVideoUpload(dto, request.user);
  }

  @Post('video-uploads/:sessionId/parts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo URL upload có chữ ký cho các phần video' })
  presignVideoParts(
    @Param('sessionId') sessionId: string,
    @Body() dto: PresignVideoPartsDto,
    @Req() request: AuthRequest,
  ) {
    return this.mediaService.presignVideoUploadParts(sessionId, dto.partNumbers, request.user);
  }

  @Post('video-uploads/:sessionId/complete')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Hoàn tất upload và bắt đầu chuyển video sang HLS' })
  completeVideoUpload(
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteVideoUploadDto,
    @Req() request: AuthRequest,
  ) {
    return this.mediaService.completeVideoUpload(sessionId, dto.parts, request.user);
  }

  @Get('video-uploads/:sessionId/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Kiểm tra trạng thái xử lý video upload' })
  videoUploadStatus(@Param('sessionId') sessionId: string, @Req() request: AuthRequest) {
    return this.mediaService.getVideoUploadStatus(sessionId, request.user);
  }

  @Post('video-uploads/:sessionId/abort')
  @UseGuards(RolesGuard)
  @Roles(UserRole.INSTRUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Hủy upload video đang dở' })
  abortVideoUpload(@Param('sessionId') sessionId: string, @Req() request: AuthRequest) {
    return this.mediaService.abortVideoUpload(sessionId, request.user);
  }

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
      limits: { fileSize: 500 * 1024 * 1024, files: 100 },
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

  private sendBody(body: Buffer | Readable | undefined, response: Response) {
    if (!body) return response.sendStatus(404);
    if (Buffer.isBuffer(body)) return response.send(body);
    pipeline(body, response, (error) => {
      if (error) {
        this.logger.error('Failed to stream media asset', error);
        response.destroy();
      }
    });
    return response;
  }
}
