"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowUpRight, BookOpenCheck } from "lucide-react";
import { resolveApiAssetUrl } from "@/lib/courses";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const subscribeAuth = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("hocmo-auth-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hocmo-auth-changed", callback);
  };
};
const getAuthToken = () => localStorage.getItem("hocmo_access_token");
const getServerToken = () => null;

type EnrolledCourse = {
  id: string;
  enrolledAt: string;
  course: {
    id: string;
    title: string;
    description: string;
    thumbnail: string | null;
    instructor: { name: string };
    sections: Array<{
      lessons: Array<{ id: string; title: string; progress: Array<{ completedAt: string | null }> }>;
    }>;
  };
  progress: { completedLessons: number; totalLessons: number; percent: number };
};

export default function MyCoursesPage() {
  const [items, setItems] = useState<EnrolledCourse[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const token = useSyncExternalStore(subscribeAuth, getAuthToken, getServerToken);

  useEffect(() => {
    let active = true;
    if (!token) return;
    fetch(`${apiUrl}/learning/me/courses`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể tải khóa học.");
        return result as EnrolledCourse[];
      })
      .then((result) => {
        if (active) setItems(result);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="my-courses-page">
      <Link href="/" className="detail-breadcrumb"><ArrowLeft size={16} /> Về trang chủ</Link>
      <p className="eyebrow"><BookOpenCheck size={15} /> HÀNH TRÌNH HỌC TẬP</p>
      <h1>Khóa học của tôi.</h1>
      <p className="my-courses-intro">Tiếp tục từ nơi bạn đã dừng lại.</p>
      {!token ? <p className="my-courses-state">Vui lòng đăng nhập để xem các khóa học đã đăng ký.</p> :
        loading ? <p className="my-courses-state">Đang tải khóa học…</p> :
        error ? <p className="purchase-error" role="alert">{error}</p> :
        items.length === 0 ? <div className="my-courses-empty"><p>Bạn chưa đăng ký khóa học nào.</p><Link className="buy-button" href="/#catalog">Khám phá khóa học <ArrowUpRight size={17} /></Link></div> :
        <div className="my-courses-list">
          {items.map(({ course, progress }) => {
            const lessons = course.sections.flatMap((section) => section.lessons);
            const nextLesson = lessons.find((lesson) => !lesson.progress[0]?.completedAt) ?? lessons[0];
            return (
              <article className="my-course-card" key={course.id}>
                <div className="my-course-cover" style={course.thumbnail ? { backgroundImage: `url("${resolveApiAssetUrl(course.thumbnail)}")` } : undefined} />
                <div className="my-course-details">
                  <p className="eyebrow">{course.instructor.name}</p>
                  <h2>{course.title}</h2>
                  <p>{course.description}</p>
                  <div className="progress-summary">
                    <span>{progress.completedLessons}/{progress.totalLessons} bài học hoàn thành</span>
                    <strong>{progress.percent}%</strong>
                  </div>
                  <progress value={progress.percent} max="100" aria-label={`Tiến độ ${progress.percent}%`} />
                  <Link className="my-course-continue" href={nextLesson ? `/courses/${course.id}?lessonId=${nextLesson.id}` : `/courses/${course.id}`}>
                    {progress.percent === 100 ? "Ôn tập khóa học" : "Tiếp tục học"} <ArrowUpRight size={16} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>}
    </main>
  );
}
