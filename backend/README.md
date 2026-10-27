# Course Platform API

Backend quản lý khóa học theo các module NestJS: auth, courses, learning và media. PostgreSQL được truy cập qua Prisma; media dùng S3-compatible storage đã cấu hình trong workspace `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ENDPOINT_URL_S3`). Không cần MinIO.

## Chạy local

Chạy lệnh tại thư mục `backend/`. API tự nạp `../.env` và `.env`:

```bash
npm install
npm run prisma:generate
npm run db:migrate -- --name init
npm run start:dev
```

Swagger: `http://localhost:3000/docs`; API prefix: `/api/v1`. Tạo database PostgreSQL trước và điền `DATABASE_URL` trong workspace `.env`; Prisma scripts đọc file này từ thư mục gốc. Tạo bucket trên storage provider, đặt tên vào `STORAGE_BUCKET` (mặc định `course-media`). Nếu endpoint ghi trong `AWS_ENDPOINT_URL_S3` không truy cập public được từ trình duyệt, đặt `STORAGE_PUBLIC_URL` thành domain public/CDN của bucket.

## Endpoint chính

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
- `GET /api/v1/courses?q=...`, `GET /api/v1/courses/:courseId`
- Giảng viên: `POST /api/v1/courses`, `POST /api/v1/courses/:courseId/sections`, `POST /api/v1/courses/sections/:sectionId/lessons`
- `POST /api/v1/learning/enrollments`, `PATCH /api/v1/learning/lessons/:lessonId/progress`
- `GET /api/v1/learning/me/courses`, `GET /api/v1/learning/me/activity?limit=50`
- Giảng viên: `POST /api/v1/media/upload?courseId=<uuid>`, multipart field `files`; upload ảnh hoặc playlist HLS `.m3u8` cùng các segment được tham chiếu.
- `POST /api/v1/payments/courses/:courseId/checkout` tạo URL VNPAY cho tài khoản đã đăng nhập.
- `GET /api/payment/vnpay/return` là browser return; `GET /api/payment/vnpay/ipn` là endpoint IPN cần khai báo trong VNPAY merchant settings.
- `GET /api/v1/payments/:transactionRef`, `POST /api/v1/payments/:transactionRef/confirm-enrollment` và `POST /api/v1/payments/:transactionRef/refund` quản lý trạng thái, xác nhận đăng ký và yêu cầu hoàn tiền.

Gửi JWT từ login qua `Authorization: Bearer <token>`. Đăng ký instructor cần `INSTRUCTOR_INVITE_CODE`. Bucket/CDN cần cho phép đọc object nếu client phát HLS trực tiếp từ URL trả về.

Sau khi sửa `prisma/schema.prisma`, tạo migration bằng `npm run db:migrate -- --name <migration-name>`. Dùng `npm run db:deploy` cho môi trường triển khai và `npm run db:studio` để mở Prisma Studio.

## VNPAY

Backend đọc `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL` và `VNPAY_RETURN_URL` từ `.env`. Return URL phải truy cập công khai; với workspace hiện tại callback dùng port `8080`. Khai báo thêm `https://<host>:8080/api/payment/vnpay/ipn` ở cấu hình IPN của merchant nếu sandbox account hỗ trợ. VNPAY Return/IPN được xác minh bằng HMAC-SHA512 và đối chiếu mã merchant, số tiền, transaction reference.

Payment thành công chưa tự mở bài học. Client gọi `confirm-enrollment` sau khi trạng thái payment được server xác minh; enrollment ghi `refundExpiresAt = enrolledAt + 1 giờ`. Refund được khóa và kiểm tra deadline ở server trước khi gửi yêu cầu refund toàn phần tới VNPAY. Nội dung chỉ được mở sau enrollment; callback browser đơn thuần không cấp quyền.
