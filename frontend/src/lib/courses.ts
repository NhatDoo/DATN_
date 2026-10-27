export type Lesson = {
  id: string;
  title: string;
  duration: string;
  videoUrl?: string;
};

export type Course = {
  id: string;
  slug: string;
  title: string;
  category: string;
  instructor: string;
  rating: number;
  students: string;
  price: number;
  hours: string;
  level: string;
  description: string;
  thumbnail: string;
  accent: string;
  bestseller?: boolean;
  lessons: Lesson[];
};

export const categories = ["Tất cả", "Thiết kế", "Công nghệ", "Kinh doanh", "Nhiếp ảnh"];

export const courses: Course[] = [
  {
    id: "design-system",
    slug: "design-system-tu-a-den-z",
    title: "Thiết kế Design System từ A đến Z",
    category: "Thiết kế",
    instructor: "Minh Anh Nguyễn",
    rating: 4.9,
    students: "2.4k",
    price: 799000,
    hours: "8 giờ 20 phút",
    level: "Cơ bản đến nâng cao",
    description: "Xây dựng hệ thống thiết kế nhất quán, dễ mở rộng và thật sự hữu ích cho cả đội ngũ sản phẩm.",
    thumbnail: "https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=960&q=85",
    accent: "#d8ef73",
    bestseller: true,
    lessons: [
      { id: "ds-1", title: "Tư duy hệ thống trong thiết kế", duration: "12:08" },
      { id: "ds-2", title: "Từ token màu đến ngôn ngữ thị giác", duration: "18:42" },
      { id: "ds-3", title: "Component và biến thể có chủ đích", duration: "21:16" },
      { id: "ds-4", title: "Đưa hệ thống vào quy trình sản phẩm", duration: "16:30" },
    ],
  },
  {
    id: "python-data",
    slug: "python-phan-tich-du-lieu-thuc-te",
    title: "Python cho phân tích dữ liệu thực tế",
    category: "Công nghệ",
    instructor: "Quang Lê",
    rating: 4.8,
    students: "1.8k",
    price: 649000,
    hours: "11 giờ 05 phút",
    level: "Cơ bản",
    description: "Từ những dòng code Python đầu tiên đến một quy trình phân tích dữ liệu có thể áp dụng ngay trong công việc.",
    thumbnail: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=960&q=85",
    accent: "#a9d8d2",
    lessons: [
      { id: "py-1", title: "Làm quen với notebook và dữ liệu", duration: "14:22" },
      { id: "py-2", title: "Làm sạch dữ liệu với Pandas", duration: "19:10" },
      { id: "py-3", title: "Khám phá và kể chuyện bằng số liệu", duration: "23:44" },
    ],
  },
  {
    id: "brand-story",
    slug: "ke-chuyen-thuong-hieu-bang-noi-dung",
    title: "Kể chuyện thương hiệu bằng nội dung",
    category: "Kinh doanh",
    instructor: "Thu Hà Trần",
    rating: 4.9,
    students: "980",
    price: 529000,
    hours: "6 giờ 40 phút",
    level: "Mọi cấp độ",
    description: "Tìm tiếng nói riêng cho thương hiệu và biến ý tưởng thành nội dung khiến người đọc muốn dừng lại.",
    thumbnail: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=960&q=85",
    accent: "#f2b29f",
    bestseller: true,
    lessons: [
      { id: "br-1", title: "Thương hiệu có điều gì để kể?", duration: "11:45" },
      { id: "br-2", title: "Tìm chất giọng và góc nhìn", duration: "16:38" },
      { id: "br-3", title: "Viết nội dung có nhịp điệu", duration: "20:05" },
    ],
  },
  {
    id: "film-photo",
    slug: "nhiep-anh-phim-cho-nguoi-moi",
    title: "Nhiếp ảnh phim cho người mới",
    category: "Nhiếp ảnh",
    instructor: "Bảo Trần",
    rating: 4.7,
    students: "740",
    price: 459000,
    hours: "5 giờ 15 phút",
    level: "Cơ bản",
    description: "Làm chủ ánh sáng, cuộn phim và khoảnh khắc để mỗi khung hình đều mang một câu chuyện riêng.",
    thumbnail: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=960&q=85",
    accent: "#efd68d",
    lessons: [
      { id: "ph-1", title: "Chiếc máy ảnh phim đầu tiên", duration: "10:18" },
      { id: "ph-2", title: "Đọc sáng và chọn tốc độ", duration: "17:52" },
      { id: "ph-3", title: "Một cuộn phim, một câu chuyện", duration: "14:33" },
    ],
  },
  {
    id: "figma-prototype",
    slug: "figma-tu-wireframe-den-prototype",
    title: "Figma: từ wireframe đến prototype",
    category: "Thiết kế",
    instructor: "Hoàng Phạm",
    rating: 4.8,
    students: "1.2k",
    price: 579000,
    hours: "7 giờ 30 phút",
    level: "Cơ bản",
    description: "Tạo prototype đủ thuyết phục để kiểm chứng ý tưởng trước khi một dòng code được viết ra.",
    thumbnail: "https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?auto=format&fit=crop&w=960&q=85",
    accent: "#c2bee9",
    lessons: [
      { id: "fg-1", title: "Dựng khung bằng Auto Layout", duration: "15:12" },
      { id: "fg-2", title: "Component, variant và trạng thái", duration: "22:06" },
      { id: "fg-3", title: "Prototype tương tác có ý nghĩa", duration: "18:31" },
    ],
  },
  {
    id: "product-growth",
    slug: "product-growth-cho-startup",
    title: "Product Growth cho startup",
    category: "Kinh doanh",
    instructor: "Linh Đỗ",
    rating: 4.6,
    students: "610",
    price: 699000,
    hours: "9 giờ 10 phút",
    level: "Trung cấp",
    description: "Tìm điểm tăng trưởng có thể đo lường, thử nghiệm nhanh và xây dựng động lực bền vững cho sản phẩm.",
    thumbnail: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=960&q=85",
    accent: "#efb1c9",
    lessons: [
      { id: "pg-1", title: "Vòng lặp tăng trưởng sản phẩm", duration: "13:28" },
      { id: "pg-2", title: "Đo hành vi thay vì chỉ nhìn lượt xem", duration: "18:19" },
      { id: "pg-3", title: "Thiết kế thử nghiệm nhỏ", duration: "16:02" },
    ],
  },
];