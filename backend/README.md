# Course Platform API

Backend quản lý khóa học theo các module NestJS: auth, courses, learning và media. Database Neon (tương thích PostgreSQL) được truy cập qua Prisma; media dùng S3-compatible storage đã cấu hình trong workspace `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ENDPOINT_URL_S3`). Không cần PostgreSQL local hoặc MinIO.

## Chạy local

Chạy lệnh tại thư mục `backend/`. API tự nạp `../.env` và `.env`:

```bash
npm install
npm run prisma:generate
npm run db:migrate -- --name init
npm run start:dev
```

Chuyển video sang HLS cần FFmpeg trên máy chạy backend. Ubuntu/Codespaces: `sudo apt-get update && sudo apt-get install -y ffmpeg`; kiểm tra bằng `ffmpeg -version`. Nếu executable nằm ngoài `PATH`, đặt `FFMPEG_PATH` tới executable. Docker image backend cài FFmpeg sẵn.

## Chạy toàn bộ môi trường bằng Docker Compose

Từ thư mục gốc repository, tạo file cấu hình local rồi khởi động dịch vụ:

```bash
cp -n .env.example .env
docker compose up --build
```

Compose chạy migration Prisma lên Neon trước khi khởi động backend, rồi chạy frontend ở `http://localhost:8080` và API ở `http://localhost:3000/api/v1`. Neon lưu trữ database độc lập với vòng đời container. Dừng dịch vụ bằng `docker compose down`.

Trước khi khởi động, đặt `DATABASE_URL` trong `.env` bằng connection string lấy từ Neon và giữ tham số `sslmode=require`. Các giá trị khác trong `.env.example` chỉ phục vụ phát triển. Điền thông tin VNPAY sandbox và S3-compatible storage khi cần thử các tích hợp đó. Không đưa `.env` thật vào Git hoặc Docker image.

Swagger: `http://localhost:3000/docs`; API prefix: `/api/v1`. Prisma scripts đọc `DATABASE_URL` trong workspace `.env`; `docker compose up --build` tự chạy các migration còn thiếu trên Neon. Tạo bucket private trên storage provider và đặt tên vào `STORAGE_BUCKET` (mặc định `course-media`). Ảnh thumbnail công khai được phân phối qua API; không cấu hình bucket/CDN cho phép đọc object trực tiếp.

Video nguồn được upload trực tiếp từ trình duyệt tới S3-compatible storage bằng multipart upload có URL ký tạm thời, tránh giới hạn body-size của Next.js proxy. Cấu hình CORS của bucket cho phép `PUT` từ origin frontend thực tế, cho phép request headers cần thiết và expose response header `ETag`. Ví dụ cấu hình: `AllowedOrigins` gồm origin frontend triển khai và origin local cần dùng; `AllowedMethods` gồm `PUT`; `AllowedHeaders` gồm `*`; `ExposeHeaders` gồm `ETag`. Neon Object Storage giới hạn một object multipart ở 10 GiB. Sau upload backend tải file về máy xử lý HLS, vì vậy dung lượng lớn vẫn cần đủ dung lượng đĩa và thời gian xử lý.

## Endpoint chính

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/presence`
- `GET /api/v1/courses?q=...`, `GET /api/v1/courses/:courseId`
- `GET /api/v1/courses/filters` trả về danh mục và cấp độ đang được xuất bản.
- `GET /api/v1/courses/reviews/recent` trả về đánh giá mới trên các khóa học đang hiển thị.
- `POST /api/v1/courses/:courseId/reviews` tạo/cập nhật đánh giá 1–5 sao và bình luận; chỉ học viên đã đăng ký được đánh giá.
- `GET /api/v1/courses/:courseId` trả điểm trung bình, số lượt đánh giá và bình luận; tài liệu chỉ xuất hiện với học viên đã đăng ký hoặc giảng viên/quản trị viên.
- `GET /api/v1/courses/recommendations/me?limit=12` xếp hạng theo hành vi, tìm kiếm, danh mục, thẻ kỹ năng, độ phổ biến và chất lượng đánh giá; khóa học đã đăng ký không xuất hiện.
- `POST /api/v1/courses/:courseId/recommendation-click` ghi nhận lượt nhấp gợi ý.
- `GET /api/v1/courses/recommendations/metrics` thống kê impressions/clicks/đăng ký/hoàn thành và tỷ lệ tương ứng (chỉ ADMIN).
- `GET /api/v1/statistics/me` trả thống kê theo vai trò: học tập của học viên, hoạt động/doanh thu/đánh giá theo khóa học của giảng viên, hoặc số tài khoản/khóa học/online của ADMIN. Người dùng được tính online nếu có hoạt động trong 5 phút gần nhất.
- Giảng viên: `POST /api/v1/courses`, `POST /api/v1/courses/:courseId/sections`, `POST /api/v1/courses/sections/:sectionId/lessons`; `DELETE /api/v1/courses/:courseId` ẩn vĩnh viễn khóa học và tự động gửi yêu cầu hoàn tiền cho giao dịch đã thanh toán.
- `POST /api/v1/learning/enrollments`, `PATCH /api/v1/learning/lessons/:lessonId/progress`
- `GET /api/v1/learning/me/courses`, `GET /api/v1/learning/me/activity?limit=50`
- Giảng viên: `POST /api/v1/media/upload?courseId=<uuid>`, multipart field `files`; upload ảnh, playlist HLS `.m3u8` cùng các segment hoặc một video `.mp4`/`.mov`/`.mkv`/`.webm` để backend chuyển thành HLS bằng FFmpeg.
- Giảng viên: `POST /api/v1/media/courses/:courseId/materials`, multipart field `files`; tối đa 10 tài liệu PDF/Office/TXT/CSV/ZIP, 25 MB mỗi file. Tệp được lưu private; `GET /api/v1/media/course-materials/:materialId/download` chỉ cho học viên đã đăng ký hoặc người quản lý khóa học tải.
- `GET /api/v1/media/lessons/:lessonId/playback` cấp URL HLS ký tạm cho học viên đã đăng ký. Giữ bucket S3 private; playlist/segment được proxy qua API và ticket phát hết hạn sau 15 phút.
- `POST /api/v1/payments/courses/:courseId/checkout` tạo URL VNPAY cho tài khoản đã đăng nhập.
- `GET /api/payment/vnpay/return` là browser return; `GET /api/payment/vnpay/ipn` là endpoint IPN cần khai báo trong VNPAY merchant settings.
- `GET /api/v1/payments/:transactionRef`, `POST /api/v1/payments/:transactionRef/confirm-enrollment` và `POST /api/v1/payments/:transactionRef/refund` quản lý trạng thái, xác nhận đăng ký và yêu cầu hoàn tiền.

Gửi JWT từ login qua header Authorization. Video không dùng URL S3 công khai: client yêu cầu ticket playback, sau đó tải playlist và từng segment qua API. Đặt `JWT_SECRET` đủ mạnh ở môi trường triển khai; ticket phát có hạn 15 phút.

Sau khi sửa `prisma/schema.prisma`, tạo migration bằng `npm run db:migrate -- --name <migration-name>`. Dùng `npm run db:deploy` cho môi trường triển khai và `npm run db:studio` để mở Prisma Studio.

## VNPAY

Backend đọc `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL` và `VNPAY_RETURN_URL` từ `.env`. Return URL phải truy cập công khai; với workspace hiện tại callback dùng port `8080`. Khai báo thêm `https://<host>:8080/api/payment/vnpay/ipn` ở cấu hình IPN của merchant nếu sandbox account hỗ trợ. VNPAY Return/IPN được xác minh bằng HMAC-SHA512 và đối chiếu mã merchant, số tiền, transaction reference.

Payment thành công chưa tự mở bài học. Client gọi `confirm-enrollment` sau khi trạng thái payment được server xác minh; enrollment ghi `refundExpiresAt = enrolledAt + 2 giờ`. Refund được khóa và kiểm tra deadline ở server trước khi gửi yêu cầu refund toàn phần tới VNPAY. Chỉ khi VNPAY xác nhận thành công, payment mới chuyển sang `REFUNDED`; enrollment và tiến độ học bị xóa để thu hồi quyền truy cập. Giao diện khi đó trở về trạng thái có thể mua/đăng ký khóa học lại. Nội dung chỉ được mở sau enrollment; callback browser đơn thuần không cấp quyền.

Khi giảng viên ẩn khóa học, backend giữ nguyên lịch sử khóa học và giao dịch, đồng thời gửi yêu cầu hoàn tiền cho mọi payment đã thanh toán (không áp dụng giới hạn 2 giờ của refund tự phục vụ). Khóa học bị loại khỏi danh mục/gợi ý ngay lập tức; học viên vẫn giữ quyền truy cập cho đến khi VNPAY xác nhận hoàn tiền. Chỉ lúc đó payment thành `REFUNDED`, enrollment và tiến độ mới bị xóa. Nếu VNPAY từ chối hoặc chưa xác nhận, API trả trạng thái từng giao dịch và giữ enrollment/quyền học, không ghi nhận hoàn tiền thành công giả. Khóa học đã ẩn không thể khôi phục hoặc chỉnh sửa.

Các trang `/statistics`, `/feedback` và `/about` lần lượt hiển thị số liệu theo vai trò, đánh giá học viên gần đây và thông tin Học Mở.
