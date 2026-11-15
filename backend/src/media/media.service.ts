import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  InternalServerErrorException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MediaUploadStatus, UserRole } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Express } from 'express';
import { CreateVideoUploadDto } from './media.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';

const execFileAsync = promisify(execFile);
const playbackLifetimeSeconds = 15 * 60;
const uploadSessionLifetimeMs = 24 * 60 * 60 * 1000;
const minimumVideoPartSize = 64 * 1024 * 1024;
const maximumVideoSize = 10 * 1024 ** 3;
const staleVideoProcessingMs = 65 * 60 * 1000;
const maximumCourseMaterialSize = 25 * 1024 * 1024;
const courseMaterialExtensions = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.csv',
  '.zip',
]);
const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
const contentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.vtt': 'text/vtt',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly playbackSecret =
    process.env.JWT_SECRET ?? 'development-secret-change-this';

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async createVideoUpload(
    dto: CreateVideoUploadDto,
    user: { id: string; role: UserRole },
  ) {
    await this.cleanupExpiredVideoUploads();
    const extension = extname(dto.fileName).toLowerCase();
    const mimeType = contentTypes[extension];
    if (!this.isVideoSource(dto.fileName) || !mimeType?.startsWith('video/')) {
      throw new BadRequestException('Unsupported video format');
    }
    if (dto.sizeBytes > maximumVideoSize) {
      throw new BadRequestException('Video exceeds the Neon Object Storage multipart limit of 10 GiB');
    }
    await this.assertCourseUploadAccess(dto.courseId, user);
    await this.assertFfmpegAvailable();

    const id = randomUUID();
    const storageKey = `video-uploads/${id}/source${extension}`;
    const partSizeBytes = Math.max(
      minimumVideoPartSize,
      Math.ceil(dto.sizeBytes / 10_000),
    );
    const multipartUploadId = await this.storage.createMultipartUpload(storageKey, mimeType);
    try {
      await this.prisma.mediaUploadSession.create({
        data: {
          id,
          storageKey,
          multipartUploadId,
          originalName: dto.fileName,
          mimeType,
          sizeBytes: BigInt(dto.sizeBytes),
          partSizeBytes,
          courseId: dto.courseId,
          uploadedById: user.id,
          expiresAt: new Date(Date.now() + uploadSessionLifetimeMs),
        },
      });
    } catch (error) {
      try {
        await this.storage.abortMultipartUpload(storageKey, multipartUploadId);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Could not save video upload session or clean up its storage upload',
        );
      }
      throw error;
    }
    return { id, partSizeBytes, expiresInSeconds: uploadSessionLifetimeMs / 1000 };
  }

  async presignVideoUploadParts(
    sessionId: string,
    partNumbers: number[],
    user: { id: string; role: UserRole },
  ) {
    const session = await this.getVideoUploadSession(sessionId, user);
    if (session.completedAt) throw new ConflictException('Video upload has already been completed');
    const partCount = Math.ceil(Number(session.sizeBytes) / session.partSizeBytes);
    if (partNumbers.some((partNumber) => partNumber > partCount)) {
      throw new BadRequestException('Part number exceeds the expected video size');
    }
    if (new Set(partNumbers).size !== partNumbers.length) {
      throw new BadRequestException('Part numbers must be unique');
    }
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(
          session.storageKey,
          session.multipartUploadId,
          partNumber,
        ),
      })),
    );
  }

  async completeVideoUpload(
    sessionId: string,
    parts: Array<{ partNumber: number; etag: string }>,
    user: { id: string; role: UserRole },
  ) {
    const session = await this.getVideoUploadSession(sessionId, user);
    if (
      session.status === MediaUploadStatus.PROCESSING ||
      session.status === MediaUploadStatus.COMPLETED
    ) {
      return { sessionId: session.id, status: session.status };
    }
    if (!session.completedAt) {
      const expectedPartCount = Math.ceil(Number(session.sizeBytes) / session.partSizeBytes);
      if (
        parts.length !== expectedPartCount ||
        parts.some(({ partNumber }, index) => partNumber !== index + 1)
      ) {
        throw new BadRequestException('All video parts must be uploaded in order before completion');
      }
      try {
        await this.storage.completeMultipartUpload(
          session.storageKey,
          session.multipartUploadId,
          parts,
        );
      } catch (error) {
        const completedObjectSize = await this.storage.objectSize(session.storageKey).catch(() => 0);
        if (completedObjectSize !== Number(session.sizeBytes)) {
          this.logger.error(
            `Could not complete multipart video upload ${session.id}: ${this.errorMessage(error)}`,
          );
          throw error;
        }
      }
      await this.prisma.mediaUploadSession.update({
        where: { id: session.id },
        data: { completedAt: new Date() },
      });
    }

    const status = await this.startVideoProcessing(session);
    return { sessionId: session.id, status };
  }

  async getVideoUploadStatus(sessionId: string, user: { id: string; role: UserRole }) {
    let session = await this.getVideoUploadSession(sessionId, user);
    if (session.status === MediaUploadStatus.UPLOADING && session.completedAt) {
      await this.startVideoProcessing(session);
      session = await this.getVideoUploadSession(sessionId, user);
    }
    if (
      session.status === MediaUploadStatus.PROCESSING &&
      session.processingStartedAt &&
      Date.now() - session.processingStartedAt.getTime() > staleVideoProcessingMs
    ) {
      const restarted = await this.prisma.mediaUploadSession.updateMany({
        where: {
          id: session.id,
          status: MediaUploadStatus.PROCESSING,
          processingStartedAt: session.processingStartedAt,
        },
        data: {
          processingStartedAt: new Date(),
          processingError: null,
        },
      });
      if (restarted.count > 0) this.scheduleVideoProcessing(session.id);
      session = await this.getVideoUploadSession(sessionId, user);
    }

    const assets =
      session.status === MediaUploadStatus.COMPLETED
        ? await this.getVideoUploadAssets(session.assetIds)
        : undefined;
    return {
      sessionId: session.id,
      status: session.status,
      uploadComplete: Boolean(session.completedAt),
      error: session.processingError ?? undefined,
      assets,
    };
  }

  private async startVideoProcessing(session: {
    id: string;
    storageKey: string;
    sizeBytes: bigint;
  }) {
    let actualSize: number;
    try {
      actualSize = await this.storage.objectSize(session.storageKey);
    } catch (error) {
      this.logger.error(
        `Could not verify completed video upload ${session.id}: ${this.errorMessage(error)}`,
      );
      throw error;
    }
    if (actualSize !== Number(session.sizeBytes)) {
      const error = 'Uploaded video size does not match the selected file';
      await this.prisma.mediaUploadSession.updateMany({
        where: {
          id: session.id,
          status: { in: [MediaUploadStatus.UPLOADING, MediaUploadStatus.FAILED] },
        },
        data: { status: MediaUploadStatus.FAILED, processingError: error },
      });
      throw new ConflictException(error);
    }

    const claimed = await this.prisma.mediaUploadSession.updateMany({
      where: {
        id: session.id,
        status: { in: [MediaUploadStatus.UPLOADING, MediaUploadStatus.FAILED] },
      },
      data: {
        status: MediaUploadStatus.PROCESSING,
        processingStartedAt: new Date(),
        processingError: null,
      },
    });
    if (claimed.count > 0) this.scheduleVideoProcessing(session.id);
    const current = await this.prisma.mediaUploadSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { status: true },
    });
    return current.status;
  }

  private scheduleVideoProcessing(sessionId: string) {
    setImmediate(() => {
      void this.processVideoUpload(sessionId);
    });
  }

  private async processVideoUpload(sessionId: string) {
    let directory: string | undefined;
    try {
      const session = await this.prisma.mediaUploadSession.findUnique({
        where: { id: sessionId },
      });
      if (!session || session.status !== MediaUploadStatus.PROCESSING || !session.completedAt) return;

      const actualSize = await this.storage.objectSize(session.storageKey);
      if (actualSize !== Number(session.sizeBytes)) {
        throw new ConflictException('Uploaded video size does not match the selected file');
      }

      directory = await mkdtemp(join(tmpdir(), 'course-video-upload-'));
      const sourcePath = join(directory, `${session.id}${extname(session.originalName)}`);
      await this.storage.downloadToFile(session.storageKey, sourcePath);
      const file = {
        originalname: session.originalName,
        path: sourcePath,
        size: actualSize,
      } as Express.Multer.File;
      const uploader = await this.prisma.user.findUniqueOrThrow({
        where: { id: session.uploadedById },
        select: { id: true, role: true },
      });
      const assets = await this.upload([file], session.courseId, uploader, session.id);
      await this.prisma.mediaUploadSession.update({
        where: { id: session.id },
        data: {
          status: MediaUploadStatus.COMPLETED,
          processingStartedAt: null,
          processingError: null,
          assetIds: assets.map(({ id }) => id),
        },
      });
      await this.storage.deleteMany([session.storageKey]).catch((error: unknown) => {
        this.logger.warn(
          `Could not remove processed source video ${session.id}: ${this.errorMessage(error)}`,
        );
      });
    } catch (error) {
      this.logger.error(
        `Video processing failed for upload ${sessionId}: ${this.errorMessage(error)}`,
      );
      try {
        await this.prisma.mediaUploadSession.updateMany({
          where: { id: sessionId, status: MediaUploadStatus.PROCESSING },
          data: {
            status: MediaUploadStatus.FAILED,
            processingStartedAt: null,
            processingError:
              error instanceof Error ? error.message : 'Video processing failed unexpectedly',
          },
        });
      } catch (stateError) {
        this.logger.error(
          `Could not save failed processing state for upload ${sessionId}: ${this.errorMessage(stateError)}`,
        );
      }
    } finally {
      if (directory) {
        await rm(directory, { recursive: true, force: true }).catch((error: unknown) => {
          this.logger.warn(
            `Could not remove temporary video directory for upload ${sessionId}: ${this.errorMessage(error)}`,
          );
        });
      }
    }
  }

  private async getVideoUploadAssets(assetIds: string[]) {
    if (!assetIds.length) return [];
    const assets = await this.prisma.mediaAsset.findMany({ where: { id: { in: assetIds } } });
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    return assetIds.flatMap((id) => {
      const asset = assetsById.get(id);
      if (!asset) return [];
      return [{
        id: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        courseId: asset.courseId,
        uploadedById: asset.uploadedById,
        createdAt: asset.createdAt,
        url: asset.mimeType.startsWith('image/')
          ? `/api/v1/media/assets/${asset.id}/image`
          : `asset://${asset.id}`,
      }];
    });
  }

  async abortVideoUpload(sessionId: string, user: { id: string; role: UserRole }) {
    const session = await this.getVideoUploadSession(sessionId, user);
    if (
      session.status === MediaUploadStatus.PROCESSING ||
      session.status === MediaUploadStatus.COMPLETED
    ) {
      throw new ConflictException('A video upload that is processing or completed cannot be aborted');
    }
    if (session.completedAt) {
      await this.storage.deleteMany([session.storageKey]);
    } else {
      await this.storage.abortMultipartUpload(session.storageKey, session.multipartUploadId);
    }
    await this.prisma.mediaUploadSession.delete({ where: { id: session.id } });
    return { aborted: true };
  }

  async upload(
    files: Express.Multer.File[],
    courseId: string | undefined,
    user: { id: string; role: UserRole },
    storagePrefix?: string,
  ) {
    if (!files?.length) throw new BadRequestException('Upload at least one file in field "files"');
    let generatedDirectory: string | undefined;
    let uploadFiles = files;
    if (files.length === 1 && this.isVideoSource(files[0].originalname)) {
      generatedDirectory = await mkdtemp(join(tmpdir(), 'course-hls-'));
      try {
        const source = files[0].path;
        if (!source) throw new BadRequestException('Video upload must use disk-backed temporary storage');
        const playlistPath = join(generatedDirectory, 'index.m3u8');
        await execFileAsync(
          ffmpegPath,
          [
            '-nostdin',
            '-y',
            '-i',
            source,
            '-map',
            '0:v:0',
            '-map',
            '0:a?',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '23',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-f',
            'hls',
            '-hls_time',
            '6',
            '-hls_playlist_type',
            'vod',
            '-hls_segment_filename',
            join(generatedDirectory, 'segment-%05d.ts'),
            playlistPath,
          ],
          { timeout: 60 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 },
        );
        uploadFiles = await Promise.all(
          (await readdir(generatedDirectory))
            .sort()
            .map(async (name) => {
              const path = join(generatedDirectory!, name);
              const fileStat = await stat(path);
              return {
                originalname: name,
                path,
                size: fileStat.size,
              } as Express.Multer.File;
            }),
        );
      } catch (error) {
        await rm(generatedDirectory, { recursive: true, force: true });
        if (error instanceof BadRequestException) throw error;
        this.logger.error(
          `HLS transcoding failed for upload ${files[0].originalname}: ${this.errorMessage(error)}`,
        );
        throw new InternalServerErrorException('Video transcoding to HLS failed');
      }
    }

    try {
      return await this.uploadFiles(uploadFiles, courseId, user, storagePrefix);
    } finally {
      if (generatedDirectory) {
        await rm(generatedDirectory, { recursive: true, force: true });
      }
    }
  }

  async uploadCourseMaterials(
    files: Express.Multer.File[],
    courseId: string,
    user: { id: string; role: UserRole },
  ) {
    if (!files?.length) throw new BadRequestException('Upload at least one course document');
    await this.assertCourseUploadAccess(courseId, user);
    for (const file of files) {
      if (!courseMaterialExtensions.has(extname(file.originalname).toLowerCase())) {
        throw new BadRequestException(`Unsupported course document: ${file.originalname}`);
      }
      if (file.size < 1 || file.size > maximumCourseMaterialSize) {
        throw new BadRequestException('Course documents must be between 1 byte and 25 MB');
      }
    }

    const materialIds = files.map(() => randomUUID());
    const storageKeys = materialIds.map((id) => `course-materials/${courseId}/${id}`);
    try {
      await Promise.all(
        files.map((file, index) =>
          this.storage.upload(storageKeys[index], file, 'application/octet-stream'),
        ),
      );
      const materials = await this.prisma.$transaction(
        files.map((file, index) =>
          this.prisma.courseMaterial.create({
            data: {
              id: materialIds[index],
              originalName: basename(file.originalname).replace(/[\r\n]/g, '').slice(0, 255),
              storageKey: storageKeys[index],
              sizeBytes: file.size,
              courseId,
              uploadedById: user.id,
            },
            select: { id: true, originalName: true, sizeBytes: true, createdAt: true },
          }),
        ),
      );
      return materials;
    } catch (error) {
      await this.storage.deleteMany(storageKeys).catch((cleanupError: unknown) => {
        this.logger.error(
          `Could not clean up failed course document upload: ${this.errorMessage(cleanupError)}`,
        );
      });
      throw error;
    }
  }

  async downloadCourseMaterial(materialId: string, user: { id: string; role: UserRole }) {
    const material = await this.prisma.courseMaterial.findUnique({
      where: { id: materialId },
      include: { course: { select: { instructorId: true } } },
    });
    if (!material) throw new NotFoundException('Course document not found');
    const isManager =
      user.role === UserRole.ADMIN || material.course.instructorId === user.id;
    if (!isManager) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: material.courseId } },
        select: { id: true },
      });
      if (!enrollment) throw new ForbiddenException('Enroll in the course to download its materials');
    }
    const object = await this.storage.read(material.storageKey);
    return {
      body: object.Body,
      originalName: material.originalName,
    };
  }

  private async uploadFiles(
    files: Express.Multer.File[],
    courseId: string | undefined,
    user: { id: string; role: UserRole },
    storagePrefix?: string,
  ) {
    if (courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { instructorId: true, deletedAt: true },
      });
      if (!course) throw new NotFoundException('Course not found');
      if (course.deletedAt) throw new ConflictException('Deleted courses cannot receive new media');
      if (user.role !== UserRole.ADMIN && course.instructorId !== user.id) {
        throw new ForbiddenException('You can only upload media to your own courses');
      }
    }

    const names = files.map((file) => this.safeRelativeName(file.originalname));
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Uploaded files must have unique relative paths');
    }
    const uploadedNames = new Set(names);
    const types = names.map((name) => contentTypes[extname(name).toLowerCase()]);
    for (const [index, file] of files.entries()) {
      if (!types[index]) throw new BadRequestException(`Unsupported media file: ${names[index]}`);
      if (extname(names[index]).toLowerCase() === '.m3u8') {
        const content = file.buffer
          ? file.buffer.toString('utf8')
          : await readFile(file.path, 'utf8');
        this.validatePlaylist(content, names[index], uploadedNames);
      }
    }

    const uploadId = storagePrefix ?? randomUUID();
    const storageKeys = names.map((name) => `${uploadId}/${name}`);
    try {
      await Promise.all(
        files.map((file, index) => this.storage.upload(storageKeys[index], file, types[index])),
      );
      const assets = await this.prisma.$transaction(
        files.map((file, index) => {
          const data = {
            originalName: names[index],
            storageKey: storageKeys[index],
            mimeType: types[index],
            sizeBytes: file.size,
            courseId,
            uploadedById: user.id,
          };
          return storagePrefix
            ? this.prisma.mediaAsset.upsert({
                where: { storageKey: storageKeys[index] },
                create: data,
                update: data,
              })
            : this.prisma.mediaAsset.create({
                data,
              });
        }),
      );
      return assets.map((asset) => ({
        id: asset.id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        courseId: asset.courseId,
        uploadedById: asset.uploadedById,
        createdAt: asset.createdAt,
        url: asset.mimeType.startsWith('image/')
          ? `/api/v1/media/assets/${asset.id}/image`
          : `asset://${asset.id}`,
      }));
    } catch (error) {
      await this.storage.deleteMany(storageKeys).catch(() => undefined);
      throw error;
    }
  }

  private async getVideoUploadSession(
    sessionId: string,
    user: { id: string; role: UserRole },
  ) {
    const session = await this.prisma.mediaUploadSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Video upload session not found');
    if (user.role !== UserRole.ADMIN && session.uploadedById !== user.id) {
      throw new ForbiddenException('You can only manage your own video uploads');
    }
    if (session.expiresAt <= new Date()) {
      if (session.completedAt) {
        await this.storage.deleteMany([session.storageKey]);
      } else {
        await this.storage.abortMultipartUpload(session.storageKey, session.multipartUploadId);
      }
      await this.prisma.mediaUploadSession.delete({ where: { id: session.id } });
      throw new GoneException('Video upload session has expired');
    }
    return session;
  }

  private async assertCourseUploadAccess(
    courseId: string,
    user: { id: string; role: UserRole },
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true, deletedAt: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.deletedAt) throw new ConflictException('Deleted courses cannot receive new media');
    if (user.role !== UserRole.ADMIN && course.instructorId !== user.id) {
      throw new ForbiddenException('You can only upload media to your own courses');
    }
  }

  private async cleanupExpiredVideoUploads() {
    const expired = await this.prisma.mediaUploadSession.findMany({
      where: {
        expiresAt: { lte: new Date() },
        status: { not: MediaUploadStatus.PROCESSING },
      },
    });
    for (const session of expired) {
      if (session.completedAt) {
        await this.storage.deleteMany([session.storageKey]);
      } else {
        await this.storage.abortMultipartUpload(session.storageKey, session.multipartUploadId);
      }
      await this.prisma.mediaUploadSession.delete({ where: { id: session.id } });
    }
  }

  private async assertFfmpegAvailable() {
    try {
      await execFileAsync(ffmpegPath, ['-version'], { timeout: 10_000, maxBuffer: 1024 * 1024 });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.logger.error(`FFmpeg executable was not found at "${ffmpegPath}"`);
        throw new ServiceUnavailableException(
          'Video processing is unavailable because FFmpeg is not installed. Install FFmpeg or configure FFMPEG_PATH.',
        );
      }
      throw error;
    }
  }

  async playback(lessonId: string, user: { id: string; role: UserRole }) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: {
        videoUrl: true,
        section: {
          select: {
            courseId: true,
            course: { select: { instructorId: true } },
          },
        },
      },
    });
    if (!lesson?.videoUrl) throw new NotFoundException('Lesson video not found');
    const courseId = lesson.section.courseId;
    const ownsCourse =
      user.role === UserRole.ADMIN ||
      (user.role === UserRole.INSTRUCTOR && lesson.section.course.instructorId === user.id);
    if (!ownsCourse) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: user.id, courseId } },
        select: { id: true },
      });
      if (!enrollment) throw new ForbiddenException('Enroll in the course to watch this lesson');
    }

    const asset = lesson.videoUrl.startsWith('asset://')
      ? await this.prisma.mediaAsset.findUnique({
          where: { id: lesson.videoUrl.slice('asset://'.length) },
        })
      : await this.findLegacyAsset(lesson.videoUrl, courseId);
    if (!asset || asset.courseId !== courseId || !asset.mimeType.includes('mpegurl')) {
      throw new NotFoundException('HLS playlist not found for this lesson');
    }

    const ticket = this.createPlaybackTicket(courseId);
    return {
      url: `/api/v1/media/assets/${asset.id}/stream?ticket=${encodeURIComponent(ticket)}`,
      expiresAt: new Date(Date.now() + playbackLifetimeSeconds * 1000).toISOString(),
    };
  }

  async image(assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset || !asset.mimeType.startsWith('image/')) {
      throw new NotFoundException('Image not found');
    }
    const result = await this.storage.read(asset.storageKey);
    return { body: result.Body, contentType: asset.mimeType };
  }

  async resolvePublicImageUrls(urls: Array<string | null | undefined>) {
    const urlKeys = urls.flatMap((url) => {
      if (!url) return [];
      const key = this.storage.keyFromUrl(url);
      return key ? [{ url, key }] : [];
    });
    const keys = [...new Set(urlKeys.map(({ key }) => key))];
    if (!keys.length) return new Map<string, string>();

    const assets = await this.prisma.mediaAsset.findMany({
      where: { storageKey: { in: keys }, mimeType: { startsWith: 'image/' } },
      select: { id: true, storageKey: true },
    });
    const assetIds = new Map(assets.map(({ storageKey, id }) => [storageKey, id]));
    return new Map(
      urlKeys.flatMap(({ url, key }) => {
        const assetId = assetIds.get(key);
        return assetId ? [[url, `/api/v1/media/assets/${assetId}/image`] as const] : [];
      }),
    );
  }

  async stream(assetId: string, ticket: string | undefined) {
    const courseId = this.verifyPlaybackTicket(ticket);
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.courseId !== courseId) throw new NotFoundException('Media asset not found');
    const result = await this.storage.read(asset.storageKey);
    if (!result.Body) throw new NotFoundException('Media object is missing from storage');
    if (!asset.mimeType.includes('mpegurl')) {
      return { body: result.Body, contentType: asset.mimeType };
    }

    if (asset.sizeBytes > 2 * 1024 * 1024) {
      throw new BadRequestException('HLS playlist exceeds the supported size limit');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString('utf8');
    const prefix = asset.storageKey.split('/')[0];
    const siblings = await this.prisma.mediaAsset.findMany({
      where: { courseId, storageKey: { startsWith: `${prefix}/` } },
      select: { id: true, storageKey: true },
    });
    const assetsByKey = new Map(siblings.map((item) => [item.storageKey, item.id]));
    const rewrite = (reference: string) => {
      const key = normalize(join(dirname(asset.storageKey), reference)).split(sep).join('/');
      const siblingId = assetsByKey.get(key);
      if (!siblingId) throw new BadRequestException('HLS playlist references a missing media asset');
      return `/api/v1/media/assets/${siblingId}/stream?ticket=${encodeURIComponent(ticket!)}`;
    };
    const rewritten = content
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) {
          return line.replace(/URI="([^"]+)"/g, (_match, reference: string) => `URI="${rewrite(reference)}"`);
        }
        return rewrite(trimmed);
      })
      .join('\n');
    return { body: Buffer.from(rewritten), contentType: 'application/vnd.apple.mpegurl' };
  }

  private async findLegacyAsset(videoUrl: string, courseId: string) {
    const key = this.storage.keyFromUrl(videoUrl);
    if (!key) return null;
    return this.prisma.mediaAsset.findFirst({ where: { storageKey: key, courseId } });
  }

  private createPlaybackTicket(courseId: string) {
    const payload = Buffer.from(
      JSON.stringify({ courseId, exp: Math.floor(Date.now() / 1000) + playbackLifetimeSeconds }),
    ).toString('base64url');
    const signature = createHmac('sha256', this.playbackSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyPlaybackTicket(ticket: string | undefined) {
    if (!ticket) throw new UnauthorizedException('Playback ticket is required');
    const [payload, suppliedSignature, extra] = ticket.split('.');
    if (!payload || !suppliedSignature || extra) throw new UnauthorizedException('Invalid playback ticket');
    const expected = createHmac('sha256', this.playbackSecret).update(payload).digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(suppliedSignature, 'base64url');
    } catch {
      throw new UnauthorizedException('Invalid playback ticket');
    }
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Invalid playback ticket');
    }
    let data: { courseId?: unknown; exp?: unknown };
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid playback ticket');
    }
    if (
      typeof data.courseId !== 'string' ||
      typeof data.exp !== 'number' ||
      data.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new GoneException('Playback ticket has expired');
    }
    return data.courseId;
  }

  private isVideoSource(name: string) {
    return ['.mp4', '.mov', '.mkv', '.webm'].includes(extname(name).toLowerCase());
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  private safeRelativeName(originalName: string) {
    const normalized = originalName.replace(/\\/g, '/');
    const segments = normalized.split('/').filter((segment) => segment && segment !== '.');
    if (!segments.length || segments.includes('..')) {
      throw new BadRequestException('Invalid media file path');
    }
    return segments.map((segment) => basename(segment)).join('/');
  }

  private validatePlaylist(content: string, playlistName: string, uploadedNames: Set<string>) {
    const references = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .flatMap((line) => {
        const uriAttributes = [...line.matchAll(/URI="([^"]+)"/g)].map((match) => match[1]);
        return [...(line && !line.startsWith('#') ? [line] : []), ...uriAttributes];
      });
    if (!references.length) throw new BadRequestException(`Playlist ${playlistName} is empty`);
    for (const reference of references) {
      if (/^[a-z][a-z\d+.-]*:/i.test(reference) || reference.startsWith('/')) {
        throw new BadRequestException('HLS playlists must use uploaded relative file paths');
      }
      const resolved = normalize(join(dirname(playlistName), reference)).replace(/\\/g, '/');
      if (resolved === '..' || resolved.startsWith('../') || !uploadedNames.has(resolved)) {
        throw new BadRequestException(`HLS playlist references a file that was not uploaded: ${reference}`);
      }
    }
  }
}