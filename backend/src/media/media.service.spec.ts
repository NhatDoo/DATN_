import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MediaUploadStatus, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from './media.service.js';
import { StorageService } from './storage.service.js';

const makeFile = (name: string, content: string): Express.Multer.File =>
  ({
    originalname: name,
    buffer: Buffer.from(content),
    size: Buffer.byteLength(content),
  }) as Express.Multer.File;

describe('MediaService', () => {
  it('creates an authorized multipart video upload session with adaptive parts', async () => {
    const createSession = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: data.id, ...data }),
    );
    const prisma = {
      course: {
        findUnique: vi.fn().mockResolvedValue({ instructorId: 'instructor-id' }),
      },
      mediaUploadSession: {
        findMany: vi.fn().mockResolvedValue([]),
        create: createSession,
      },
    } as unknown as PrismaService;
    const storage = {
      createMultipartUpload: vi.fn().mockResolvedValue('multipart-id'),
    } as unknown as StorageService;
    const service = new MediaService(prisma, storage);

    const result = await service.createVideoUpload(
      { fileName: 'lesson.mp4', sizeBytes: 120_000_000, courseId: 'course-id' },
      { id: 'instructor-id', role: UserRole.INSTRUCTOR },
    );

    expect(result.partSizeBytes).toBe(64 * 1024 * 1024);
    expect(result.id).toBeTruthy();
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageKey: expect.stringMatching(/^video-uploads\/.+\/source\.mp4$/),
          multipartUploadId: 'multipart-id',
          sizeBytes: BigInt(120_000_000),
          courseId: 'course-id',
          uploadedById: 'instructor-id',
        }),
      }),
    );
  });

  it('returns immediately after multipart completion and schedules HLS processing', async () => {
    const completeMultipartUpload = vi.fn().mockResolvedValue(undefined);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const session = {
      id: 'upload-session-id',
      storageKey: 'video-uploads/upload-session-id/source.mp4',
      multipartUploadId: 'multipart-id',
      originalName: 'lesson.mp4',
      sizeBytes: BigInt(4),
      partSizeBytes: 64 * 1024 * 1024,
      courseId: 'course-id',
      uploadedById: 'instructor-id',
      expiresAt: new Date(Date.now() + 60_000),
      completedAt: null,
      status: MediaUploadStatus.UPLOADING,
      processingStartedAt: null,
      processingError: null,
      assetIds: [],
    };
    const prisma = {
      mediaUploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        update: vi.fn().mockResolvedValue({ ...session, completedAt: new Date() }),
        updateMany,
        findUniqueOrThrow: vi.fn().mockResolvedValue({ status: MediaUploadStatus.PROCESSING }),
      },
    } as unknown as PrismaService;
    const storage = {
      completeMultipartUpload,
      objectSize: vi.fn().mockResolvedValue(4),
    } as unknown as StorageService;
    const service = new MediaService(prisma, storage);

    const result = await service.completeVideoUpload(
      'upload-session-id',
      [{ partNumber: 1, etag: '"part-etag"' }],
      { id: 'instructor-id', role: UserRole.INSTRUCTOR },
    );

    expect(result).toEqual({ sessionId: 'upload-session-id', status: MediaUploadStatus.PROCESSING });
    expect(completeMultipartUpload).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MediaUploadStatus.PROCESSING }),
      }),
    );
  });

  it('returns completed video assets from the upload status endpoint', async () => {
    const session = {
      id: 'upload-session-id',
      uploadedById: 'instructor-id',
      expiresAt: new Date(Date.now() + 60_000),
      status: MediaUploadStatus.COMPLETED,
      processingStartedAt: null,
      processingError: null,
      assetIds: ['playlist-asset-id'],
    };
    const asset = {
      id: 'playlist-asset-id',
      originalName: 'index.m3u8',
      mimeType: 'application/vnd.apple.mpegurl',
      sizeBytes: 128,
      courseId: 'course-id',
      uploadedById: 'instructor-id',
      createdAt: new Date(),
    };
    const prisma = {
      mediaUploadSession: { findUnique: vi.fn().mockResolvedValue(session) },
      mediaAsset: { findMany: vi.fn().mockResolvedValue([asset]) },
    } as unknown as PrismaService;
    const service = new MediaService(prisma, {} as StorageService);

    const result = await service.getVideoUploadStatus('upload-session-id', {
      id: 'instructor-id',
      role: UserRole.INSTRUCTOR,
    });

    expect(result.status).toBe(MediaUploadStatus.COMPLETED);
    expect(result.assets?.[0]).toMatchObject({
      id: 'playlist-asset-id',
      url: 'asset://playlist-asset-id',
    });
  });

  it('uploads a playlist with all referenced HLS segments', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn(({ data }) => Promise.resolve({ id: 'asset-id', ...data }));
    const prisma = {
      mediaAsset: { create },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const storage = { upload, deleteMany: vi.fn() } as unknown as StorageService;
    const mediaService = new MediaService(prisma, storage);

    const result = await mediaService.upload(
      [
        makeFile('hls/index.m3u8', '#EXTM3U\n#EXTINF:5,\nsegment-0.ts\n'),
        makeFile('hls/segment-0.ts', 'segment'),
      ],
      undefined,
      { id: 'user-id', role: UserRole.INSTRUCTOR },
    );

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][0]).toMatch(/\/hls\/index\.m3u8$/);
    expect(result[0].url).toBe('asset://asset-id');
  });

  it('uses stable storage keys and upserts assets when retrying video processing', async () => {
    const upsert = vi.fn(({ create }) => Promise.resolve({ id: create.storageKey, ...create }));
    const prisma = {
      course: { findUnique: vi.fn().mockResolvedValue({ instructorId: 'instructor-id' }) },
      mediaAsset: { upsert },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const storage = {
      upload: vi.fn().mockResolvedValue(undefined),
    } as unknown as StorageService;
    const service = new MediaService(prisma, storage);

    await service.upload(
      [
        makeFile('index.m3u8', '#EXTM3U\n#EXTINF:5,\nsegment.ts\n'),
        makeFile('segment.ts', 'segment'),
      ],
      'course-id',
      { id: 'instructor-id', role: UserRole.INSTRUCTOR },
      'stable-upload-id',
    );

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls.map(([args]) => args.where.storageKey)).toEqual([
      'stable-upload-id/index.m3u8',
      'stable-upload-id/segment.ts',
    ]);
  });

  it('rejects playlists that reference files outside the upload', async () => {
    const upload = vi.fn();
    const prisma = {} as PrismaService;
    const storage = { upload } as unknown as StorageService;
    const mediaService = new MediaService(prisma, storage);

    await expect(
      mediaService.upload(
        [makeFile('index.m3u8', '#EXTM3U\nmissing.ts\n')],
        undefined,
        { id: 'user-id', role: UserRole.INSTRUCTOR },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });

  it('stores course documents privately and rejects downloads without enrollment', async () => {
    const create = vi.fn(({ data, select }) => Promise.resolve({ ...data, ...select }));
    const prisma = {
      course: { findUnique: vi.fn().mockResolvedValue({ instructorId: 'instructor-id' }) },
      courseMaterial: {
        create,
        findUnique: vi.fn().mockResolvedValue({
          id: 'material-id',
          courseId: 'course-id',
          storageKey: 'course-materials/course-id/material-id',
          originalName: 'notes.pdf',
          course: { instructorId: 'instructor-id' },
        }),
      },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
      enrollment: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const upload = vi.fn().mockResolvedValue(undefined);
    const read = vi.fn();
    const storage = {
      upload,
      read,
      deleteMany: vi.fn(),
    } as unknown as StorageService;
    const service = new MediaService(prisma, storage);

    await service.uploadCourseMaterials(
      [makeFile('notes.pdf', 'course notes')],
      'course-id',
      { id: 'instructor-id', role: UserRole.INSTRUCTOR },
    );

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^course-materials\/course-id\//),
      expect.objectContaining({ originalname: 'notes.pdf' }),
      'application/octet-stream',
    );
    expect(create).toHaveBeenCalledOnce();
    await expect(
      service.downloadCourseMaterial('material-id', { id: 'student-id', role: UserRole.STUDENT }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(read).not.toHaveBeenCalled();
  });

  it('rewrites stored private-storage image URLs to the API image proxy', async () => {
    const mediaAssetFindMany = vi.fn().mockResolvedValue([
      { id: 'image-id', storageKey: 'upload-id/thumbnail.png' },
    ]);
    const prisma = { mediaAsset: { findMany: mediaAssetFindMany } } as unknown as PrismaService;
    const storage = {
      keyFromUrl: vi.fn().mockReturnValue('upload-id/thumbnail.png'),
    } as unknown as StorageService;
    const service = new MediaService(prisma, storage);
    const privateUrl = 'https://storage.example/course-media/upload-id/thumbnail.png';

    const urls = await service.resolvePublicImageUrls([privateUrl]);

    expect(urls.get(privateUrl)).toBe('/api/v1/media/assets/image-id/image');
    expect(mediaAssetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storageKey: { in: ['upload-id/thumbnail.png'] },
          mimeType: { startsWith: 'image/' },
        },
      }),
    );
  });

  it('issues a short-lived playback ticket and rewrites HLS segments through the API', async () => {
    const playlistKey = 'upload-id/index.m3u8';
    const segmentKey = 'upload-id/segment-00000.ts';
    const prisma = {
      courseLesson: {
        findUnique: vi.fn().mockResolvedValue({
          videoUrl: 'asset://playlist-id',
          section: { courseId: 'course-id', course: { instructorId: 'instructor-id' } },
        }),
      },
      enrollment: { findUnique: vi.fn().mockResolvedValue({ id: 'enrollment-id' }) },
      mediaAsset: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'playlist-id',
          courseId: 'course-id',
          storageKey: playlistKey,
          mimeType: 'application/vnd.apple.mpegurl',
          sizeBytes: 36,
        }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'playlist-id', storageKey: playlistKey },
          { id: 'segment-id', storageKey: segmentKey },
        ]),
      },
    } as unknown as PrismaService;
    const storage = {
      read: vi.fn().mockResolvedValue({
        Body: Readable.from([Buffer.from('#EXTM3U\n#EXTINF:5,\nsegment-00000.ts\n')]),
      }),
    } as unknown as StorageService;
    const service = new MediaService(prisma, storage);
    const playback = await service.playback('lesson-id', {
      id: 'student-id',
      role: UserRole.STUDENT,
    });

    const result = new URL(playback.url, 'https://api.example');
    const streamed = await service.stream('playlist-id', result.searchParams.get('ticket') ?? undefined);
    let body: string;
    if (Buffer.isBuffer(streamed.body)) {
      body = streamed.body.toString('utf8');
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of streamed.body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString('utf8');
    }

    expect(result.pathname).toBe('/api/v1/media/assets/playlist-id/stream');
    expect(playback.expiresAt).toBeTruthy();
    expect(body).toContain('/api/v1/media/assets/segment-id/stream?ticket=');
  });

  it('rejects playback without a course enrollment', async () => {
    const prisma = {
      courseLesson: {
        findUnique: vi.fn().mockResolvedValue({
          videoUrl: 'asset://playlist-id',
          section: { courseId: 'course-id', course: { instructorId: 'instructor-id' } },
        }),
      },
      enrollment: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new MediaService(prisma, {} as StorageService);

    await expect(
      service.playback('lesson-id', { id: 'student-id', role: UserRole.STUDENT }),
    ).rejects.toThrow('Enroll in the course to watch this lesson');
  });
});