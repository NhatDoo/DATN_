import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Heart, Users } from "lucide-react";

export default function AboutPage() {
  return (
    <main className="about-page">
      <Link className="detail-breadcrumb" href="/"><ArrowLeft size={15} /> Về trang chủ</Link>
      <section className="about-hero">
        <p className="eyebrow"><BookOpenCheck size={15} /> VỀ HỌC MỞ</p>
        <h1>Học tập nên mở ra nhiều cơ hội hơn.</h1>
        <p>Học Mở kết nối người học với những khóa học thực tiễn, giúp kiến thức chất lượng trở nên dễ tiếp cận và hữu ích trong công việc.</p>
        <Link className="about-link" href="/#catalog">Khám phá khóa học <span>↗</span></Link>
      </section>
      <section className="about-values">
        <article><BookOpenCheck /><h2>Học qua thực hành</h2><p>Nội dung được chia thành bài học rõ ràng, có tài liệu và bài kiểm tra để bạn tiến bộ từng bước.</p></article>
        <article><Users /><h2>Cùng nhau phát triển</h2><p>Giảng viên chia sẻ kinh nghiệm, học viên để lại đánh giá và góp phần xây dựng cộng đồng học tập.</p></article>
        <article><Heart /><h2>Học theo mục tiêu</h2><p>Khám phá các chủ đề phù hợp và tiếp tục hành trình học tập theo nhịp độ của riêng bạn.</p></article>
      </section>
    </main>
  );
}
