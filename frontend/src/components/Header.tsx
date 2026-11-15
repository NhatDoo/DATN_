"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpenCheck, Menu, Search, X } from "lucide-react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = () => {
      try {
        const user = JSON.parse(localStorage.getItem("hocmo_user") ?? "null") as { name?: string } | null;
        setUserName(user?.name ?? null);
        setUserRole((user as { role?: string } | null)?.role ?? null);
      } catch {
        setUserName(null);
        setUserRole(null);
      }
    };
    loadUser();
    window.addEventListener("storage", loadUser);
    window.addEventListener("hocmo-auth-changed", loadUser);
    return () => {
      window.removeEventListener("storage", loadUser);
      window.removeEventListener("hocmo-auth-changed", loadUser);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("hocmo_access_token");
    if (!userName || !token) return;
    let active = true;
    const updatePresence = async () => {
      try {
        const response = await fetch(`${apiUrl}/auth/presence`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok && active) {
          console.error(`Presence update failed with HTTP ${response.status}`);
        }
      } catch (error) {
        if (active) console.error("Presence update failed", error);
      }
    };
    void updatePresence();
    const interval = window.setInterval(() => void updatePresence(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [userName]);

  function logout() {
    localStorage.removeItem("hocmo_access_token");
    localStorage.removeItem("hocmo_user");
    setUserName(null);
    setUserRole(null);
    window.dispatchEvent(new Event("hocmo-auth-changed"));
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Mở trang chủ Học Mở">
          <span className="brand-mark"><BookOpenCheck size={19} strokeWidth={2.2} /></span>
          <span>học<span className="brand-light">mở</span><i>.</i></span>
        </Link>
        <nav className={menuOpen ? "main-nav open" : "main-nav"} aria-label="Điều hướng chính">
          <Link href="/#catalog" onClick={() => setMenuOpen(false)}>Khám phá</Link>
          <Link href="/#about" onClick={() => setMenuOpen(false)}>Cách học</Link>
          {userName && userRole === "STUDENT" && <Link href="/my-courses" onClick={() => setMenuOpen(false)}>Khóa học của tôi</Link>}
          {userName && (userRole === "INSTRUCTOR" || userRole === "ADMIN") && <Link href="/instructor" onClick={() => setMenuOpen(false)}>Quản lý khóa học</Link>}
          {userName && <Link href="/statistics" onClick={() => setMenuOpen(false)}>Thống kê</Link>}
          <Link href="/feedback" onClick={() => setMenuOpen(false)}>Phản hồi</Link>
          <Link href="/about" onClick={() => setMenuOpen(false)}>Về chúng tôi</Link>
          {!userName && <Link href="/login" className="mobile-auth" onClick={() => setMenuOpen(false)}>Đăng nhập</Link>}
        </nav>
        <div className="header-actions">
          <Link className="icon-link" href="/#catalog" aria-label="Tìm khóa học"><Search size={19} /></Link>
          {userName ? <><span className="header-login">Xin chào, {userName}</span>{userRole === "STUDENT" ? <Link className="header-login" href="/my-courses">Khóa học của tôi</Link> : null}{userRole === "INSTRUCTOR" || userRole === "ADMIN" ? <Link className="header-login" href="/instructor">Quản lý khóa học</Link> : null}<button className="header-join" type="button" onClick={logout}>Đăng xuất</button></> : <><Link className="header-login" href="/login">Đăng nhập</Link><Link className="header-join" href="/register">Bắt đầu học <span>↗</span></Link></>}
        </div>
        <button className="mobile-menu" aria-label={menuOpen ? "Đóng menu" : "Mở menu"} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </header>
  );
}
