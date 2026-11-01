# Hệ thống Điểm danh Sinh viên Tự động bằng Nhận diện Khuôn mặt

<a href="https://github.com/nghiemmmm/Online-Attendance-System/actions" target="_blank"><img src="https://github.com/nghiemmmm/Online-Attendance-System/actions/workflows/ci.yml/badge.svg" alt="CI - Run Tests"></a>
<a href="https://github.com/nghiemmmm/Online-Attendance-System/actions" target="_blank"><img src="https://github.com/nghiemmmm/Online-Attendance-System/actions/workflows/deploy.yml/badge.svg" alt="Deploy to EC2"></a>

**Hệ thống Điểm danh Sinh viên Tự động bằng Nhận diện Khuôn mặt (Online Attendance System with AI Face Recognition)** là một giải pháp chuyển đổi số toàn diện trong quản lý giáo dục. Hệ thống tự động hóa hoàn toàn quy trình điểm danh truyền thống bằng cách tích hợp camera thời gian thực qua WebRTC và đối soát danh tính siêu tốc qua mô hình học sâu (FaceNet, MTCNN) kết hợp cơ sở dữ liệu vector FAISS dưới 0.01 giây. Dự án hỗ trợ đắc lực cho Giảng viên trong việc kiểm soát chuyên cần lớp học, giúp Sinh viên tự thực hiện check-in nhanh chóng, minh bạch, đồng thời cung cấp cho Quản trị viên bức tranh thống kê toàn cảnh và nhật ký hoạt động bảo mật.

## Công nghệ & Tính năng

### 🛠️ Công nghệ cốt lõi (Tech Stack)
* **Backend:** [FastAPI](https://fastapi.tiangolo.com) (Python 3.11), [SQLModel](https://sqlmodel.tiangolo.com), [PostgreSQL](https://www.postgresql.org).
* **AI & Thị giác máy tính:** [PyTorch](https://pytorch.org), **MTCNN** (phát hiện khuôn mặt), **FaceNet** (trích xuất vector 512 chiều), **FAISS** (tìm kiếm vector siêu tốc).
* **Frontend:** [Next.js 16](https://nextjs.org) (React 19), [TypeScript](https://www.typescriptlang.org), [Tailwind CSS](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com).
* **Lưu trữ & Hệ thống:** [Cloudinary](https://cloudinary.com) (CDN lưu trữ ảnh), Redis Cache, Docker & Docker Compose.
* **CI/CD & DevOps:** GitHub Actions (Automated Test, Build & Deploy EC2), Nginx Reverse Proxy.

### ✨ Tính năng nổi bật
* 🎯 **Điểm danh AI thời gian thực:** Nhận diện khuôn mặt trực tiếp qua camera WebRTC với tốc độ tra cứu < 0.01s.
* 🔐 **Bảo mật & Phân quyền:** Xác thực JWT (Access & Refresh Token), phân quyền chặt chẽ 3 vai trò (Admin, Giảng viên, Sinh viên).
* 📝 **Quản lý & Khiếu nại chuyên cần:** Quản lý lớp học phần, lịch học, gửi và duyệt đơn khiếu nại kèm minh chứng ảnh.
* 🧹 **Tự động hóa dọn dẹp:** Background worker tự động xóa ảnh điểm danh quá hạn sau 48 giờ để tối ưu lưu trữ.
* 📊 **Báo cáo & Thống kê:** Xuất báo cáo chuyên cần lớp học và theo dõi nhật ký hoạt động hệ thống.

## Giao diện Dự án

### Trang Đăng nhập & Đăng ký
| Đăng nhập | Đăng ký |
| :---: | :---: |
| ![Đăng nhập](img/login.jpg) | ![Đăng ký](img/register.jpg) |

### Dashboard theo Vai trò
*   **Quản trị viên / Cán bộ (Admin/Staff):**
    ![Dashboard Admin](img/dashboard-staff.jpg)
*   **Giảng viên (Lecturer):**
    ![Dashboard Giảng viên](img/dashboard-lecturer.jpg)
*   **Sinh viên (Student):**
    ![Dashboard Sinh viên](img/dashboard-student.jpg)

---

## Kiến trúc Hệ thống & Quy trình CI/CD

### Sơ đồ kiến trúc nhận diện khuôn mặt và WebRTC
![Kiến trúc Hệ thống](img/system-architecture.png)

### Sơ đồ quy trình CI/CD kiểm thử và deploy
![Quy trình CI/CD](img/CICD%20(2).png)

---

## API Overview

Hệ thống cung cấp tập hợp các Restful API hỗ trợ đầy đủ luồng nghiệp vụ xác thực, điểm danh WebRTC AI, khiếu nại và báo cáo. Dưới đây là các nhóm API cốt lõi:

### 1. Xác thực & Quản lý phiên (`/auth` & `/sessions`)
*   `POST /auth/tokens`: Đăng nhập chuẩn JSON (hỗ trợ Remember Me cấp Refresh Token).
*   `POST /auth/access-tokens`: Đăng nhập tương thích OAuth2 Password Flow.
*   `POST /auth/token-refreshes`: Cấp mới Access Token từ Refresh Token hợp lệ.
*   `DELETE /sessions/current`: Đăng xuất phiên hiện tại (thu hồi Refresh Token hiện tại).
*   `DELETE /sessions`: Đăng xuất tất cả các thiết bị.

### 2. Đăng ký & Tài khoản (`/users`)
*   `POST /users/send-otp`: Yêu cầu gửi mã OTP xác thực về email sinh viên.
*   `POST /users/registrations`: Đăng ký tài khoản sinh viên sau khi xác thực mã OTP thành công.
*   `POST /users/signup`: Đăng ký tài khoản và tự động tạo hồ sơ sinh viên đi kèm.
*   `GET /users/me/profile`: Đọc hồ sơ cá nhân và trạng thái dữ liệu khuôn mặt.

### 3. Điểm danh AI & Camera Live (`/webrtc` & `/attendance`)
*   `POST /webrtc/offers`: Thiết lập kết nối WebRTC truyền luồng video từ camera lên server AI.
*   `GET /class-sections/my-sections`: Lấy danh sách lớp học phần đã đăng ký (sinh viên) hoặc giảng dạy (giảng viên).
*   `POST /class-sessions/{id}/attendance`: Điểm danh thủ công hoặc ghi nhận điểm danh tự động.

### 4. Khiếu nại Chuyên cần (`/appeals`)
*   `POST /appeals`: Sinh viên tạo đơn khiếu nại (kèm lý do và minh chứng ảnh).
*   `PATCH /appeals/{id}`: Giảng viên duyệt đơn khiếu nại (chấp nhận/từ chối).

---

## Cấu hình dự án

### ⚙️ Cấu hình Biến Môi trường (.env)
Trước khi khởi chạy hệ thống, hãy tạo file `.env` từ file mẫu [`.env.example`](./.env.example):
```bash
cp .env.example .env
```

Các biến môi trường cốt lõi cần lưu ý:
- `SECRET_KEY`: Chuỗi khóa bí mật dùng để mã hóa mã thông báo JWT.
- `FIRST_SUPERUSER` & `FIRST_SUPERUSER_PASSWORD`: Email và mật khẩu tài khoản Admin khởi tạo ban đầu.
- `DATABASE_URL`: Chuỗi kết nối PostgreSQL (Mặc định: `postgresql://postgres:postgres@localhost:5432/attendance_db`).
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Thông tin cấu hình lưu trữ ảnh Cloudinary.

---

## Hướng dẫn Khởi chạy Dự án

### 🚀 Cách 1: Khởi chạy Nhanh với Docker Compose (Khuyên dùng)
Chạy toàn bộ dịch vụ (FastAPI Backend, Next.js Frontend, PostgreSQL, Redis, Nginx) chỉ với 1 câu lệnh:
```bash
docker compose up -d --build
```
- **Frontend Web App:** [http://localhost:3000](http://localhost:3000)
- **Backend API & Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 💻 Cách 2: Khởi chạy Thủ công (Local Development)

#### 1. Khởi chạy Backend (FastAPI)
```bash
# Tạo và kích hoạt môi trường ảo Python
python -m venv venv
venv\Scripts\activate  # Trên Windows (hoặc: source venv/bin/activate trên Linux/macOS)

# Cài đặt các thư viện phụ thuộc
pip install -r requirements.txt

# Thực thi Migration cấu trúc CSDL
alembic upgrade head

# Khởi chạy máy chủ API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### 2. Khởi chạy Frontend (Next.js)
```bash
cd frontend

# Cài đặt các gói dependencies
npm install

# Khởi chạy giao diện chế độ Development
npm run dev
```

---

## 📖 Tài liệu API & Kiểm thử (API Docs & Testing)

### 1. Tài liệu API Tương tác (Interactive Docs)
Sau khi khởi chạy Backend, bạn có thể kiểm thử trực tiếp các API tại:
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

### 2. Chạy Kiểm thử Tự động (Automated Tests)
- **Kiểm thử Backend (Pytest & Coverage):**
  ```bash
  pytest --cov=app --cov-report=term-missing tests/
  ```
- **Kiểm thử Frontend (Jest):**
  ```bash
  cd frontend
  npm test
  ```

---

## Hạn chế Hiện tại

1.  **Hiệu năng đồng thời ⭐⭐⭐⭐⭐**: Gặp độ trễ xử lý khi nhiều sinh viên thực hiện nhận diện khuôn mặt cùng lúc.
2.  **Độ chính xác phụ thuộc môi trường ⭐⭐⭐⭐⭐**: Ảnh hưởng bởi ánh sáng yếu, góc nghiêng lớn, chất lượng camera hoặc khi sinh viên đeo khẩu trang, kính.
3.  **Chưa hỗ trợ Liveness Detection ⭐⭐⭐⭐⭐**: Chưa tích hợp kiểm tra thực thể sống nên có nguy cơ bị gian lận bằng hình ảnh hoặc video.

---

## Thông tin Đồ án & Bản quyền

Dự án này là sản phẩm **Đồ án môn học Thực tập cơ sở (TTCS)**, được xây dựng và phát triển phục vụ mục đích học tập, nghiên cứu và trình diễn giải pháp công nghệ điểm danh tự động ứng dụng Trí tuệ nhân tạo (AI).