import Link from "next/link";
import { ArrowUpRight, Clock3, Star } from "lucide-react";
import type { Course } from "@/lib/courses";

export default function CourseCard({ course, index = 0 }: { course: Course; index?: number }) {
  return (
    <article className="course-card" style={{ animationDelay: `${index * 70}ms` }}>
      <Link className="course-image-link" href={`/courses/${course.slug}`} aria-label={`Xem ${course.title}`}>
        <div className="course-image" role="img" aria-label={`Ảnh minh họa ${course.category}`} style={{ backgroundImage: `url("${course.thumbnail}")` }}>
          <span className="course-category">{course.category}</span>
          {course.bestseller && <span className="bestseller">ĐƯỢC YÊU THÍCH</span>}
          <span className="course-arrow"><ArrowUpRight size={19} /></span>
        </div>
      </Link>
      <div className="course-card-body">
        <div className="course-meta"><span>{course.level}</span><span className="meta-dot" /><span><Clock3 size={13} /> {course.hours}</span></div>
        <Link className="course-title" href={`/courses/${course.slug}`}>{course.title}</Link>
        <p className="course-instructor">{course.instructor}</p>
        <div className="course-card-bottom">
          <span className="course-price">{new Intl.NumberFormat("vi-VN").format(course.price)}<small>đ</small></span>
          <span className="course-rating"><Star size={14} fill="currentColor" /> {course.rating} <small>({course.students})</small></span>
        </div>
      </div>
    </article>
  );
}