CREATE TABLE "CourseQuiz" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "courseId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourseQuiz_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseQuizQuestion" (
    "id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT[] NOT NULL,
    "correctOption" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "quizId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseQuizQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseQuiz_courseId_createdAt_idx" ON "CourseQuiz"("courseId", "createdAt");
CREATE UNIQUE INDEX "CourseQuizQuestion_quizId_position_key" ON "CourseQuizQuestion"("quizId", "position");

ALTER TABLE "CourseQuiz"
    ADD CONSTRAINT "CourseQuiz_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseQuizQuestion"
    ADD CONSTRAINT "CourseQuizQuestion_quizId_fkey"
    FOREIGN KEY ("quizId") REFERENCES "CourseQuiz"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
