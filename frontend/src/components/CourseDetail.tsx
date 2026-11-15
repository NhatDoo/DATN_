"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BadgeCheck, BookOpen, Check, Clock3, Download, LockKeyhole, Play, ShieldCheck, Star, Users } from "lucide-react";
import VideoPlayer from "@/components/VideoPlayer";
import { courseFromApi, resolveApiAssetUrl, type Course, type Lesson } from "@/lib/courses";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const priceText = (price: number) => new Intl.NumberFormat("vi-VN").format(price) + "đ";
let clockNow = Date.now();
const subscribeToClock = (callback: () => void) => {
  const timer = window.setInterval(() => {
    clockNow = Date.now();
    callback();
  }, 15_000);
  return () => window.clearInterval(timer);
};
const getClockSnapshot = () => clockNow;
const getServerClockSnapshot = () => 0;
const emptyCourse = (id: string): Course => ({
  id,
  slug: id,
  title: "",
  category: "",
  instructor: "",
  rating: 0,
  students: "",
  price: 0,
  hours: "—",
  level: "",
  description: "",
  thumbnail: "",
  accent: "",
  lessons: [],
});

type CourseReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  user?: { id: string; name: string };
};
type CourseMaterial = { id: string; originalName: string; sizeBytes: number };

export default function CourseDetail() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();
  const search = useSearchParams();
  const [remoteCourse, setRemoteCourse] = useState<{ routeId: string; course: Course } | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [courseStatus, setCourseStatus] = useState<{
    routeId: string;
    error: string;
  } | null>(null);
  const course = remoteCourse?.routeId === courseId ? remoteCourse.course : emptyCourse(courseId);
  const selectedLesson =
    course.lessons.find((lesson) => lesson.id === selectedLessonId) ??
    course.lessons.find((lesson) => lesson.id === search.get("lessonId")) ??
    null;
  const [access, setAccess] = useState<{
    routeId: string;
    hasAccess: boolean;
    refundExpiresAt: string | null;
    transactionRef: string | null;
    paymentStatus: "PAID" | "REFUND_PENDING" | "REFUNDED" | null;
  } | null>(null);
  const courseAccess = access?.routeId === courseId ? access : null;
  const hasAccess = courseAccess?.hasAccess ?? false;
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const [showPurchase, setShowPurchase] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [ownReview, setOwnReview] = useState<CourseReview | null>(null);
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewProcessing, setReviewProcessing] = useState(false);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("hocmo_access_token");
    fetch(`${apiUrl}/courses/${courseId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Không thể tải khóa học.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        const lessons: Lesson[] = (data.sections ?? []).flatMap((section: { lessons?: Array<Record<string, unknown>> }) =>
          (section.lessons ?? []).map((lesson) => ({
            id: String(lesson.id),
            title: String(lesson.title),
            duration: formatDuration(Number(lesson.durationSec ?? 0)),
            hasVideo: Boolean(lesson.hasVideo),
          })),
        );
        const remoteCourse: Course = {
          ...courseFromApi(data),
          lessons,
        };
        setRemoteCourse({ routeId: courseId, course: remoteCourse });
        const requestedLessonId = search.get("lessonId");
        setSelectedLessonId(
          remoteCourse.lessons.find((lesson) => lesson.id === requestedLessonId)?.id ??
            remoteCourse.lessons[0]?.id ??
            null,
        );
        setAccess({
          routeId: courseId,
          hasAccess: Boolean(data.hasAccess),
          refundExpiresAt: data.refundExpiresAt ?? null,
          transactionRef: data.transactionRef ?? null,
          paymentStatus: data.paymentStatus ?? null,
        });
        const currentReview = (data.ownReview ?? null) as CourseReview | null;
        setReviews(Array.isArray(data.reviews) ? data.reviews as CourseReview[] : []);
        setOwnReview(currentReview);
        setReviewRating(currentReview?.rating ?? 5);
        setReviewComment(currentReview?.comment ?? "");
        setMaterials(Array.isArray(data.materials) ? data.materials as CourseMaterial[] : []);
        setCourseStatus({ routeId: courseId, error: "" });
      })
      .catch((requestError: unknown) => {
        if (active) {
          setCourseStatus({
            routeId: courseId,
            error: requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [courseId, search]);

  useEffect(() => {
    if (!hasAccess || !selectedLesson?.hasVideo || selectedLesson.videoUrl) return;
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) return;
    let active = true;
    fetch(`${apiUrl}/media/lessons/${selectedLesson.id}/playback`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể mở video bài học.");
        return result as { url: string };
      })
      .then(({ url }) => {
        if (!active) return;
        const apiOrigin = apiUrl.startsWith("http") ? apiUrl : window.location.origin;
        const videoUrl = new URL(url, apiOrigin).toString();
        setRemoteCourse((current) =>
          current?.routeId !== courseId
            ? current
            : {
                ...current,
                course: {
                  ...current.course,
                  lessons: current.course.lessons.map((lesson) =>
                    lesson.id === selectedLesson.id ? { ...lesson, videoUrl } : lesson,
                  ),
                },
              },
        );
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Không thể mở video.");
        }
      });
    return () => {
      active = false;
    };
  }, [courseId, hasAccess, selectedLesson?.hasVideo, selectedLesson?.id, selectedLesson?.videoUrl]);

  async function startCheckout() {
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setProcessing(true);
    setError("");
    try {
      if (course.price <= 0) {
        const response = await fetch(`${apiUrl}/learning/enrollments`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.id }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể đăng ký khóa học.");
        setAccess({
          routeId: courseId,
          hasAccess: true,
          refundExpiresAt: null,
          transactionRef: null,
          paymentStatus: null,
        });
        setShowPurchase(false);
        setNotice("Đăng ký thành công. Bạn có thể bắt đầu học ngay.");
        return;
      }
      const response = await fetch(`${apiUrl}/payments/courses/${course.id}/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Không thể khởi tạo thanh toán.");
      window.location.assign(result.paymentUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
      setProcessing(false);
    }
  }

  async function requestRefund() {
    const token = localStorage.getItem("hocmo_access_token");
    if (!token || !courseAccess?.transactionRef) return;
    setProcessing(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/payments/${courseAccess.transactionRef}/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 && result.message === "A refund is already being processed") {
          setAccess({ ...courseAccess, paymentStatus: "REFUND_PENDING" });
        }
        throw new Error(result.message || "Không thể xử lý yêu cầu hoàn tiền.");
      }
      if (result.status !== "REFUNDED") {
        throw new Error("VNPAY chưa xác nhận hoàn tiền. Quyền truy cập vẫn được giữ nguyên.");
      }
      setAccess({
        routeId: courseId,
        hasAccess: false,
        refundExpiresAt: null,
        transactionRef: null,
        paymentStatus: null,
      });
      setMaterials([]);
      setRemoteCourse((current) =>
        current?.routeId !== courseId
          ? current
          : {
              ...current,
              course: {
                ...current.course,
                lessons: current.course.lessons.map((lesson) => ({ ...lesson, videoUrl: undefined })),
              },
            },
      );
      setNotice("Hoàn tiền thành công. Quyền truy cập đã được gỡ; bạn có thể mua lại khóa học bất cứ lúc nào.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
    } finally {
      setProcessing(false);
    }
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setReviewError("Vui lòng đăng nhập để gửi đánh giá.");
      return;
    }
    setReviewProcessing(true);
    setReviewError("");
    setReviewNotice("");
    try {
      const response = await fetch(`${apiUrl}/courses/${course.id}/reviews`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Không thể gửi đánh giá.");
      const review = result as CourseReview;
      const currentCount = course.reviewCount ?? 0;
      const nextCount = ownReview ? currentCount : currentCount + 1;
      const nextRating =
        nextCount > 0
          ? ((course.rating * currentCount - (ownReview?.rating ?? 0) + review.rating) / nextCount)
          : review.rating;
      setRemoteCourse((current) =>
        current?.routeId !== courseId
          ? current
          : { ...current, course: { ...current.course, rating: Math.round(nextRating * 10) / 10, reviewCount: nextCount } },
      );
      setOwnReview(review);
      setReviews((current) => [review, ...current.filter(({ id }) => id !== review.id)].slice(0, 50));
      setReviewNotice("Cảm ơn bạn đã chia sẻ đánh giá.");
    } catch (requestError) {
      setReviewError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
    } finally {
      setReviewProcessing(false);
    }
  }

  async function downloadMaterial(material: CourseMaterial) {
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setError("Vui lòng đăng nhập và đăng ký khóa học để tải tài liệu.");
      return;
    }
    setError("");
    try {
      const response = await fetch(`${apiUrl}/media/course-materials/${material.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "Không thể tải tài liệu.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = material.originalName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tải tài liệu.");
    }
  }

  const refundAllowed = Boolean(
    courseAccess?.refundExpiresAt && now <= new Date(courseAccess.refundExpiresAt).getTime(),
  );
  function refreshPlayback() {
    if (!selectedLesson) return;
    setRemoteCourse((current) =>
      current?.routeId !== courseId
        ? current
        : {
            ...current,
            course: {
              ...current.course,
              lessons: current.course.lessons.map((lesson) =>
                lesson.id === selectedLesson.id ? { ...lesson, videoUrl: undefined } : lesson,
              ),
            },
          },
    );
    setError("");
  }
  const refundTimeLeft = courseAccess?.refundExpiresAt
    ? formatRemainingTime(new Date(courseAccess.refundExpiresAt).getTime() - now)
    : null;

  const currentCourseStatus = courseStatus?.routeId === courseId ? courseStatus : null;
  if (!currentCourseStatus && remoteCourse?.routeId !== courseId) {
    return <main className="detail-loading">Đang tải khóa học…</main>;
  }
  if (currentCourseStatus?.error || remoteCourse?.routeId !== courseId) {
    return (
      <main className="detail-loading" role="alert">
        <div>
          <p>{currentCourseStatus?.error || "Không tìm thấy khóa học."}</p>
          <Link href="/">Quay lại danh sách khóa học</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="detail-page">
      <div className="detail-breadcrumb"><Link href="/"><ArrowLeft size={16} /> Khám phá</Link><span>/</span><span>{course.category}</span></div>
      <section className="detail-hero">
        <div className="detail-hero-copy">
          <div className="detail-category">{course.category} <span>·</span> {course.level}</div>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
          <div className="detail-instructor"><span className="instructor-avatar">{course.instructor.split(" ").map((part) => part[0]).slice(-2).join("")}</span><span>Giảng viên <strong>{course.instructor}</strong></span><BadgeCheck size={17} /></div>
          <div className="detail-stats">{course.rating > 0 && <span><Star size={16} fill="currentColor" /> {course.rating} <small>({course.reviewCount ?? 0} đánh giá)</small></span>}<span><Clock3 size={16} /> {course.hours}</span><span><BookOpen size={16} /> {course.lessons.length} bài học</span></div>
        </div>
        <div className="detail-buy-panel">
          <div className="detail-cover" role="img" aria-label={course.title} style={{ backgroundImage: `url("${resolveApiAssetUrl(course.thumbnail)}")` }}><span>{course.category}</span></div>
          <div className="buy-panel-content">
            {hasAccess ? <div className="owned-label"><Check size={16} /> BẠN ĐÃ ĐĂNG KÝ KHÓA HỌC</div> : <div className="price-label">GIÁ TRỌN ĐỜI</div>}
            <div className="detail-price">{hasAccess ? "Đã mở khóa" : priceText(course.price)}</div>
            <button className={hasAccess ? "buy-button owned" : "buy-button"} onClick={() => hasAccess ? setNotice("Bạn đã có quyền truy cập khóa học này.") : setShowPurchase(true)}>
              {hasAccess ? "Tiếp tục học" : course.price > 0 ? "Mua khóa học" : "Đăng ký miễn phí"} <ArrowUpRight size={17} />
            </button>
            {refundAllowed && courseAccess?.paymentStatus === "REFUND_PENDING" && (
              <p className="refund-countdown" role="status">Yêu cầu hoàn tiền đang được xử lý. Vui lòng không gửi lại.</p>
            )}
            {refundAllowed && courseAccess?.paymentStatus === "PAID" && <button className="refund-button" disabled={processing} onClick={requestRefund}>Hoàn tiền khóa học</button>}
            {refundAllowed && courseAccess?.paymentStatus === "PAID" && refundTimeLeft && <p className="refund-countdown">Còn {refundTimeLeft} để yêu cầu hoàn tiền (2 giờ từ lúc đăng ký).</p>}
            <div className="buy-trust"><ShieldCheck size={16} /> Truy cập không giới hạn sau khi mua</div>
            <div className="buy-trust"><Users size={16} /> Học theo tiến độ của riêng bạn</div>
          </div>
        </div>
      </section>

      <section className="detail-content-grid">
        <div className="detail-main-column">
          <div className="content-heading"><div><span className="eyebrow">NỘI DUNG KHÓA HỌC</span><h2>Những gì bạn sẽ học</h2></div><span>{course.lessons.length} bài · {course.hours}</span></div>
          <div className="lesson-list">
            {course.lessons.length ? course.lessons.map((lesson, index) => {
              const isSelected = selectedLesson?.id === lesson.id;
              return (
                <button className={isSelected ? "lesson-row selected" : "lesson-row"} key={lesson.id} onClick={() => { setSelectedLessonId(lesson.id); setNotice(""); }}>
                  <span className="lesson-play">{hasAccess ? <Play size={14} /> : <LockKeyhole size={14} />}</span>
                  <span className="lesson-row-title"><small>{String(index + 1).padStart(2, "0")}</small>{lesson.title}</span>
                  <span className="lesson-duration">{lesson.duration}</span>
                </button>
              );
            }) : <p className="instructor-muted">Khóa học chưa có bài học.</p>}
          </div>
          {selectedLesson && <div className="lesson-player-section">
            <div className="content-heading"><div><span className="eyebrow">BÀI HỌC {String(course.lessons.indexOf(selectedLesson) + 1).padStart(2, "0")}</span><h2>{selectedLesson.title}</h2></div></div>
            {hasAccess ? <VideoPlayer src={selectedLesson.videoUrl} poster={course.thumbnail} onRetry={refreshPlayback} /> : (
              <div className="locked-player" style={{ backgroundImage: `linear-gradient(90deg, rgba(20,25,22,.92), rgba(20,25,22,.36)), url("${course.thumbnail}")` }}>
                <div className="lock-icon"><LockKeyhole size={21} /></div><div><strong>Nội dung này đang được khóa</strong><span>Mua khóa học để xem toàn bộ video và tài liệu.</span></div><button onClick={() => setShowPurchase(true)}>Mở khóa <ArrowUpRight size={16} /></button>
              </div>
            )}
            {notice && <p className="purchase-notice" role="status">{notice}</p>}
            {error && <p className="purchase-error" role="alert">{error}</p>}
          </div>}
          {materials.length > 0 && <section className="course-materials" aria-labelledby="materials-heading">
            <div className="content-heading"><div><span className="eyebrow">TÀI LIỆU HỌC TẬP</span><h2 id="materials-heading">Tài liệu đính kèm</h2></div></div>
            <ul>{materials.map((material) => (
              <li key={material.id}>
                <span>{material.originalName}<small>{(material.sizeBytes / 1024 / 1024).toFixed(1)} MB</small></span>
                <button type="button" onClick={() => void downloadMaterial(material)} aria-label={`Tải ${material.originalName}`}><Download size={16} /> Tải về</button>
              </li>
            ))}</ul>
          </section>}
        </div>
        <aside className="detail-aside">
          <div className="aside-note-number">01 / GIỚI THIỆU</div>
          <h3>Một kỹ năng tốt sẽ ở lại với bạn.</h3>
          <p>{course.description}</p>
          <div className="aside-divider" />
          <div className="included-item"><Check size={16} /> Toàn bộ video bài học</div>
          <div className="included-item"><Check size={16} /> Cập nhật nội dung mới</div>
          <div className="included-item"><Check size={16} /> Học trên mọi thiết bị</div>
          <div className="aside-note">Bài học được mở khóa sau khi hoàn tất mua khóa học.</div>
        </aside>
      </section>

      <section className="course-reviews" aria-labelledby="reviews-heading">
        <div className="content-heading">
          <div><span className="eyebrow">CẢM NHẬN HỌC VIÊN</span><h2 id="reviews-heading">Đánh giá khóa học</h2></div>
          <span>{course.rating > 0 ? `${course.rating}/5 · ${course.reviewCount ?? 0} đánh giá` : "Chưa có đánh giá"}</span>
        </div>
        {hasAccess ? (
          <form className="review-form" onSubmit={(event) => void submitReview(event)}>
            <label>Chọn số sao</label>
            <div className="review-stars" role="radiogroup" aria-label="Số sao đánh giá">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" role="radio" aria-checked={reviewRating === star} aria-label={`${star} sao`} onClick={() => setReviewRating(star)}>
                  <Star size={22} fill={star <= reviewRating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            <label htmlFor="course-review-comment">Bình luận của bạn</label>
            <textarea id="course-review-comment" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} minLength={2} maxLength={2000} required rows={4} placeholder="Chia sẻ trải nghiệm học tập của bạn…" />
            {reviewError && <p className="purchase-error" role="alert">{reviewError}</p>}
            {reviewNotice && <p className="purchase-notice" role="status">{reviewNotice}</p>}
            <button className="buy-button" type="submit" disabled={reviewProcessing}>{reviewProcessing ? "Đang gửi…" : ownReview ? "Cập nhật đánh giá" : "Gửi đánh giá"} <ArrowUpRight size={17} /></button>
          </form>
        ) : <p className="review-enrollment-note">Đăng ký khóa học để gửi đánh giá và bình luận.</p>}
        <div className="review-list">
          {reviews.length ? reviews.map((review) => (
            <article key={review.id} className="review-card">
              <div><strong>{review.user?.name ?? "Học viên"}</strong><span>{new Date(review.createdAt).toLocaleDateString("vi-VN")}</span></div>
              <p className="review-card-stars" aria-label={`${review.rating} trên 5 sao`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < review.rating ? "currentColor" : "none"} />)}</p>
              <p>{review.comment}</p>
            </article>
          )) : <p className="review-enrollment-note">Hãy là người đầu tiên đánh giá khóa học này.</p>}
        </div>
      </section>

      {showPurchase && <div className="modal-backdrop" role="presentation" onClick={() => setShowPurchase(false)}>
        <section className="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title" onClick={(event) => event.stopPropagation()}>
          <span className="eyebrow">XÁC NHẬN ĐĂNG KÝ</span><button className="modal-close" aria-label="Đóng" onClick={() => setShowPurchase(false)}>×</button>
          <h2 id="purchase-title">Sẵn sàng bắt đầu?</h2><p>{course.title}</p><div className="modal-price">{priceText(course.price)}</div>
          <div className="demo-payment-note">{course.price > 0 ? "Bạn sẽ được chuyển đến cổng VNPAY Sandbox để thanh toán. Nội dung chỉ mở khóa sau khi giao dịch được xác nhận." : "Khóa học miễn phí. Đăng ký để mở toàn bộ nội dung và bắt đầu học ngay."}</div>
          <button className="buy-button" disabled={processing} onClick={startCheckout}>{processing ? "Đang xử lý…" : course.price > 0 ? "Thanh toán qua VNPAY" : "Đăng ký khóa học"} <ArrowUpRight size={17} /></button>
        </section>
      </div>}
    </main>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatRemainingTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
