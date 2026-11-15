CREATE TABLE "MediaUploadSession" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "multipartUploadId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "partSizeBytes" INTEGER NOT NULL,
    "courseId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaUploadSession_storageKey_key" ON "MediaUploadSession"("storageKey");
CREATE INDEX "MediaUploadSession_expiresAt_idx" ON "MediaUploadSession"("expiresAt");
CREATE INDEX "MediaUploadSession_uploadedById_createdAt_idx" ON "MediaUploadSession"("uploadedById", "createdAt");

ALTER TABLE "MediaUploadSession"
    ADD CONSTRAINT "MediaUploadSession_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaUploadSession"
    ADD CONSTRAINT "MediaUploadSession_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
