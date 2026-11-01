# Nguồn kế thừa và tình trạng công bố

Cập nhật 31/10/2026.

- Repository nền: https://github.com/nghiemmmm/Online-Attendance-System . Giữ nguyên remote và lịch sử gốc.
- Metadata GitHub ngày kiểm tra trả license=null; bản checkout chưa thấy giấy phép ở thư mục gốc. File này không cấp quyền sử dụng hoặc thay thế giấy phép của tác giả.
- Theo thông tin người dùng cung cấp, đề tài NCKH kế thừa sản phẩm/ý tưởng Thực tập cơ sở của Nguyễn Lê Thiện Đức. Chưa có bản nguồn của sản phẩm đó trong lần đối chiếu này; chưa xác nhận quan hệ giữa hai sản phẩm.
- Cần xác nhận sự đồng ý sử dụng, sửa đổi và công bố từ người có quyền trước khi đăng bản sao đã sửa độc lập lên tài khoản khác. Ghi nguồn không thay thế quyền sử dụng. Fork trong GitHub cần được phân biệt với quyền tái phân phối rộng hơn.
- Phần sửa local ngày 31/10/2026: sửa đường dẫn/payload tạo tài khoản và khóa tài khoản; lưu tài khoản-hồ sơ trong một giao dịch; báo lỗi trùng rõ hơn; bổ sung xác nhận nhận dạng ba lần liên tiếp ở WebRTC; ngăn xử lý chồng cho một track; lọc đăng ký lớp; sửa timezone ghi điểm danh; bổ sung openpyxl; kiểm thử ứng dụng và viết lại báo cáo theo quy trình sử dụng.
- Không tuyên bố mô hình FaceNet/MTCNN là thuật toán mới của nhóm. Không tuyên bố toàn bộ repository do nhóm NCKH tự viết.
- Kết quả 27 kiểm tra: ../output/app_checks_20261031.json. Kiểm thử giao diện tạo tài khoản đã chạy, tài khoản local demo.ui.20261031 được giữ lại để nhận biết.
- Ảnh LFW và dữ liệu chuyên cần demo cần tách rõ với thử nghiệm sinh viên thực tế. Không đưa dữ liệu nhạy cảm, .env hoặc mật khẩu triển khai thật lên repository công khai.

Hướng dẫn GitHub về giấy phép: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository .

## Xác nhận của người công bố

Ngày 01/11/2026, người dùng tài khoản công bố xác nhận các bên có quyền đã đồng ý cho sử dụng, sửa đổi và đưa mã nguồn lên repository public. Đây là ghi nhận thông tin do người dùng cung cấp, không phải giấy phép mới cho mọi bên thứ ba. Giữ lịch sử Git gốc; không đổi quyền tác giả phần kế thừa. Commit nền: 528fc2e.
