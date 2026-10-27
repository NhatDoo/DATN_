import { Suspense } from "react";
import CourseDetail from "@/components/CourseDetail";

export default function CoursePage() {
  return (
    <Suspense fallback={<div className="detail-loading">Đang mở khóa học…</div>}>
      <CourseDetail />
    </Suspense>
  );
}