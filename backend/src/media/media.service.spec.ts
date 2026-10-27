import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
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
  it('uploads a playlist with all referenced HLS segments', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn(({ data }) => Promise.resolve({ id: 'asset-id', ...data }));
    const prisma = {
      mediaAsset: { create },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const storage = {
      upload,
      deleteMany: vi.fn(),
      url: (key: string) => `https://storage.example/${key}`,
    } as unknown as StorageService;
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
    expect(result[0].url).toMatch(/\/hls\/index\.m3u8$/);
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
});