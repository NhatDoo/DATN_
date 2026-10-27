import { Suspense } from "react";
import PaymentResult from "@/components/PaymentResult";

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div className="detail-loading">Đang tải kết quả thanh toán…</div>}>
      <PaymentResult />
    </Suspense>
  );
}