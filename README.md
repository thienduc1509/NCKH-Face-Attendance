# NCKH Face Attendance

Ứng dụng web hỗ trợ điểm danh sinh viên bằng nhận dạng khuôn mặt. Bản phát triển phục vụ nghiên cứu khoa học sinh viên; hiện vẫn đang thử nghiệm, chưa phải sản phẩm triển khai chính thức.

## Nguồn mã và đóng góp

Kế thừa từ [nghiemmmm/Online-Attendance-System](https://github.com/nghiemmmm/Online-Attendance-System), commit nền `528fc2e`; giữ lịch sử tác giả gốc. Người công bố xác nhận đã được các bên có quyền đồng ý sử dụng, sửa đổi và công bố. Xem [SOURCE_NOTES.md](SOURCE_NOTES.md) và [README gốc](docs/README.upstream.md).

Những thay đổi local: sửa tạo tài khoản/hồ sơ, xử lý phiên đăng nhập hết hạn, bổ sung migrations, lọc đăng ký lớp khi điểm danh, sửa múi giờ, xác nhận ba lần nhận dạng liên tiếp ở nhánh WebRTC, sửa preview camera, cập nhật phiên đang mở cho sinh viên và bổ sung kiểm thử nghiệp vụ.

MTCNN/FaceNet và FAISS là thành phần có sẵn; không tuyên bố mô hình do nhóm huấn luyện hoặc toàn bộ code do nhóm tự viết. Chưa áp giấy phép mới cho phần mã kế thừa.

## Chạy trên máy bằng Docker Desktop

Cài Git và Docker Desktop, bật Linux containers. Sau đó mở PowerShell:

```powershell
git clone https://github.com/thienduc1509/NCKH-Face-Attendance.git
cd NCKH-Face-Attendance
.\Start-Local.ps1 -Build
```

Lần build đầu cần Internet để tải thư viện; mô hình nhận diện được tải khi sử dụng lần đầu và lưu trong Docker volume. Dockerfile.local trong bản public tự build từ Python, không cần image benchmark trên máy tác giả. Không cần tạo .env để chạy cấu hình local này.

Web: http://localhost:3000
API: http://localhost:8000/api/docs

Admin local: `admin@example.com` / `DemoLocal2026!`. Đây là tài khoản mẫu công khai, chỉ dùng trên localhost. Không dùng cấu hình demo để mở dịch vụ Internet.

Nếu PowerShell chặn script, chạy các lệnh tương đương:

```powershell
docker compose -f compose.local.yml build
docker compose -f compose.local.yml up -d postgres redis
docker compose -f compose.local.yml run --rm backend alembic upgrade head
docker compose -f compose.local.yml run --rm backend python -m app.initial_data
docker compose -f compose.local.yml up -d
```

Những lần sau: `.\Start-Local.ps1`. Dừng: `docker compose -f compose.local.yml stop`. Xem lỗi: `docker compose -f compose.local.yml logs --tail 100 backend frontend`. Các volume giữ database, ảnh và model qua lần khởi động. Không dùng `down -v` nếu muốn giữ dữ liệu.

## Tạo dữ liệu demo tùy chọn

Sau khi ứng dụng chạy:

```powershell
docker compose -f compose.local.yml exec -T backend python seed_local_demo.py
```

Tạo 1 giảng viên (`gv.demo@example.com`), 5 sinh viên (`sv.demo01@example.com` đến `sv.demo05@example.com`), 2 lớp và bản ghi chuyên cần giả lập. Mật khẩu chung `DemoLocal2026!`. Không có ảnh khuôn mặt thật trong repository; tự đăng ký ảnh người đồng ý tham gia thử nghiệm.

## Quy trình thử

Admin tạo sinh viên, đăng ký ảnh và thêm vào lớp. Giảng viên mở đúng buổi học và bật camera lớp. Hoặc sinh viên đăng nhập riêng để tự xác minh trong cùng ID buổi học. Xem trạng thái cập nhật và xuất CSV/Excel. Camera lớp và camera sinh viên là hai cách nhập liệu, không phải hệ thống họp video giữa các tài khoản.

Luồng WebRTC xác nhận cùng danh tính ở ba lần xử lý liên tiếp; nhánh xác minh ảnh đơn có hành vi riêng. Chưa có chống giả mạo bằng ảnh/video; chưa đánh giá lớp học thật hoặc nhiều camera đồng thời. Dữ liệu demo không phải kết quả nhận diện thực tế.

## Kiểm thử

`check_application_flows.py` và `check_active_sessions.py` cần dữ liệu demo trên PostgreSQL; chúng kiểm tra trong giao dịch rollback:

```powershell
Get-Content check_application_flows.py -Raw | docker compose -f compose.local.yml exec -T backend python -
Get-Content check_active_sessions.py -Raw | docker compose -f compose.local.yml exec -T backend python -
```

Một số kiểm tra trong script active sessions gắn với dữ liệu demo cụ thể; điều chỉnh ID/ngày nếu dataset khác. Kiểm thử API dùng dependency override, không thay cho kiểm thử đăng nhập hay camera đầu cuối.

Workflow CI/deploy gốc được lưu tại `docs/upstream-workflows` để tham khảo; bản public không tự deploy lên hạ tầng tác giả gốc. Tài liệu và báo cáo riêng, dữ liệu LFW, ảnh sinh viên, vector, .env, cache và thư viện cài sẵn không được đưa vào bản công bố.
