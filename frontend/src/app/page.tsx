"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpRight, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import CourseCard from "@/components/CourseCard";
import { courses, categories, type Course } from "@/lib/courses";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [sortBy, setSortBy] = useState("featured");
  const [apiCourses, setApiCourses] = useState<Course[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("hocmo_access_token");
    fetch(`${apiUrl}/courses?limit=100`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((result) => {
        if (!cancelled && Array.isArray(result.items) && result.items.length) {
          setApiCourses(
            result.items.map((item: Record<string, unknown>) => {
              const course = item as Omit<Partial<Course>, "instructor"> & {
                instructor?: string | { name?: string };
              };
              return {
                ...courses[0],
                ...course,
                id: course.id ?? course.slug ?? courses[0].id,
                slug: course.id ?? course.slug ?? courses[0].slug,
                price: Number(course.price ?? 0),
                thumbnail: course.thumbnail || courses[0].thumbnail,
                instructor:
                  typeof course.instructor === "object"
                    ? course.instructor.name ?? courses[0].instructor
                    : course.instructor ?? courses[0].instructor,
              };
            }),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleCourses = useMemo(() => {
    const source = apiCourses ?? courses;
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    const filtered = source.filter((course) => {
      const matchesCategory = activeCategory === "Tất cả" || course.category === activeCategory;
      const searchText = `${course.title} ${course.category} ${course.instructor} ${course.description}`;
      return matchesCategory && searchText.toLocaleLowerCase("vi").includes(normalizedQuery);
    });
    if (sortBy === "price-low") return [...filtered].sort((a, b) => a.price - b.price);
    if (sortBy === "rating") return [...filtered].sort((a, b) => b.rating - a.rating);
    return filtered;
  }, [activeCategory, apiCourses, query, sortBy]);

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
            {categories.map((category) => (
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

        {visibleCourses.length ? (
          <div className="course-grid">
            {visibleCourses.map((course, index) => <CourseCard course={course} index={index} key={course.id} />)}
          </div>
        ) : (
          <div className="empty-results"><Search size={24} /><h3>Chưa tìm thấy khóa học phù hợp</h3><p>Thử một từ khóa khác hoặc chọn danh mục khác nhé.</p></div>
        )}
        <div className="catalog-footer"><span>Đang xem {visibleCourses.length} khóa học</span><span className="catalog-footer-mark">HỌC CÓ CHỦ ĐÍCH <ArrowUpRight size={15} /></span></div>
      </section>

      <section className="learning-note" id="about">
        <div className="note-number">02 / BẮT ĐẦU</div>
        <h2>Kỹ năng tốt không đến từ một đêm. <em>Nhưng có thể bắt đầu từ hôm nay.</em></h2>
        <a href="#catalog">Tìm bài học đầu tiên <ArrowUpRight size={18} /></a>
      </section>
    </main>
  );
}
