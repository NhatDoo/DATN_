"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageSquare, Star } from "lucide-react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
type Review = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  user: { name: string };
  course: { id: string; title: string; slug: string };
};

export default function FeedbackPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch(`${apiUrl}/courses/reviews/recent`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể tải phản hồi.");
        if (active) setReviews(result as Review[]);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Không thể tải phản hồi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="feedback-page">
      <Link className="detail-breadcrumb" href="/"><ArrowLeft size={15} /> Về trang chủ</Link>
      <header className="statistics-heading">
        <p className="eyebrow"><MessageSquare size={15} /> CỘNG ĐỒNG HỌC TẬP</p>
        <h1>Phản hồi.</h1>
        <p>Đánh giá và chia sẻ trải nghiệm của học viên về các khóa học.</p>
      </header>
      {loading ? <p className="statistics-notice">Đang tải đánh giá…</p> :
        error ? <p className="statistics-error" role="alert">{error}</p> :
        reviews.length === 0 ? <p className="statistics-notice">Chưa có đánh giá nào.</p> :
        <ul className="feedback-list">{reviews.map((review) => (
          <li key={review.id} className="feedback-card">
            <div className="feedback-card-heading">
              <div><strong>{review.user.name}</strong><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("vi-VN")}</time></div>
              <span aria-label={`${review.rating} trên 5 sao`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < review.rating ? "currentColor" : "none"} />)}</span>
            </div>
            <p>{review.comment}</p>
            <Link href={`/courses/${review.course.slug}`}>{review.course.title}</Link>
          </li>
        ))}</ul>}
    </main>
  );
}
