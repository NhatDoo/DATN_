"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDownWideNarrow, ArrowLeft, ArrowRight, ArrowUpRight, Search, SlidersHorizontal, Sparkles, WandSparkles } from "lucide-react";
import CourseCard from "@/components/CourseCard";
import { courseFromApi, type Course } from "@/lib/courses";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const coursesPerPage = 12;
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

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [sortBy, setSortBy] = useState("featured");
  const [page, setPage] = useState(1);
  const [apiCourses, setApiCourses] = useState<Course[]>([]);
  const [apiCategories, setApiCategories] = useState<string[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState("");
  const [recommendations, setRecommendations] = useState<Course[]>([]);
  const token = useSyncExternalStore(subscribeAuth, getAuthToken, getServerToken);

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/courses/filters`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải danh mục khóa học.");
        return response.json();
      })
      .then((filters) => {
        if (active && Array.isArray(filters.categories)) setApiCategories(filters.categories);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("hocmo_access_token");
    fetch(`${apiUrl}/courses?limit=100`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((result) => {
        if (cancelled) return;
        if (!Array.isArray(result.items)) throw new Error("Dữ liệu khóa học từ máy chủ không hợp lệ.");
        setApiCourses(result.items.map((item: Record<string, unknown>) => courseFromApi(item)));
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setCoursesError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
        }
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    fetch(`${apiUrl}/courses/recommendations/me?limit=6`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải gợi ý khóa học.");
        return response.json();
      })
      .then((result) => {
        if (cancelled) return;
        setRecommendations((result.items ?? []).map((item: Record<string, unknown>) => courseFromApi(item)));
      })
      .catch(() => {
        if (!cancelled) setRecommendations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const visibleCourses = useMemo(() => {
    const source = apiCourses;
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    const filtered = source.filter((course) => {
      const matchesCategory = activeCategory === "Tất cả" || course.category === activeCategory;
      const searchText = `${course.title} ${course.category} ${course.tags?.join(" ") ?? ""} ${course.instructor} ${course.description}`;
      return matchesCategory && searchText.toLocaleLowerCase("vi").includes(normalizedQuery);
    });
    if (sortBy === "price-low") return [...filtered].sort((a, b) => a.price - b.price);
    if (sortBy === "rating") return [...filtered].sort((a, b) => b.rating - a.rating);
    return filtered;
  }, [activeCategory, apiCourses, query, sortBy]);
  const pageCount = Math.max(1, Math.ceil(visibleCourses.length / coursesPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageCourses = visibleCourses.slice(
    (currentPage - 1) * coursesPerPage,
    currentPage * coursesPerPage,
  );

  function searchCourses(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main>
      <section className="hero-band">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={15} /> KIẾN THỨC ĐỂ ĐI XA HƠN</div>
            <h1>Học điều mới.<br /><span>Mở lối riêng.</span></h1>
            <p className="hero-description">Những kỹ năng thực chiến, được chia nhỏ để bạn có thể bắt đầu ngay hôm nay.</p>
            <form className="hero-search" onSubmit={searchCourses}>
              <Search size={20} aria-hidden="true" />
              <input
                aria-label="Tìm khóa học"
                placeholder="Bạn muốn học điều gì?"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit">Tìm khóa học</button>
            </form>
            <div className="popular-searches">
              <span>Được tìm nhiều:</span>
              {["Thiết kế UI", "Python", "Marketing"].map((item) => (
                <button key={item} onClick={() => setQuery(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div className="hero-art" aria-label="Góc học tập sáng tạo">
            <div className="hero-photo" role="img" aria-label="Học viên đang làm việc với laptop" />
            <div className="hero-sticker"><span>01</span><strong>Mỗi ngày<br />một bước mới</strong><ArrowUpRight size={20} /></div>
            <div className="hero-caption"><span className="caption-dot" /> HỌC THEO NHỊP CỦA BẠN</div>
          </div>
        </div>
        <div className="hero-bottomline"><span>Học từ người làm thật</span><span className="line" /><span>Điều bạn muốn, ở ngay đây</span></div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading">
          <div>
            <p className="eyebrow section-eyebrow">THƯ VIỆN KỸ NĂNG <span>/{visibleCourses.length.toString().padStart(2, "0")}</span></p>
            <h2>Chọn thứ bạn muốn <em>giỏi hơn.</em></h2>
          </div>
          <a className="text-link" href="#catalog">Xem tất cả <ArrowUpRight size={17} /></a>
        </div>

        <div className="catalog-toolbar">
          <div className="category-tabs" role="tablist" aria-label="Lọc theo danh mục">
            {["Tất cả", ...apiCategories].map((category) => (
              <button
                className={activeCategory === category ? "category-tab active" : "category-tab"}
                key={category}
                onClick={() => setActiveCategory(category)}
                role="tab"
                aria-selected={activeCategory === category}
              >
                {category}
              </button>
            ))}
          </div>
          <label className="sort-control">
            <SlidersHorizontal size={16} />
            <span>Sắp xếp</span>
            <select aria-label="Sắp xếp khóa học" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="featured">Nổi bật</option>
              <option value="rating">Đánh giá cao</option>
              <option value="price-low">Giá thấp trước</option>
            </select>
            <ArrowDownWideNarrow size={15} />
          </label>
        </div>

        {coursesLoading ? (
          <div className="empty-results" role="status"><h3>Đang tải khóa học…</h3></div>
        ) : coursesError ? (
          <div className="empty-results" role="alert"><h3>Không thể tải khóa học</h3><p>{coursesError}</p></div>
        ) : visibleCourses.length ? (
          <div className="course-grid">
            {pageCourses.map((course, index) => <CourseCard course={course} index={index} key={course.id} />)}
          </div>
        ) : (
          <div className="empty-results"><Search size={24} /><h3>{apiCourses.length ? "Chưa tìm thấy khóa học phù hợp" : "Chưa có khóa học nào được xuất bản"}</h3><p>{apiCourses.length ? "Thử một từ khóa khác hoặc chọn danh mục khác nhé." : "Các khóa học đã xuất bản sẽ hiển thị tại đây."}</p></div>
        )}
        {!coursesLoading && !coursesError && pageCount > 1 && (
          <nav className="course-pagination" aria-label="Phân trang khóa học">
            <button
              type="button"
              className="pagination-arrow"
              aria-label="Trang trước"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ArrowLeft size={16} /> Trước
            </button>
            <div className="pagination-pages">
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  type="button"
                  key={pageNumber}
                  className={pageNumber === currentPage ? "pagination-page active" : "pagination-page"}
                  aria-label={`Trang ${pageNumber}`}
                  aria-current={pageNumber === currentPage ? "page" : undefined}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="pagination-arrow"
              aria-label="Trang sau"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Sau <ArrowRight size={16} />
            </button>
          </nav>
        )}
        <div className="catalog-footer"><span>Trang {currentPage}/{pageCount} · Hiển thị {pageCourses.length}/{visibleCourses.length} khóa học</span><span className="catalog-footer-mark">HỌC CÓ CHỦ ĐÍCH <ArrowUpRight size={15} /></span></div>
      </section>

      {token && recommendations.length > 0 && (
        <section className="recommendations-section" aria-labelledby="recommendations-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow section-eyebrow"><WandSparkles size={14} /> DÀNH RIÊNG CHO BẠN</p>
              <h2 id="recommendations-heading">Có thể bạn sẽ <em>thích.</em></h2>
            </div>
          </div>
          <div className="course-grid">
            {recommendations.map((course, index) => (
              <CourseCard
                course={course}
                index={index}
                key={course.id}
                onSelect={() => {
                  const token = localStorage.getItem("hocmo_access_token");
                  if (token) {
                    void fetch(`${apiUrl}/courses/${course.id}/recommendation-click`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                      keepalive: true,
                    });
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="learning-note" id="about">
        <div className="note-number">02 / BẮT ĐẦU</div>
        <h2>Kỹ năng tốt không đến từ một đêm. <em>Nhưng có thể bắt đầu từ hôm nay.</em></h2>
        <a href="#catalog">Tìm bài học đầu tiên <ArrowUpRight size={18} /></a>
      </section>
    </main>
  );
}
