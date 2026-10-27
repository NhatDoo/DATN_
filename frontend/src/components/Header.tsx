"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpenCheck, Menu, Search, X } from "lucide-react";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

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
          <Link href="/login" className="mobile-auth" onClick={() => setMenuOpen(false)}>Đăng nhập</Link>
        </nav>
        <div className="header-actions">
          <Link className="icon-link" href="/#catalog" aria-label="Tìm khóa học"><Search size={19} /></Link>
          <Link className="header-login" href="/login">Đăng nhập</Link>
          <Link className="header-join" href="/register">Bắt đầu học <span>↗</span></Link>
        </div>
        <button className="mobile-menu" aria-label={menuOpen ? "Đóng menu" : "Mở menu"} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </header>
  );
}