CREATE TYPE "MediaUploadStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "MediaUploadSession"
    ADD COLUMN "status" "MediaUploadStatus" NOT NULL DEFAULT 'UPLOADING',
    ADD COLUMN "processingStartedAt" TIMESTAMPTZ(3),
    ADD COLUMN "processingError" TEXT,
    ADD COLUMN "assetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
