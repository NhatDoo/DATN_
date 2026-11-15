"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ClipboardList,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const videoPartBatchSize = 4;
const videoPartConcurrency = 4;

type StoredUser = { name?: string; role?: string };
type MediaAsset = { url: string };
type PresignedPart = { partNumber: number; url: string };
type UploadedPart = { partNumber: number; etag: string };
type VideoUploadStatus = {
  status: "UPLOADING" | "PROCESSING" | "COMPLETED" | "FAILED";
  uploadComplete: boolean;
  error?: string;
  assets?: MediaAsset[];
};
type InstructorSection = { id: string; title: string; lessons: { id: string; title: string }[] };
type InstructorQuiz = { id: string; title: string; questions: { id: string }[] };
type InstructorMaterial = { id: string; originalName: string; sizeBytes: number };
type InstructorCourse = {
  id: string;
  title: string;
  description: string;
  category?: string;
  level?: string;
  tags?: string[];
  price: string | number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  thumbnail?: string | null;
  deletedAt?: string | null;
  sections?: InstructorSection[];
  quizzes?: InstructorQuiz[];
  materials?: InstructorMaterial[];
  _count?: { sections: number; lessons: number };
};
type QuizQuestionDraft = { prompt: string; options: string[]; correctOption: number };
type ManagementPanel = { courseId: string; action: "edit" | "lesson" | "quiz" | "materials" } | null;
const subscribeAuth = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("hocmo-auth-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hocmo-auth-changed", callback);
  };
};
const getUserSnapshot = () => localStorage.getItem("hocmo_user");
const getServerUserSnapshot = () => null;

async function readResponse(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Không thể hoàn tất thao tác.");
  return result;
}

export default function InstructorDashboard() {
  const storedUser = useSyncExternalStore(subscribeAuth, getUserSnapshot, getServerUserSnapshot);
  let user: StoredUser | null = null;
  try {
    user = storedUser ? JSON.parse(storedUser) as StoredUser : null;
  } catch {
    user = null;
  }
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [lessonTitle, setLessonTitle] = useState("");
  const [category, setCategory] = useState("Công nghệ");
  const [level, setLevel] = useState("Mọi cấp độ");
  const [tags, setTags] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [courses, setCourses] = useState<InstructorCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [management, setManagement] = useState<ManagementPanel>(null);
  const [editValues, setEditValues] = useState({ title: "", description: "", category: "", level: "", tags: "", price: "0" });
  const [editThumbnail, setEditThumbnail] = useState<File | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonDescription, setNewLessonDescription] = useState("");
  const [newLessonVideo, setNewLessonVideo] = useState<File | null>(null);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDescription, setQuizDescription] = useState("");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionDraft[]>([
    { prompt: "", options: ["", "", "", ""], correctOption: 0 },
  ]);

  const loadCourses = useCallback(async () => {
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setCoursesLoading(false);
      return;
    }
    try {
      const response = await fetch(`${apiUrl}/courses/mine`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error();
      setCourses(await response.json() as InstructorCourse[]);
    } catch {
      setCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCourses(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCourses]);

  function uploadFile(token: string, file: File, courseId: string | undefined, stage: string) {
    const formData = new FormData();
    formData.append("files", file);
    const query = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
    setUploadStage(stage);
    setUploadProgress(0);
    return new Promise<string | undefined>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `${apiUrl}/media/upload${query}`);
      request.setRequestHeader("Authorization", `Bearer ${token}`);
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
      });
      request.addEventListener("load", () => {
        let result: MediaAsset[] | { message?: string } = [];
        try {
          result = JSON.parse(request.responseText) as MediaAsset[] | { message?: string };
        } catch {
          reject(new Error("Máy chủ trả về dữ liệu không hợp lệ."));
          return;
        }
        if (request.status < 200 || request.status >= 300) {
          reject(
            new Error(
              request.status === 413
                ? "Máy chủ hoặc proxy từ chối request. Hãy thử tải lại; video được upload trực tiếp theo từng phần."
                : Array.isArray(result)
                  ? "Không thể tải file lên."
                  : result.message || "Không thể tải file lên.",
            ),
          );
          return;
        }
        setUploadProgress(100);
        resolve(Array.isArray(result) ? result[0]?.url : undefined);
      });
      request.addEventListener("error", () => reject(new Error("Kết nối bị gián đoạn trong lúc tải file.")));
      request.addEventListener("abort", () => reject(new Error("Upload đã bị hủy.")));
      request.send(formData);
    });
  }

  async function uploadVideoFile(token: string, file: File, courseId: string, stage: string) {
    setUploadStage(stage);
    setUploadProgress(0);
    let sessionId: string | undefined;
    let completionStarted = false;
    try {
      const session = await readResponse(await fetch(`${apiUrl}/media/video-uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, courseId }),
      })) as { id: string; partSizeBytes: number };
      sessionId = session.id;
      const partCount = Math.ceil(file.size / session.partSizeBytes);
      const uploadedBytes = new Array<number>(partCount).fill(0);
      let totalUploadedBytes = 0;
      const updateProgress = (partIndex: number, partBytes: number) => {
        totalUploadedBytes += partBytes - uploadedBytes[partIndex];
        uploadedBytes[partIndex] = partBytes;
        setUploadProgress(Math.floor((totalUploadedBytes / file.size) * 100));
      };
      const uploadedParts: UploadedPart[] = [];

      for (let firstPart = 1; firstPart <= partCount; firstPart += videoPartBatchSize) {
        const partNumbers = Array.from(
          { length: Math.min(videoPartBatchSize, partCount - firstPart + 1) },
          (_, index) => firstPart + index,
        );
        const presignedParts = await readResponse(await fetch(
          `${apiUrl}/media/video-uploads/${session.id}/parts`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ partNumbers }),
          },
        )) as PresignedPart[];

        for (let offset = 0; offset < presignedParts.length; offset += videoPartConcurrency) {
          const batch = presignedParts.slice(offset, offset + videoPartConcurrency);
          const results = await Promise.all(batch.map(({ partNumber, url }) => {
            const start = (partNumber - 1) * session.partSizeBytes;
            const end = Math.min(start + session.partSizeBytes, file.size);
            return new Promise<UploadedPart>((resolve, reject) => {
              const request = new XMLHttpRequest();
              request.open("PUT", url);
              request.upload.addEventListener("progress", (event) => {
                if (!event.lengthComputable) return;
                updateProgress(partNumber - 1, Math.min(event.loaded, end - start));
              });
              request.addEventListener("load", () => {
                if (request.status < 200 || request.status >= 300) {
                  reject(new Error(`Storage từ chối phần video ${partNumber} (HTTP ${request.status}).`));
                  return;
                }
                const etag = request.getResponseHeader("ETag");
                if (!etag) {
                  reject(new Error("Không đọc được ETag từ storage. Kiểm tra cấu hình CORS để expose header ETag."));
                  return;
                }
                updateProgress(partNumber - 1, end - start);
                resolve({ partNumber, etag });
              });
              request.addEventListener("error", () => reject(new Error(`Mất kết nối khi tải phần video ${partNumber}.`)));
              request.addEventListener("abort", () => reject(new Error(`Upload phần video ${partNumber} đã bị hủy.`)));
              request.send(file.slice(start, end));
            });
          }));
          uploadedParts.push(...results);
        }
      }

      uploadedParts.sort((left, right) => left.partNumber - right.partNumber);
      completionStarted = true;
      try {
      await readResponse(await fetch(
        `${apiUrl}/media/video-uploads/${session.id}/complete`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ parts: uploadedParts }),
        },
      ));
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
      const retryCompletion = async () => {
        const response = await fetch(`${apiUrl}/media/video-uploads/${session.id}/complete`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ parts: uploadedParts }),
        });
        await readResponse(response);
      };
      setUploadStage("Đang chuyển video sang HLS và lưu vào storage");
      setUploadProgress(99);
      let consecutiveStatusErrors = 0;
      let processingRetries = 0;
      for (let attempt = 0; attempt < 3600; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        let status: VideoUploadStatus;
        try {
          status = await readResponse(await fetch(
            `${apiUrl}/media/video-uploads/${session.id}/status`,
            { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
          )) as VideoUploadStatus;
        } catch (error) {
          consecutiveStatusErrors++;
          if (consecutiveStatusErrors >= 5) throw error;
          continue;
        }
        consecutiveStatusErrors = 0;
        if (status.status === "FAILED") {
          if (processingRetries === 0) {
            processingRetries++;
            await retryCompletion();
            continue;
          }
          throw new Error(status.error || "Không thể chuyển video sang HLS.");
        }
        if (status.status === "UPLOADING" && attempt % 3 === 0) {
          try {
            await retryCompletion();
          } catch (error) {
            if (!(error instanceof TypeError)) throw error;
          }
        }
        if (status.status === "COMPLETED") {
          const videoAsset = status.assets?.find((asset) => asset.url.startsWith("asset://"));
          if (!videoAsset) throw new Error("Video đã xử lý nhưng không tìm thấy playlist HLS.");
          setUploadProgress(100);
          return videoAsset.url;
        }
      }
      throw new Error("Quá thời gian chờ xử lý video. Phiên upload được giữ lại để có thể kiểm tra và thử lại.");
    } catch (error) {
      if (sessionId && !completionStarted) {
        try {
          const response = await fetch(`${apiUrl}/media/video-uploads/${sessionId}/abort`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok && response.status !== 404 && response.status !== 410) {
            console.error("Could not clean up failed video upload session", response.status);
          }
        } catch (cleanupError) {
          console.error("Could not contact the server to clean up failed video upload", cleanupError);
        }
      }
      if (sessionId && completionStarted) {
        throw new Error(
          `${error instanceof Error ? error.message : "Không thể hoàn tất upload video."} Phiên ${sessionId} được giữ lại; vui lòng kiểm tra trạng thái trước khi tải lại video.`,
        );
      }
      throw error;
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setError("Vui lòng đăng nhập bằng tài khoản giảng viên.");
      return;
    }
    if (user?.role !== "INSTRUCTOR" && user?.role !== "ADMIN") {
      setError("Chỉ giảng viên mới có thể đăng tải khóa học.");
      return;
    }
    if (!thumbnail || !video) {
      setError("Vui lòng chọn cả thumbnail và video bài học.");
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    try {
      const thumbnailUrl = await uploadFile(token, thumbnail, undefined, "Đang tải thumbnail");
      if (!thumbnailUrl) throw new Error("Không nhận được đường dẫn thumbnail.");
      setUploadStage("Đang tạo khóa học");
      const course = await readResponse(await fetch(`${apiUrl}/courses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          price: Number(price),
          thumbnail: thumbnailUrl,
          category,
          level,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      })) as { id: string };
      setUploadStage("Đang tạo bài học");
      const section = await readResponse(await fetch(`${apiUrl}/courses/${course.id}/sections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nội dung khóa học" }),
      })) as { id: string };
      const videoUrl = await uploadVideoFile(token, video, course.id, "Đang tải video trực tiếp lên storage");
      if (!videoUrl) throw new Error("Không nhận được đường dẫn video.");
      await readResponse(await fetch(`${apiUrl}/courses/sections/${section.id}/lessons`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: lessonTitle, durationSec: 0, videoUrl }),
      }));
      setUploadStage("Hoàn tất");
      setUploadProgress(100);
      setSuccess("Đã tạo khóa học và tải nội dung thành công. Khóa học đang ở trạng thái bản nháp.");
      setTitle("");
      setDescription("");
      setPrice("0");
      setLessonTitle("");
      setCategory("Công nghệ");
      setLevel("Mọi cấp độ");
      setTags("");
      setThumbnail(null);
      setVideo(null);
      await loadCourses();
      const thumbnailInput = document.getElementById("thumbnail") as HTMLInputElement | null;
      const videoInput = document.getElementById("video") as HTMLInputElement | null;
      if (thumbnailInput) thumbnailInput.value = "";
      if (videoInput) videoInput.value = "";
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
    } finally {
      setLoading(false);
    }
  }

  async function publishCourse(courseId: string) {
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${apiUrl}/courses/${courseId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PUBLISHED" }),
      });
      await readResponse(response);
      setSuccess("Đã xuất bản khóa học. Khóa học hiện đã hiển thị trên trang chính.");
      await loadCourses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xuất bản khóa học.");
    }
  }

  function openManagement(course: InstructorCourse, action: NonNullable<ManagementPanel>["action"]) {
    setError("");
    setSuccess("");
    setManagement({ courseId: course.id, action });
    if (action === "edit") {
      setEditValues({
        title: course.title,
        description: course.description,
        category: course.category ?? "",
        level: course.level ?? "",
        tags: (course.tags ?? []).join(", "),
        price: String(course.price),
      });
      setEditThumbnail(null);
    } else if (action === "lesson") {
      setSelectedSectionId(course.sections?.[0]?.id ?? "");
      setNewLessonTitle("");
      setNewLessonDescription("");
      setNewLessonVideo(null);
    } else if (action === "materials") {
      setMaterialFiles([]);
    } else {
      setQuizTitle("");
      setQuizDescription("");
      setQuizQuestions([{ prompt: "", options: ["", "", "", ""], correctOption: 0 }]);
    }
  }

  async function saveCourse(event: React.FormEvent<HTMLFormElement>, courseId: string) {
    event.preventDefault();
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setError("Vui lòng đăng nhập lại để sửa khóa học.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const thumbnailUrl = editThumbnail
        ? await uploadFile(token, editThumbnail, courseId, "Đang tải thumbnail mới")
        : undefined;
      await readResponse(await fetch(`${apiUrl}/courses/${courseId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editValues.title,
          description: editValues.description,
          category: editValues.category,
          level: editValues.level,
          tags: editValues.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          price: Number(editValues.price),
          ...(thumbnailUrl ? { thumbnail: thumbnailUrl } : {}),
        }),
      }));
      setManagement(null);
      setSuccess("Đã cập nhật thông tin khóa học.");
      await loadCourses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể cập nhật khóa học.");
    } finally {
      setLoading(false);
    }
  }

  async function addLesson(event: React.FormEvent<HTMLFormElement>, course: InstructorCourse) {
    event.preventDefault();
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setError("Vui lòng đăng nhập lại để thêm bài học.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      let sectionId = selectedSectionId;
      if (!sectionId) {
        const section = await readResponse(await fetch(`${apiUrl}/courses/${course.id}/sections`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nội dung khóa học" }),
        })) as { id: string };
        sectionId = section.id;
      }
      const videoUrl = newLessonVideo
        ? await uploadVideoFile(token, newLessonVideo, course.id, "Đang tải video bài học trực tiếp lên storage")
        : undefined;
      await readResponse(await fetch(`${apiUrl}/courses/sections/${sectionId}/lessons`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newLessonTitle,
          description: newLessonDescription || undefined,
          ...(videoUrl ? { videoUrl } : {}),
        }),
      }));
      setManagement(null);
      setSuccess("Đã thêm bài học vào khóa học.");
      await loadCourses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể thêm bài học.");
    } finally {
      setLoading(false);
    }
  }

  async function addQuiz(event: React.FormEvent<HTMLFormElement>, courseId: string) {
    event.preventDefault();
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setError("Vui lòng đăng nhập lại để thêm bài kiểm tra.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await readResponse(await fetch(`${apiUrl}/courses/${courseId}/quizzes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quizTitle,
          description: quizDescription || undefined,
          questions: quizQuestions.map((question) => ({
            ...question,
            prompt: question.prompt.trim(),
            options: question.options.map((option) => option.trim()),
          })),
        }),
      }));
      setManagement(null);
      setSuccess("Đã thêm bài kiểm tra trắc nghiệm vào khóa học.");
      await loadCourses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể thêm bài kiểm tra.");
    } finally {
      setLoading(false);
    }
  }

  async function addMaterials(event: React.FormEvent<HTMLFormElement>, courseId: string) {
    event.preventDefault();
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setError("Vui lòng đăng nhập lại để tải tài liệu.");
      return;
    }
    if (!materialFiles.length) {
      setError("Vui lòng chọn ít nhất một tài liệu.");
      return;
    }
    const formData = new FormData();
    materialFiles.forEach((file) => formData.append("files", file));
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await readResponse(await fetch(`${apiUrl}/media/courses/${courseId}/materials`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }));
      setManagement(null);
      setSuccess("Đã đính kèm tài liệu vào khóa học.");
      await loadCourses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tải tài liệu.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteCourse(course: InstructorCourse) {
    if (!window.confirm(`Ẩn vĩnh viễn khóa học “${course.title}”? Hệ thống sẽ tự động yêu cầu hoàn tiền cho giao dịch đã thanh toán. Học viên chỉ mất quyền truy cập sau khi VNPAY xác nhận hoàn tiền. Không thể khôi phục khóa học.`)) return;
    const token = localStorage.getItem("hocmo_access_token");
    if (!token) {
      setError("Vui lòng đăng nhập lại để xóa khóa học.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      const result = await readResponse(await fetch(`${apiUrl}/courses/${course.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })) as { refunds?: Array<{ status: string }> };
      setManagement(null);
      const pendingRefunds = result.refunds?.filter(({ status }) => status !== "REFUNDED").length ?? 0;
      setSuccess(
        pendingRefunds
          ? `Khóa học đã được ẩn. ${pendingRefunds} giao dịch chưa được VNPAY xác nhận hoàn tiền thành công; quyền học của các học viên đó vẫn được giữ nguyên.`
          : "Khóa học đã được ẩn và các giao dịch đã thanh toán được hoàn tiền.",
      );
      await loadCourses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xóa khóa học.");
    }
  }

  function updateQuizQuestion(index: number, patch: Partial<QuizQuestionDraft>) {
    setQuizQuestions((questions) =>
      questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question,
      ),
    );
  }

  if (!user) return <main className="instructor-page"><p>Đang tải thông tin tài khoản…</p></main>;

  return (
    <main className="instructor-page">
      <div className="instructor-heading">
        <Link href="/" className="detail-breadcrumb"><ArrowLeft size={16} /> Về trang chủ</Link>
        <p className="eyebrow"><Upload size={15} /> KHU VỰC GIẢNG VIÊN</p>
        <h1>Đăng tải khóa học.</h1>
        <p>Tạo nội dung học tập, thêm thumbnail và video bài học. Video sẽ được chuyển sang HLS trước khi lưu.</p>
      </div>
      <form className="instructor-form" onSubmit={submit}>
        <label>Tiêu đề khóa học<input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} placeholder="Ví dụ: Thiết kế UI từ cơ bản đến nâng cao" /></label>
        <label>Mô tả khóa học<textarea value={description} onChange={(event) => setDescription(event.target.value)} required minLength={10} rows={6} placeholder="Mô tả những gì học viên sẽ nhận được…" /></label>
        <label>Danh mục
          <select value={category} onChange={(event) => setCategory(event.target.value)} required>
            <option>Thiết kế</option><option>Công nghệ</option><option>Kinh doanh</option><option>Nhiếp ảnh</option>
          </select>
        </label>
        <label>Cấp độ
          <select value={level} onChange={(event) => setLevel(event.target.value)} required>
            <option>Mọi cấp độ</option><option>Cơ bản</option><option>Trung cấp</option><option>Nâng cao</option>
          </select>
        </label>
        <label>Kỹ năng (phân cách bằng dấu phẩy)<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Ví dụ: React, UI, sản phẩm" /></label>
        <label>Giá khóa học (VNĐ)<input type="number" min="0" step="1000" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
        <label>Thumbnail<input id="thumbnail" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setThumbnail(event.target.files?.[0] ?? null)} required /></label>
        <label>Tên bài học đầu tiên<input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} required minLength={2} placeholder="Ví dụ: Giới thiệu khóa học" /></label>
        <label>Video bài học<input id="video" type="file" accept="video/mp4,video/*" onChange={(event) => setVideo(event.target.files?.[0] ?? null)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="form-message" role="status"><Check size={16} /> {success}</p>}
        {loading && <div className="upload-status" aria-live="polite"><div className="upload-status-line"><span>{uploadStage}</span><strong>{uploadProgress}%</strong></div><progress value={uploadProgress} max="100" /></div>}
        <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Đang tải nội dung…" : "Tạo khóa học"}<Upload size={17} /></button>
      </form>
      <section className="instructor-courses">
        <div className="instructor-section-heading"><div><p className="eyebrow">KHO KHÓA HỌC</p><h2>Bản nháp và khóa học đã xuất bản</h2></div><span>{courses.length} khóa học</span></div>
        {coursesLoading ? <p className="instructor-muted">Đang tải danh sách…</p> : courses.length === 0 ? <p className="instructor-muted">Bạn chưa có khóa học nào.</p> : <div className="instructor-course-list">{courses.map((course) => (
          <article className="instructor-course-card" key={course.id}>
            <div className="instructor-course-cover" style={course.thumbnail ? { backgroundImage: `url("${course.thumbnail}")` } : undefined} />
            <div className="instructor-course-info">
              <div className="instructor-course-status">{course.deletedAt ? "ĐÃ XÓA MỀM" : course.status === "PUBLISHED" ? "ĐÃ XUẤT BẢN" : course.status === "DRAFT" ? "BẢN NHÁP" : "ĐÃ LƯU TRỮ"}</div>
              <h3>{course.title}</h3>
              <p>{course.description}</p>
              <small>{course._count?.lessons ?? 0} bài học · {course.quizzes?.length ?? 0} bài kiểm tra · {new Intl.NumberFormat("vi-VN").format(Number(course.price))}đ</small>
            </div>
            <div className="instructor-course-actions">
              {!course.deletedAt && <>
                {course.status === "DRAFT" && <button className="publish-button" type="button" onClick={() => publishCourse(course.id)}>Xuất bản <Check size={15} /></button>}
                <button className="manage-button" type="button" onClick={() => openManagement(course, "edit")}>Sửa khóa học</button>
                <button className="manage-button" type="button" onClick={() => openManagement(course, "lesson")}><BookOpen size={15} /> Thêm bài học</button>
                <button className="manage-button" type="button" onClick={() => openManagement(course, "quiz")}><ClipboardList size={15} /> Thêm bài kiểm tra</button>
                <button className="manage-button" type="button" onClick={() => openManagement(course, "materials")}><Upload size={15} /> Tài liệu ({course.materials?.length ?? 0})</button>
                <button className="manage-button danger" type="button" onClick={() => void deleteCourse(course)}><Trash2 size={15} /> Xóa và hoàn tiền</button>
              </>}
            </div>
            {management?.courseId === course.id && (
              <div className="course-management-panel">
                <div className="course-management-heading">
                  <h4>{management.action === "edit" ? "Chỉnh sửa khóa học" : management.action === "lesson" ? "Thêm bài học" : management.action === "quiz" ? "Thêm bài kiểm tra trắc nghiệm" : "Tài liệu khóa học"}</h4>
                  <button type="button" className="icon-button" aria-label="Đóng" onClick={() => setManagement(null)}><X size={17} /></button>
                </div>
                {management.action === "edit" && (
                  <form className="management-form" onSubmit={(event) => void saveCourse(event, course.id)}>
                    <label>Tiêu đề<input required minLength={3} value={editValues.title} onChange={(event) => setEditValues({ ...editValues, title: event.target.value })} /></label>
                    <label>Mô tả<textarea required minLength={10} rows={4} value={editValues.description} onChange={(event) => setEditValues({ ...editValues, description: event.target.value })} /></label>
                    <label>Danh mục<input required minLength={2} value={editValues.category} onChange={(event) => setEditValues({ ...editValues, category: event.target.value })} /></label>
                    <label>Cấp độ<input required minLength={2} value={editValues.level} onChange={(event) => setEditValues({ ...editValues, level: event.target.value })} /></label>
                    <label>Kỹ năng, cách nhau bằng dấu phẩy<input value={editValues.tags} onChange={(event) => setEditValues({ ...editValues, tags: event.target.value })} /></label>
                    <label>Giá (VNĐ)<input type="number" min="0" step="1000" required value={editValues.price} onChange={(event) => setEditValues({ ...editValues, price: event.target.value })} /></label>
                    <label>Thumbnail mới (không bắt buộc)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEditThumbnail(event.target.files?.[0] ?? null)} /></label>
                    <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Đang lưu…" : "Lưu thay đổi"}<Check size={16} /></button>
                  </form>
                )}
                {management.action === "lesson" && (
                  <form className="management-form" onSubmit={(event) => void addLesson(event, course)}>
                    <label>Tên bài học<input required minLength={2} value={newLessonTitle} onChange={(event) => setNewLessonTitle(event.target.value)} /></label>
                    <label>Mô tả<textarea rows={3} value={newLessonDescription} onChange={(event) => setNewLessonDescription(event.target.value)} /></label>
                    {(course.sections?.length ?? 0) > 0 && (
                      <label>Chương
                        <select value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)}>
                          {course.sections?.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
                        </select>
                      </label>
                    )}
                    <label>Video bài học (không bắt buộc)<input type="file" accept="video/mp4,video/*" onChange={(event) => setNewLessonVideo(event.target.files?.[0] ?? null)} /></label>
                    {loading && <div className="upload-status"><div className="upload-status-line"><span>{uploadStage}</span><strong>{uploadProgress}%</strong></div><progress value={uploadProgress} max="100" /></div>}
                    <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Đang thêm bài học…" : "Thêm bài học"}<Plus size={16} /></button>
                  </form>
                )}
                {management.action === "quiz" && (
                  <form className="management-form" onSubmit={(event) => void addQuiz(event, course.id)}>
                    <label>Tên bài kiểm tra<input required minLength={2} value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} /></label>
                    <label>Mô tả<textarea rows={3} value={quizDescription} onChange={(event) => setQuizDescription(event.target.value)} /></label>
                    {quizQuestions.map((question, index) => (
                      <fieldset className="quiz-question-editor" key={index}>
                        <legend>Câu hỏi {index + 1}</legend>
                        <label>Nội dung câu hỏi<textarea required minLength={2} rows={2} value={question.prompt} onChange={(event) => updateQuizQuestion(index, { prompt: event.target.value })} /></label>
                        {question.options.map((option, optionIndex) => (
                          <label key={optionIndex}>Đáp án {optionIndex + 1}
                            <input required value={option} onChange={(event) => {
                              const options = [...question.options];
                              options[optionIndex] = event.target.value;
                              updateQuizQuestion(index, { options });
                            }} />
                          </label>
                        ))}
                        <label>Đáp án đúng
                          <select value={question.correctOption} onChange={(event) => updateQuizQuestion(index, { correctOption: Number(event.target.value) })}>
                            {question.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>Đáp án {optionIndex + 1}</option>)}
                          </select>
                        </label>
                        {quizQuestions.length > 1 && <button className="remove-question-button" type="button" onClick={() => setQuizQuestions((questions) => questions.filter((_, questionIndex) => questionIndex !== index))}>Xóa câu hỏi</button>}
                      </fieldset>
                    ))}
                    <button className="manage-button" type="button" onClick={() => setQuizQuestions((questions) => [...questions, { prompt: "", options: ["", "", "", ""], correctOption: 0 }])} disabled={quizQuestions.length >= 50}><Plus size={15} /> Thêm câu hỏi</button>
                    <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Đang lưu…" : "Tạo bài kiểm tra"}<ClipboardList size={16} /></button>
                  </form>
                )}
                {management.action === "materials" && (
                  <form className="management-form" onSubmit={(event) => void addMaterials(event, course.id)}>
                    <p className="instructor-muted">Tải PDF, Word, PowerPoint, Excel, TXT, CSV hoặc ZIP (tối đa 25 MB mỗi file).</p>
                    <label>Chọn tài liệu<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip" multiple onChange={(event) => setMaterialFiles(Array.from(event.target.files ?? []))} /></label>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    {success && <p className="form-message" role="status"><Check size={16} /> {success}</p>}
                    {course.materials?.length ? (
                      <ul className="instructor-material-list">
                        {course.materials.map((material) => <li key={material.id}>{material.originalName} · {(material.sizeBytes / 1024 / 1024).toFixed(1)} MB</li>)}
                      </ul>
                    ) : <p className="instructor-muted">Chưa có tài liệu.</p>}
                    <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Đang tải tài liệu…" : "Đính kèm tài liệu"}<Upload size={16} /></button>
                  </form>
                )}
              </div>
            )}
          </article>
        ))}</div>}
      </section>
    </main>
  );
}
