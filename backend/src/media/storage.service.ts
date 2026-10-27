import { Injectable } from '@nestjs/common';
import {
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Express } from 'express';
import { createReadStream } from 'node:fs';

@Injectable()
export class StorageService {
  private readonly bucket = process.env.STORAGE_BUCKET ?? 'course-media';
  private readonly endpoint = process.env.AWS_ENDPOINT_URL_S3;
  private readonly region = process.env.AWS_REGION ?? 'us-east-1';
  private readonly publicBaseUrl = (
    process.env.STORAGE_PUBLIC_URL ??
    this.endpoint ??
    `https://s3.${this.region}.amazonaws.com`
  ).replace(/\/$/, '');
  private readonly client = new S3Client({
    ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
    region: this.region,
  });

  async upload(key: string, file: Express.Multer.File, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer ?? createReadStream(file.path),
        ContentLength: file.size,
        ContentType: contentType,
        CacheControl: key.endsWith('.m3u8') ? 'no-cache' : 'public, max-age=31536000, immutable',
      }),
    );
  }

  async deleteMany(keys: string[]) {
    if (!keys.length) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }

  url(key: string) {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/${this.bucket}/${encodedKey}`;
  }
}