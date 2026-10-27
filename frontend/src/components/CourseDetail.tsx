"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BadgeCheck, BookOpen, Check, ChevronDown, Clock3, LockKeyhole, Play, ShieldCheck, Star, Users } from "lucide-react";
import VideoPlayer from "@/components/VideoPlayer";
import { courses, type Course, type Lesson } from "@/lib/courses";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const priceText = (price: number) => new Intl.NumberFormat("vi-VN").format(price) + "đ";
const subscribeToClock = (callback: () => void) => {
  const timer = window.setInterval(callback, 15_000);
  return () => window.clearInterval(timer);
};

export default function CourseDetail() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();
  const fallback = useMemo(() => courses.find((course) => course.slug === courseId || course.id === courseId) ?? courses[0], [courseId]);
  const [remoteCourse, setRemoteCourse] = useState<{ routeId: string; course: Course } | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const course = remoteCourse?.routeId === courseId ? remoteCourse.course : fallback;
  const selectedLesson = course.lessons.find((lesson) => lesson.id === selectedLessonId) ?? course.lessons[0];
  const [access, setAccess] = useState<{
    routeId: string;
    hasAccess: boolean;
    refundExpiresAt: string | null;
    transactionRef: string | null;
  } | null>(null);
  const courseAccess = access?.routeId === courseId ? access : null;
  const hasAccess = courseAccess?.hasAccess ?? false;
  const now = useSyncExternalStore(subscribeToClock, Date.now, () => 0);
  const [showPurchase, setShowPurchase] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("hocmo_access_token");
    fetch(`${apiUrl}/courses/${courseId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        const lessons: Lesson[] = (data.sections ?? []).flatMap((section: { lessons?: Array<Record<string, unknown>> }) =>
          (section.lessons ?? []).map((lesson) => ({
            id: String(lesson.id),
            title: String(lesson.title),
            duration: formatDuration(Number(lesson.durationSec ?? 0)),
            videoUrl: typeof lesson.videoUrl === "string" ? lesson.videoUrl : undefined,
          })),
        );
        const remoteCourse: Course = {
          ...fallback,
          id: String(data.id),
          slug: String(data.id),
          title: data.title ?? fallback.title,
          description: data.description ?? fallback.description,
          price: Number(data.price ?? fallback.price),
          thumbnail: data.thumbnail ?? fallback.thumbnail,
          instructor: data.instructor?.name ?? fallback.instructor,
          lessons: lessons.length ? lessons : fallback.lessons,
        };
        setRemoteCourse({ routeId: courseId, course: remoteCourse });
        setSelectedLessonId(remoteCourse.lessons[0]?.id ?? null);
        setAccess({
          routeId: courseId,
          hasAccess: Boolean(data.hasAccess),
          refundExpiresAt: data.refundExpiresAt ?? null,
          transactionRef: data.transactionRef ?? null,
        });
      })
      .catch(() => undefined);
  }, [courseId, fallback]);

  async function startCheckout() {
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setProcessing(true);
    setError("");
    try {
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
      if (!response.ok) throw new Error(result.message || "Không thể xử lý yêu cầu hoàn tiền.");
      setAccess({
        routeId: courseId,
        hasAccess: false,
        refundExpiresAt: null,
        transactionRef: courseAccess.transactionRef,
      });
      setNotice("Đã gửi yêu cầu hoàn tiền thành công.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
    } finally {
      setProcessing(false);
    }
  }

  const refundAllowed = Boolean(
    courseAccess?.refundExpiresAt && now <= new Date(courseAccess.refundExpiresAt).getTime(),
  );

  return (
    <main className="detail-page">
      <div className="detail-breadcrumb"><Link href="/"><ArrowLeft size={16} /> Khám phá</Link><span>/</span><span>{course.category}</span></div>
      <section className="detail-hero">
        <div className="detail-hero-copy">
          <div className="detail-category">{course.category} <span>·</span> {course.level}</div>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
          <div className="detail-instructor"><span className="instructor-avatar">{course.instructor.split(" ").map((part) => part[0]).slice(-2).join("")}</span><span>Giảng viên <strong>{course.instructor}</strong></span><BadgeCheck size={17} /></div>
          <div className="detail-stats"><span><Star size={16} fill="currentColor" /> {course.rating} <small>({course.students} học viên)</small></span><span><Clock3 size={16} /> {course.hours}</span><span><BookOpen size={16} /> {course.lessons.length} bài học</span></div>
        </div>
        <div className="detail-buy-panel">
          <div className="detail-cover" role="img" aria-label={course.title} style={{ backgroundImage: `url("${course.thumbnail}")` }}><span>{course.category}</span></div>
          <div className="buy-panel-content">
            {hasAccess ? <div className="owned-label"><Check size={16} /> BẠN ĐÃ ĐĂNG KÝ KHÓA HỌC</div> : <div className="price-label">GIÁ TRỌN ĐỜI</div>}
            <div className="detail-price">{hasAccess ? "Đã mở khóa" : priceText(course.price)}</div>
            <button className={hasAccess ? "buy-button owned" : "buy-button"} onClick={() => hasAccess ? setNotice("Bạn đã có quyền truy cập khóa học này.") : setShowPurchase(true)}>
              {hasAccess ? "Tiếp tục học" : "Mua khóa học"} <ArrowUpRight size={17} />
            </button>
            {refundAllowed && <button className="refund-button" disabled={processing} onClick={requestRefund}>Hoàn tiền khóa học</button>}
            <div className="buy-trust"><ShieldCheck size={16} /> Truy cập không giới hạn sau khi mua</div>
            <div className="buy-trust"><Users size={16} /> Học theo tiến độ của riêng bạn</div>
          </div>
        </div>
      </section>

      <section className="detail-content-grid">
        <div className="detail-main-column">
          <div className="content-heading"><div><span className="eyebrow">NỘI DUNG KHÓA HỌC</span><h2>Những gì bạn sẽ học</h2></div><span>{course.lessons.length} bài · {course.hours}</span></div>
          <div className="lesson-list">
            <div className="lesson-list-head"><strong>Chương 01</strong><span>Nền tảng và tư duy</span><ChevronDown size={17} /></div>
            {course.lessons.map((lesson, index) => {
              const isSelected = selectedLesson.id === lesson.id;
              return (
                <button className={isSelected ? "lesson-row selected" : "lesson-row"} key={lesson.id} onClick={() => { setSelectedLessonId(lesson.id); setNotice(""); }}>
                  <span className="lesson-play">{hasAccess ? <Play size={14} /> : <LockKeyhole size={14} />}</span>
                  <span className="lesson-row-title"><small>{String(index + 1).padStart(2, "0")}</small>{lesson.title}</span>
                  <span className="lesson-duration">{lesson.duration}</span>
                </button>
              );
            })}
          </div>
          <div className="lesson-player-section">
            <div className="content-heading"><div><span className="eyebrow">BÀI HỌC {String(course.lessons.indexOf(selectedLesson) + 1).padStart(2, "0")}</span><h2>{selectedLesson.title}</h2></div></div>
            {hasAccess ? <VideoPlayer src={selectedLesson.videoUrl} poster={course.thumbnail} /> : (
              <div className="locked-player" style={{ backgroundImage: `linear-gradient(90deg, rgba(20,25,22,.92), rgba(20,25,22,.36)), url("${course.thumbnail}")` }}>
                <div className="lock-icon"><LockKeyhole size={21} /></div><div><strong>Nội dung này đang được khóa</strong><span>Mua khóa học để xem toàn bộ video và tài liệu.</span></div><button onClick={() => setShowPurchase(true)}>Mở khóa <ArrowUpRight size={16} /></button>
              </div>
            )}
            {notice && <p className="purchase-notice" role="status">{notice}</p>}
            {error && <p className="purchase-error" role="alert">{error}</p>}
          </div>
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

      {showPurchase && <div className="modal-backdrop" role="presentation" onClick={() => setShowPurchase(false)}>
        <section className="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title" onClick={(event) => event.stopPropagation()}>
          <span className="eyebrow">XÁC NHẬN ĐĂNG KÝ</span><button className="modal-close" aria-label="Đóng" onClick={() => setShowPurchase(false)}>×</button>
          <h2 id="purchase-title">Sẵn sàng bắt đầu?</h2><p>{course.title}</p><div className="modal-price">{priceText(course.price)}</div>
          <div className="demo-payment-note">Bạn sẽ được chuyển đến cổng VNPAY Sandbox để thanh toán. Nội dung chỉ mở khóa sau khi giao dịch được xác nhận.</div>
          <button className="buy-button" disabled={processing} onClick={startCheckout}>{processing ? "Đang kết nối VNPAY…" : "Thanh toán qua VNPAY"} <ArrowUpRight size={17} /></button>
        </section>
      </div>}
    </main>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}