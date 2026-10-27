import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, normalize } from 'node:path';
import { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';

const contentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    files: Express.Multer.File[],
    courseId: string | undefined,
    user: { id: string; role: UserRole },
  ) {
    if (!files?.length) throw new BadRequestException('Upload at least one file in field "files"');
    if (courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { instructorId: true },
      });
      if (!course) throw new NotFoundException('Course not found');
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

    const uploadId = randomUUID();
    const storageKeys = names.map((name) => `${uploadId}/${name}`);
    try {
      await Promise.all(
        files.map((file, index) => this.storage.upload(storageKeys[index], file, types[index])),
      );
      const assets = await this.prisma.$transaction(
        files.map((file, index) =>
          this.prisma.mediaAsset.create({
            data: {
              originalName: names[index],
              storageKey: storageKeys[index],
              mimeType: types[index],
              sizeBytes: file.size,
              courseId,
              uploadedById: user.id,
            },
          }),
        ),
      );
      return assets.map((asset) => ({ ...asset, url: this.storage.url(asset.storageKey) }));
    } catch (error) {
      await this.storage.deleteMany(storageKeys).catch(() => undefined);
      throw error;
    }
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