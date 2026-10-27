"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

type Payment = {
  transactionRef: string;
  amount: string | number;
  status: "PENDING" | "PAID" | "FAILED" | "REFUND_PENDING" | "REFUNDED";
  course: { id: string; title: string; slug: string };
  enrollment: { refundExpiresAt: string | null } | null;
};

const subscribeAuth = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

export default function PaymentResult() {
  const search = useSearchParams();
  const router = useRouter();
  const transactionRef = search.get("txnRef");
  const returnStatus = search.get("status");
  const token = useSyncExternalStore(
    subscribeAuth,
    () => localStorage.getItem("hocmo_access_token"),
    () => null,
  );
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!transactionRef || !token) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const refresh = async () => {
      try {
        const response = await fetch(`${apiUrl}/payments/${encodeURIComponent(transactionRef)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể tải trạng thái thanh toán.");
        if (!active) return;
        setPayment(result);
        setError("");
        if (result.status === "PENDING" && attempts < 8) {
          attempts += 1;
          timer = setTimeout(refresh, 2000);
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [token, transactionRef]);

  async function confirmEnrollment() {
    if (!token || !transactionRef || !payment) return;
    setConfirming(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/payments/${encodeURIComponent(transactionRef)}/confirm-enrollment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Không thể xác nhận đăng ký.");
      router.replace(`/courses/${payment.course.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
    } finally {
      setConfirming(false);
    }
  }

  const paid = payment?.status === "PAID";
  const enrolled = Boolean(payment?.enrollment);
  const failed = returnStatus === "failed" || payment?.status === "FAILED";

  return (
    <main className="payment-result-page">
      <Link className="detail-breadcrumb" href="/"><ArrowLeft size={15} /> Về trang chủ</Link>
      <section className="payment-result-card">
        {loading ? <span className="payment-state-icon pending"><LoaderCircle size={25} className="spin" /></span> :
          paid ? <span className="payment-state-icon success"><BadgeCheck size={27} /></span> :
          failed ? <span className="payment-state-icon failed"><CircleAlert size={25} /></span> :
          <span className="payment-state-icon pending"><RefreshCw size={24} /></span>}
        <p className="eyebrow">KẾT QUẢ THANH TOÁN</p>
        <h1>{loading ? "Đang xác nhận giao dịch" : paid ? "Thanh toán thành công" : failed ? "Giao dịch chưa hoàn tất" : "Đang chờ VNPAY xác nhận"}</h1>
        <p className="payment-result-copy">
          {loading ? "Hệ thống đang đồng bộ kết quả từ VNPAY." : paid ? "VNPAY đã xác nhận khoản thanh toán. Xác nhận đăng ký để bắt đầu học." : failed ? "Bạn có thể quay lại khóa học và thử thanh toán lại." : "Nếu bạn vừa thanh toán, trạng thái sẽ được cập nhật tự động trong giây lát."}
        </p>
        {payment && <div className="payment-summary"><span>{payment.course.title}</span><strong>{new Intl.NumberFormat("vi-VN").format(Number(payment.amount))}đ</strong></div>}
        {!token && <p className="payment-error">Hãy đăng nhập bằng tài khoản đã tạo giao dịch để xem và xác nhận enrollment.</p>}
        {error && <p className="payment-error" role="alert">{error}</p>}
        {paid && !enrolled && <button className="buy-button payment-confirm" disabled={confirming || !token} onClick={confirmEnrollment}>{confirming ? "Đang xác nhận…" : "Xác nhận đăng ký khóa học"}<ArrowRight size={17} /></button>}
        {enrolled && <Link className="buy-button payment-confirm" href={`/courses/${payment!.course.id}`}>Vào học ngay <ArrowRight size={17} /></Link>}
        {failed && <Link className="payment-back-link" href="/">Quay lại danh sách khóa học <ArrowRight size={15} /></Link>}
        {transactionRef && <p className="transaction-ref">Mã giao dịch · {transactionRef}</p>}
      </section>
    </main>
  );
}