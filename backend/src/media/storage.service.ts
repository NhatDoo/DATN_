import { Injectable } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Express } from 'express';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

@Injectable()
export class StorageService {
  private readonly bucket = process.env.STORAGE_BUCKET ?? 'course-media';
  private readonly endpoint = process.env.AWS_ENDPOINT_URL_S3;
  private readonly region = process.env.AWS_REGION ?? 'us-east-1';
  private readonly client = new S3Client({
    ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
    region: this.region,
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });

  async upload(key: string, file: Express.Multer.File, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer ?? createReadStream(file.path),
        ContentLength: file.size,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      }),
    );
  }

  async createMultipartUpload(key: string, contentType: string) {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      }),
    );
    if (!result.UploadId) throw new Error('Storage did not return a multipart upload ID');
    return result.UploadId;
  }

  presignUploadPart(key: string, uploadId: string, partNumber: number) {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 600 },
    );
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map(({ partNumber, etag }) => ({
            PartNumber: partNumber,
            ETag: etag,
          })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async objectSize(key: string) {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return result.ContentLength ?? 0;
  }

  async downloadToFile(key: string, path: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!(result.Body instanceof Readable)) {
      throw new Error('Storage returned a non-streaming object body');
    }
    await pipeline(result.Body, createWriteStream(path));
  }

  read(key: string) {
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })).then(async (result) => {
      const body = result.Body;
      return {
        ...result,
        Body: body
          ? body instanceof Readable
            ? body
            : Readable.from([await body.transformToByteArray()])
          : undefined,
      };
    });
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

  keyFromUrl(value: string) {
    try {
      const path = new URL(value).pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (path[0] !== this.bucket || path.length < 2) return null;
      return path.slice(1).join('/');
    } catch {
      return null;
    }
  }
}