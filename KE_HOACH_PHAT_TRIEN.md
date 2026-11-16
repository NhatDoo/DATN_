# Kế hoạch phát triển nền tảng khóa học

> Trạng thái cập nhật: 15/11/2026. `[x]` là hạng mục đã được triển khai hoặc kiểm tra; `[ ]` là việc còn cần triển khai hoặc xác minh trên môi trường tích hợp.

## Mục tiêu

Hoàn thiện trải nghiệm học và thanh toán, bảo vệ video khóa học lưu trên storage, sau đó xây dựng hệ thống gợi ý khóa học. Các hạng mục được xếp từ dễ đến khó; nên hoàn thành tiêu chí nghiệm thu của từng giai đoạn trước khi chuyển sang giai đoạn phụ thuộc.

> Định dạng playlist video là `.m3u8` (HLS), không phải `.m8u3`. HLS chia video thành playlist và các segment; riêng việc dùng HLS không ngăn người xem ghi lại nội dung.

## Hiện trạng và tiến độ

- Backend đã có tài khoản, API đăng ký học miễn phí, theo dõi tiến độ và một số sự kiện tìm kiếm/xem.
- Backend có luồng VNPAY gồm checkout, callback/IPN, xác nhận đăng ký và yêu cầu hoàn tiền. Thời hạn hoàn tiền đã được đổi sang 2 giờ tính từ `enrolledAt`, có kiểm tra tại server và kiểm thử đơn vị.
- Khóa học có metadata danh mục/cấp độ/thẻ và API lọc; giao diện có danh mục lấy từ API.
- Người học có thể đăng ký miễn phí, xem khóa học của tôi, tiến độ và tiếp tục bài học. Refund window là 2 giờ từ `enrolledAt`, có countdown ở trang khóa học.
- Media hỗ trợ nhận video nguồn và chuyển HLS bằng FFmpeg; nội dung nằm trong private S3-compatible storage. API kiểm tra quyền đăng ký và cấp ticket HMAC 15 phút; playlist và segment được proxy qua API.
- Đã có đánh giá 1–5 sao kèm bình luận cho học viên đã đăng ký; giảng viên có thể đính kèm tài liệu trong private storage, chỉ học viên đã đăng ký và người quản lý khóa học tải được.
- Gợi ý cá nhân hóa theo lượt xem, tiến độ, lịch sử đăng ký, tìm kiếm, danh mục, thẻ, mức độ phổ biến và chất lượng đánh giá; ghi nhận impression/click/đăng ký/hoàn thành. Chưa đánh giá chất lượng trên tập dữ liệu thực.
- Giảng viên có thể ẩn vĩnh viễn khóa học; khóa học bị loại khỏi catalog và các payment đã thanh toán được tự động gửi yêu cầu refund. Enrollment/quyền học chỉ bị gỡ sau khi VNPAY xác nhận.
- Có API/thanh điều hướng thống kê theo vai trò, danh sách phản hồi đánh giá và trang Về chúng tôi. Online được tính theo hoạt động trong 5 phút gần nhất.
- Đã có Dockerfile, Docker Compose, `.env.example`, API rewrite nội bộ và hướng dẫn chạy. Cấu hình Compose hợp lệ; khởi động end-to-end chưa xác minh do backend trước đó không kết nối được database qua Docker bridge trong workspace này.

## Lộ trình công việc

### Giai đoạn 1 — Chuẩn hóa danh mục khóa học
**Độ khó: Dễ**

- [x] Lưu metadata danh mục, cấp độ và thẻ kỹ năng cùng khóa học.
- [x] Trả danh mục/cấp độ đang xuất bản từ API; giao diện dùng danh mục API và chỉ dùng giá trị dự phòng khi thiếu dữ liệu.
- [x] Bổ sung kiểm tra dữ liệu đầu vào khi giảng viên tạo hoặc cập nhật khóa học.

**Nghiệm thu:** Khóa học thật hiển thị đúng danh mục và cấp độ; có thể lọc danh sách theo dữ liệu từ API.

### Giai đoạn 2 — Hoàn thiện hệ thống đăng ký khóa học và trải nghiệm học
**Độ khó: Dễ**

- [x] Backend có API đăng ký khóa học miễn phí, checkout khóa học trả phí, chống đăng ký trùng và chỉ xác nhận quyền học sau khi thanh toán được xác minh.
- [x] Hoàn thiện giao diện đăng ký miễn phí và trạng thái đã đăng ký/đã sở hữu.
- [x] Backend có API liệt kê khóa học đã đăng ký cùng phần trăm tiến độ.
- [x] Tạo trang “Khóa học của tôi” để người học vào khóa học đã đăng ký.
- [x] Hiển thị tiến độ hoàn thành và trạng thái khóa học.
- [x] Bổ sung thao tác tiếp tục học từ bài học gần nhất.
- [x] Nối giao diện với API lưu/tải tiến độ; kiểm thử tích hợp trên môi trường thật vẫn cần thực hiện.

**Nghiệm thu:** Người học đăng ký được khóa học miễn phí hoặc mua khóa học trả phí; nội dung trả phí chỉ mở sau khi backend xác nhận quyền học. Danh sách khóa học và tiến độ nhất quán với API, không mất sau khi tải lại trang.

### Giai đoạn 3 — Kết nối thanh toán VNPAY và hoàn tiền 2 giờ
**Độ khó: Dễ–Trung bình**

- [x] Kết nối thao tác mua khóa học trên giao diện với endpoint tạo checkout.
- [x] Giao diện kết quả thanh toán thể hiện các trạng thái chờ, thành công, thất bại; hỗ trợ quay lại thử thanh toán khi phù hợp.
- [x] Sau khi quay lại từ VNPAY, giao diện lấy trạng thái từ backend; backend chỉ xác nhận đăng ký khi payment đã được xác minh.
- [x] Thời hạn hoàn tiền ở backend là 2 giờ kể từ `enrolledAt`, không tính từ lúc tạo checkout.
- [x] Server từ chối yêu cầu quá hạn và khóa trạng thái payment để ngăn yêu cầu hoàn tiền đồng thời.
- [x] Khi VNPAY xác nhận refund, đặt payment thành `REFUNDED`, xóa enrollment/tiến độ và đưa trang khóa học về trạng thái có thể mua lại.
- [x] Trang kết quả giao dịch hiển thị rõ trạng thái đã hoàn tiền và liên kết trở lại khóa học.
- [x] Cập nhật mô tả API và README về thời hạn 2 giờ.
- [x] Unit test kiểm tra deadline 2 giờ và từ chối yêu cầu đã hết hạn.
- [ ] Kiểm thử callback/IPN, chữ ký, số tiền, giao dịch lặp và hoàn tiền trên môi trường VNPAY sandbox.
- [x] Hiển thị thời gian còn lại để yêu cầu hoàn tiền trong 2 giờ từ lúc đăng ký.

**Nghiệm thu:** Không thể mở khóa học trả phí chỉ bằng cách quay về trang thành công hoặc sửa tham số phía trình duyệt. Người học có thể gửi yêu cầu hoàn tiền trong vòng 2 giờ kể từ lúc đăng ký; yêu cầu quá hạn bị backend từ chối và trạng thái hiển thị khớp với backend.

### Giai đoạn 4 — Đóng gói và thiết lập môi trường Docker Compose
**Độ khó: Trung bình**

- [x] Tạo Dockerfile phát triển cho backend và frontend.
- [x] Tạo Docker Compose cho frontend, backend và PostgreSQL; có named volume dữ liệu và healthcheck database.
- [x] Đợi database khỏe trước khi backend chạy migration và khởi động.
- [x] Cung cấp `.env.example` với giá trị mẫu; loại `.env` khỏi Docker build context.
- [x] Ghi hướng dẫn dựng/dừng môi trường trong README backend.
- [x] Truyền cấu hình S3-compatible storage và VNPAY sandbox qua `.env`, không đóng gói secret vào image.
- [x] Xác minh cú pháp và cấu hình bằng `docker compose config --quiet`.
- [x] Build image backend và frontend sau các thay đổi mới nhất.
- [ ] Xác minh khởi động end-to-end. PostgreSQL báo healthy nhưng kết nối TCP từ backend tới `database:5432` bị timeout trong workspace (Prisma `P1001`); cần thử lại trên Docker host có network liên-container hoạt động.

**Nghiệm thu:** Thành viên mới có thể làm theo hướng dẫn để dựng frontend, backend và database bằng Docker Compose; dữ liệu database còn sau khi khởi động lại và secret không bị đóng gói vào image hoặc commit.

### Giai đoạn 5 — Tự động chuyển video sang HLS
**Độ khó: Trung bình–Khó**

- [x] Chọn FFmpeg để chuyển video ngay trong luồng upload hiện tại.
- [x] Nhận video nguồn `.mp4`, `.mov`, `.mkv`, `.webm`, tạo playlist `.m3u8` và segment.
- [x] Chỉ lưu tham chiếu asset sau khi chuyển đổi và upload thành công; xóa file tạm khi hoàn tất hoặc có lỗi.
- [x] Smoke-test tạo playlist và segment HLS bằng FFmpeg trong backend image.
- [ ] Chuyển xử lý sang worker nền, theo dõi trạng thái và hỗ trợ retry an toàn trước khi dùng cho video lớn/tải cao.
- [ ] Kiểm thử video nguồn thực, upload vào storage và phát trên trình duyệt hỗ trợ HLS gốc/HLS.js.

**Nghiệm thu:** Giảng viên tải lên một video nguồn và nhận được video HLS phát được; lỗi xử lý không để lại bài học ở trạng thái sẵn sàng giả.

### Giai đoạn 6 — Bảo vệ video lưu trên storage
**Độ khó: Khó**

- [x] Thiết kế storage private; loại bỏ URL object trực tiếp khỏi phản hồi khóa học.
- [x] Chỉ cấp playback ticket sau khi xác thực và kiểm tra quyền đăng ký/giảng viên.
- [x] Ticket HMAC có thời hạn ngắn; playlist và từng segment đều được proxy và kiểm tra ticket.
- [x] Trình phát lấy URL playback có thời hạn và yêu cầu ticket mới khi hết hạn.
- [ ] Xác minh policy bucket private trên storage triển khai và kiểm thử quyền truy cập đầy đủ trên staging.

**Nghiệm thu:** Người không có quyền không thể tải playlist/segment trực tiếp từ storage/CDN; người có quyền phát được video trong thời hạn cho phép. Ghi chú: giải pháp này hạn chế chia sẻ URL, không thể ngăn tuyệt đối việc quay màn hình.

### Giai đoạn 7 — Gợi ý khóa học phiên bản đầu
**Độ khó: Khó**

- [x] Dùng tìm kiếm, lượt xem, tiến độ, khóa học đã đăng ký, danh mục, thẻ, mức độ phổ biến và đánh giá làm tín hiệu xếp hạng.
- [x] Tạo API gợi ý chỉ trả về khóa học đang xuất bản và chưa đăng ký, ưu tiên nội dung liên quan đến tín hiệu của người học.
- [x] Bổ sung giao diện “Gợi ý cho bạn” và phương án dự phòng cho người dùng mới.
- [x] Giới hạn số lượng kết quả; truy vấn chỉ lấy khóa học đang xuất bản và loại khóa học đã đăng ký.
- [x] Xếp hạng có tính tới độ tin cậy của điểm sao và dùng kết quả phổ biến/chất lượng làm fallback khi thiếu hành vi.

**Nghiệm thu:** API trả về danh sách hợp lệ, có thứ tự ổn định theo quy tắc đã chọn và có kết quả dự phòng khi người dùng chưa có dữ liệu hành vi.

### Giai đoạn 8 — Đo lường và cá nhân hóa gợi ý
**Độ khó: Rất khó**

- [x] Ghi nhận impression/click và cung cấp metrics impressions, clicks, CTR qua endpoint ADMIN.
- [x] Ghi nhận đăng ký sau click gợi ý và hoàn thành bài học sau click trong cửa sổ attribution 30 ngày; ADMIN xem impression/click/đăng ký/hoàn thành và các tỷ lệ tương ứng.
- [ ] Đặt chính sách lưu trữ sự kiện và quyền riêng tư phù hợp trước khi triển khai thật.
- [ ] Thử nghiệm các cách xếp hạng và so sánh với phiên bản gợi ý theo luật.
- [ ] Chỉ cân nhắc mô hình học máy khi dữ liệu đủ chất lượng; theo dõi chất lượng, độ trễ và hành vi lệch của hệ thống.

**Nghiệm thu:** Có báo cáo đo lường trước/sau và phương án quay lại cách xếp hạng ổn định nếu chất lượng giảm.

### Giai đoạn 9 — Đánh giá và tài liệu khóa học
**Độ khó: Trung bình**

- [x] Học viên đã đăng ký có thể đánh giá 1–5 sao và bình luận; mỗi học viên có một đánh giá cho mỗi khóa học và có thể cập nhật.
- [x] Hiển thị điểm trung bình, số lượt đánh giá và bình luận trên chi tiết khóa học; điểm đánh giá được dùng trong xếp hạng gợi ý.
- [x] Giảng viên có thể tải PDF, Office, TXT, CSV hoặc ZIP tối đa 25 MB mỗi file lên khóa học.
- [x] Tài liệu lưu trong private storage, chỉ học viên đã đăng ký hoặc giảng viên/quản trị viên được phép tải qua API.

**Nghiệm thu:** Backend kiểm tra quyền đăng ký trước khi tạo đánh giá/tải tài liệu; file tài liệu không có URL object công khai.

### Giai đoạn 10 — Quản lý khóa học, refund tự động và điều hướng
**Độ khó: Trung bình–Khó**

- [x] Soft-delete khóa học không xóa dữ liệu giao dịch/lịch sử; khóa học đã ẩn không thể khôi phục hoặc chỉnh sửa.
- [x] Loại khóa học đã ẩn khỏi catalog/gợi ý; học viên còn enrollment vẫn truy cập trong lúc chờ VNPAY.
- [x] Tự gửi refund cho giao dịch đã thanh toán khi giảng viên ẩn khóa học; bỏ giới hạn 2 giờ của refund tự phục vụ.
- [x] Chỉ chuyển payment sang `REFUNDED` và gỡ enrollment/tiến độ sau xác nhận thành công từ VNPAY; trả trạng thái lỗi/chờ minh bạch nếu VNPAY chưa xác nhận.
- [x] Thống kê giảng viên gồm hoạt động học 30 ngày, doanh thu đã thanh toán, đánh giá và học viên; hỗ trợ sắp xếp tăng/giảm.
- [x] Thống kê ADMIN gồm tài khoản, khóa học đang hoạt động và số tài khoản có hoạt động trong 5 phút gần nhất.
- [x] Thêm mục Thống kê, Phản hồi và Về chúng tôi vào thanh điều hướng; bổ sung các trang tương ứng.
- [ ] Kiểm thử refund hàng loạt và thống kê trên VNPAY sandbox/staging với nhiều giao dịch và các trường hợp gateway từ chối hoặc timeout.

**Nghiệm thu:** Khóa học được ẩn khỏi menu chính ngay sau thao tác; mỗi giao dịch chỉ được ghi nhận hoàn tiền sau xác nhận của VNPAY và quyền học không bị thu hồi sớm.

## Thứ tự ưu tiên đề xuất

1. Build image mới và xác minh khởi động Docker Compose trên host có Docker bridge hoạt động.
2. Cấu hình VNPAY sandbox và chạy kiểm thử callback/IPN/refund end-to-end.
3. Kiểm thử FFmpeg transcoding, HLS playback và private storage trên staging.
4. Chạy kiểm thử quyền playback và luồng học/tiến độ với tài khoản ở các vai trò khác nhau.
5. Theo dõi metrics gợi ý thực tế trước khi cân nhắc thay đổi thuật toán hoặc dùng ML.

## Điều kiện trước khi triển khai thật

- Cấu hình riêng và an toàn cho thông tin xác thực storage, VNPAY và database; không ghi secret vào mã nguồn hoặc tài liệu.
- Dùng bucket private và kiểm tra quyền truy cập thực tế trên môi trường triển khai.
- Có log/giám sát cho lỗi thanh toán, xử lý video và cấp quyền phát; tránh ghi token hoặc URL ký nhạy cảm vào log.
- Chạy kiểm thử luồng đăng ký, thanh toán/hoàn tiền 2 giờ và quyền xem video trên môi trường staging trước khi phát hành.
