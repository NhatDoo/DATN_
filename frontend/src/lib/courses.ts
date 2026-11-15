export type Lesson = {
  id: string;
  title: string;
  duration: string;
  videoUrl?: string;
  hasVideo?: boolean;
};

export function resolveApiAssetUrl(value?: string | null) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) {
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL;
    if (apiOrigin?.startsWith("http")) return new URL(value, apiOrigin).toString();
    return value;
  }
  return value;
}

export type Course = {
  id: string;
  slug: string;
  title: string;
  category: string;
  tags?: string[];
  instructor: string;
  rating: number;
  reviewCount?: number;
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

export function courseFromApi(value: Record<string, unknown>): Course {
  const instructor = value.instructor;
  const instructorName =
    typeof instructor === "string"
      ? instructor
      : instructor && typeof instructor === "object" && "name" in instructor
        ? String(instructor.name ?? "")
        : "";
  const count = value._count;
  const enrollmentCount =
    value.enrollmentCount ??
    (count && typeof count === "object" && "enrollments" in count
      ? count.enrollments
      : 0);

  return {
    id: String(value.id ?? value.slug ?? ""),
    slug: String(value.slug ?? value.id ?? ""),
    title: String(value.title ?? ""),
    category: String(value.category ?? "Chưa phân loại"),
    tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
    instructor: instructorName || "Giảng viên",
    rating: Number(value.rating ?? 0),
    reviewCount: Number(value.reviewCount ?? 0),
    students: String(enrollmentCount ?? ""),
    price: Number(value.price ?? 0),
    hours: "—",
    level: String(value.level ?? "Mọi cấp độ"),
    description: String(value.description ?? ""),
    thumbnail: typeof value.thumbnail === "string" ? value.thumbnail : "",
    accent: "",
    lessons: [],
  };
}