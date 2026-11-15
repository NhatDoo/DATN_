ALTER TABLE "Course" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMPTZ(3);

CREATE INDEX "Course_status_deletedAt_createdAt_idx"
    ON "Course"("status", "deletedAt", "createdAt");
CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt");
