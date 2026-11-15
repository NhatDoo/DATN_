"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowDownUp, BarChart3, BookOpen, MessageSquare, Users } from "lucide-react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const subscribeAuth = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("hocmo-auth-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hocmo-auth-changed", callback);
  };
};
const getTokenSnapshot = () => localStorage.getItem("hocmo_access_token");
const getServerTokenSnapshot = () => null;

type AdminStats = { role: "ADMIN"; users: number; courses: number; onlineUsers: number; onlineWindowMinutes: number };
type StudentStats = { role: "STUDENT"; enrolledCourses: number; completedLessons: number; lessonProgressEventsThisWeek: number; activeDaysThisWeek: number };
type InstructorStats = {
  role: "INSTRUCTOR";
  totalRevenue: number;
  activityWindowDays: number;
  courses: Array<{ id: string; title: string; status: string; activity: number; revenue: number; reviews: number; enrollments: number }>;
  recentReviews: Array<{ id: string; rating: number; comment: string; course: { title: string }; user: { name: string } }>;
};
type Statistics = AdminStats | StudentStats | InstructorStats;

const formatNumber = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
const formatCurrency = (value: number) => `${formatNumber(value)}đ`;

export default function StatisticsPage() {
  const token = useSyncExternalStore(subscribeAuth, getTokenSnapshot, getServerTokenSnapshot);
  const [sortBy, setSortBy] = useState("revenue");
  const [order, setOrder] = useState("desc");
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [error, setError] = useState("");
  const [loadedRequestKey, setLoadedRequestKey] = useState("");
  const requestKey = token ? `${token}:${sortBy}:${order}` : "";
  const loading = Boolean(token && loadedRequestKey !== requestKey);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const query = new URLSearchParams({ sortBy, order });
    void fetch(`${apiUrl}/statistics/me?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể tải thống kê.");
        if (active) {
          setStatistics(result as Statistics);
          setError("");
          setLoadedRequestKey(requestKey);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Không thể tải thống kê.");
          setLoadedRequestKey(requestKey);
        }
      });
    return () => {
      active = false;
    };
  }, [token, sortBy, order, requestKey]);

  return (
    <main className="statistics-page">
      <header className="statistics-heading">
        <p className="eyebrow"><BarChart3 size={15} /> TỔNG QUAN</p>
        <h1>Thống kê.</h1>
        <p>Theo dõi hoạt động học tập, khóa học và hiệu quả giảng dạy của bạn.</p>
      </header>
      {!token ? (
        <p className="statistics-notice">Đăng nhập để xem thống kê cá nhân. <Link href="/login">Đăng nhập</Link></p>
      ) : loading ? (
        <p className="statistics-notice">Đang tải thống kê…</p>
      ) : error ? (
        <p className="statistics-error" role="alert">{error}</p>
      ) : statistics?.role === "ADMIN" ? (
        <section className="statistics-grid" aria-label="Thống kê quản trị">
          <article className="statistics-card"><Users /><span>Tài khoản</span><strong>{formatNumber(statistics.users)}</strong></article>
          <article className="statistics-card"><BookOpen /><span>Khóa học đang hoạt động</span><strong>{formatNumber(statistics.courses)}</strong></article>
          <article className="statistics-card"><Users /><span>Đang online · {statistics.onlineWindowMinutes} phút</span><strong>{formatNumber(statistics.onlineUsers)}</strong></article>
        </section>
      ) : statistics?.role === "STUDENT" ? (
        <section className="statistics-grid" aria-label="Thống kê học tập">
          <article className="statistics-card"><BookOpen /><span>Khóa học đã đăng ký</span><strong>{formatNumber(statistics.enrolledCourses)}</strong></article>
          <article className="statistics-card"><BarChart3 /><span>Bài học đã hoàn thành</span><strong>{formatNumber(statistics.completedLessons)}</strong></article>
          <article className="statistics-card"><Users /><span>Ngày học trong tuần</span><strong>{formatNumber(statistics.activeDaysThisWeek)} / 7</strong></article>
          <p className="statistics-notice">Bạn đã có {formatNumber(statistics.lessonProgressEventsThisWeek)} hoạt động học tập trong 7 ngày qua.</p>
        </section>
      ) : statistics?.role === "INSTRUCTOR" ? (
        <>
          <section className="statistics-grid" aria-label="Thống kê giảng viên">
            <article className="statistics-card"><BarChart3 /><span>Doanh thu đã thanh toán</span><strong>{formatCurrency(statistics.totalRevenue)}</strong></article>
            <article className="statistics-card"><BookOpen /><span>Khóa học đang quản lý</span><strong>{formatNumber(statistics.courses.length)}</strong></article>
            <article className="statistics-card"><MessageSquare /><span>Đánh giá</span><strong>{formatNumber(statistics.courses.reduce((total, course) => total + course.reviews, 0))}</strong></article>
          </section>
          <section className="statistics-panel">
            <div className="statistics-panel-heading">
              <div><p className="eyebrow">HIỆU QUẢ KHÓA HỌC</p><h2>Hoạt động 30 ngày gần nhất</h2></div>
              <label className="statistics-sort"><ArrowDownUp size={15} /> Sắp xếp
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="revenue">Doanh thu</option>
                  <option value="activity">Tần suất học</option>
                  <option value="reviews">Đánh giá</option>
                  <option value="enrollments">Học viên</option>
                </select>
                <button type="button" onClick={() => setOrder(order === "desc" ? "asc" : "desc")}>
                  {order === "desc" ? "Giảm dần" : "Tăng dần"}
                </button>
              </label>
            </div>
            {statistics.courses.length === 0 ? <p className="statistics-notice">Bạn chưa có khóa học nào.</p> : (
              <div className="statistics-table-wrap">
                <table className="statistics-table">
                  <thead><tr><th>Khóa học</th><th>Học viên</th><th>Hoạt động học</th><th>Đánh giá</th><th>Doanh thu</th></tr></thead>
                  <tbody>{statistics.courses.map((course) => (
                    <tr key={course.id}>
                      <td><Link href={`/courses/${course.id}`}>{course.title}</Link><small>{course.status === "PUBLISHED" ? "Đã xuất bản" : course.status === "DRAFT" ? "Bản nháp" : "Đã lưu trữ"}</small></td>
                      <td>{formatNumber(course.enrollments)}</td>
                      <td>{formatNumber(course.activity)}</td>
                      <td>{formatNumber(course.reviews)}</td>
                      <td>{formatCurrency(course.revenue)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="statistics-panel">
            <div className="statistics-panel-heading"><div><p className="eyebrow">PHẢN HỒI MỚI</p><h2>Đánh giá khóa học</h2></div><Link href="/feedback">Xem tất cả</Link></div>
            {statistics.recentReviews.length === 0 ? <p className="statistics-notice">Chưa có đánh giá nào.</p> : <ul className="statistics-review-list">
              {statistics.recentReviews.map((review) => <li key={review.id}><span>{review.course.title} · {review.user.name}</span><strong>{"★".repeat(review.rating)}</strong><p>{review.comment}</p></li>)}
            </ul>}
          </section>
        </>
      ) : null}
    </main>
  );
}
