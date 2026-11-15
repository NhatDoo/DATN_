"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

export type AuthMode = "login" | "register" | "forgot";
type LoginRole = "STUDENT" | "INSTRUCTOR";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

const copy = {
  login: { eyebrow: "MỪNG BẠN TRỞ LẠI", title: "Tiếp tục hành trình.", button: "Đăng nhập", prompt: "Chưa có tài khoản?", link: "Tạo tài khoản", href: "/register" },
  register: { eyebrow: "BẮT ĐẦU TỪ ĐÂY", title: "Mở một cánh cửa mới.", button: "Tạo tài khoản", prompt: "Đã có tài khoản?", link: "Đăng nhập", href: "/login" },
  forgot: { eyebrow: "KHÔI PHỤC TÀI KHOẢN", title: "Lấy lại quyền truy cập.", button: "Gửi hướng dẫn", prompt: "Nhớ ra mật khẩu rồi?", link: "Quay lại đăng nhập", href: "/login" },
};

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<LoginRole | "">("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const text = copy[mode];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (mode === "forgot") {
      setMessage("Giao diện đã ghi nhận email. Tính năng gửi thư cần được kết nối với email service của hệ thống.");
      return;
    }
    if ((mode === "login" || mode === "register") && !role) {
      setError("Vui lòng chọn vai trò trước khi tiếp tục.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "register" ? { name, email, password, role } : { email, password, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Không thể xử lý yêu cầu. Vui lòng thử lại.");
      localStorage.setItem("hocmo_access_token", result.accessToken);
      localStorage.setItem("hocmo_user", JSON.stringify(result.user));
      window.dispatchEvent(new Event("hocmo-auth-changed"));
      router.push("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link href="/" className="auth-back"><ArrowLeft size={17} /> Về trang chủ</Link>
        <div className="auth-aside-content">
          <div className="auth-aside-label"><span /> MỘT KỸ NĂNG MỚI, MỘT GÓC NHÌN MỚI</div>
          <h1>Học theo cách<br /><em>của bạn.</em></h1>
          <p>Những bài học thực tế, những người hướng dẫn tận tâm, và một nhịp học vừa vặn với cuộc sống của bạn.</p>
          <div className="auth-aside-photo" role="img" aria-label="Không gian học tập sáng tạo" />
          <div className="auth-aside-index">HỌC MỞ <span>01 — 03</span></div>
        </div>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <div className="auth-eyebrow"><KeyRound size={15} /> {text.eyebrow}</div>
          <h2>{text.title}</h2>
          <p className="auth-intro">Một chút mỗi ngày. Một bước gần hơn với điều bạn muốn.</p>
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <label className="field-label">Tên hiển thị
                <input autoComplete="name" placeholder="Tên của bạn" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
              </label>
            )}
            <label className="field-label">Email
              <span className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" placeholder="ban@email.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></span>
            </label>
            {mode !== "forgot" && (
              <label className="field-label">Mật khẩu
                <span className="input-wrap"><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Ít nhất 8 ký tự" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /><button className="password-toggle" type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
              </label>
            )}
            {(mode === "login" || mode === "register") && (
              <fieldset className="role-field">
                <legend>Vai trò {mode === "register" ? "tài khoản" : "đăng nhập"}</legend>
                <label><input type="radio" name="account-role" value="STUDENT" checked={role === "STUDENT"} onChange={() => setRole("STUDENT")} /> Học sinh</label>
                <label><input type="radio" name="account-role" value="INSTRUCTOR" checked={role === "INSTRUCTOR"} onChange={() => setRole("INSTRUCTOR")} /> Giảng viên / giáo viên</label>
              </fieldset>
            )}
            {mode === "login" && <Link className="forgot-link" href="/forgot-password">Quên mật khẩu?</Link>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-message" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Đang xử lý…" : text.button}<ArrowRight size={17} /></button>
          </form>
          <div className="auth-switch">{text.prompt} <Link href={text.href}>{text.link}</Link></div>
          <div className="auth-legal">Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư.</div>
        </div>
        <div className="auth-bottom-note">HỌC MỞ <span>HỌC ĐIỀU MÌNH MUỐN</span></div>
      </section>
    </main>
  );
}
