import type { Metadata } from "next";
import { Lora } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Học Mở — Học điều mình muốn",
  description: "Khóa học thực tế để mở rộng kỹ năng và con đường của bạn.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={lora.variable}>
      <body><div className="app-shell"><Header />{children}</div></body>
    </html>
  );
}
