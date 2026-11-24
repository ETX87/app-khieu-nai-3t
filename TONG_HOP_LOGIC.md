# Tổng hợp logic — App Khiếu nại 3T ("Tiếp nhận phản ánh", Worker `tiepnhan`)

> Mô tả logic **đang chạy thật** (theo code tới 17/11/2026). Kế hoạch các giai đoạn tiếp theo: `BAO-CAO-KE-HOACH-TON-VI-PHAM-DOI-MAY.md`.
> Logic đổi thì sửa đè đúng mục; lịch sử ở `nhat_ky_lam_viec.md`. Không ghi tài khoản, mật khẩu, khoá.

## 1. Hệ thống là gì

- Ghi nhận và xử lý **phản ánh / khiếu nại của khách hàng** (nguồn CRM 3T, Lada NSKX, PLP) tới khi chốt kết luận lỗi.
- 1 Worker (Hono) + D1 + giao diện React (VI / EN / ID). Google OAuth, tài khoản mới chờ Admin duyệt. Ảnh / video đính kèm lưu Google Drive.

## 2. Vai trò

| Vai trò | Quyền chính |
|---|---|
| NV Sale, Tổng đài viên | Tạo phản ánh, theo dõi ca mình tạo (Admin bật "xem tất cả" thì xem — chỉ đọc — mọi ca) |
| CSKH | Tạo, tiếp nhận, cập nhật tiến trình / giải trình, đánh giá lỗi, hủy ca |
| TN CSKH | Như CSKH + **Đóng ca** (gửi QL chốt) |
| QL | Như TN CSKH + **Chốt kết thúc** (cả chốt thẳng, chốt hàng loạt ≤ 100 ca) |
| Admin | Toàn quyền, mở lại ca đã kết thúc |
| Viewer | Chỉ xem + báo cáo |

Mỗi người chọn công ty mặc định (Lada / CRM / PLP) → nguồn mặc định khi tạo và lọc.

## 3. Luồng trạng thái ca

`Cho tiep nhan` → (CSKH tiếp nhận, thành người phụ trách) → `Dang xu ly` → (TN CSKH "Đóng ca") → `Cho chot ket thuc` →
(QL chốt + đánh giá QL) → `Da ket thuc`. `Huy` từ các bước mở. Admin mở lại ca đã kết thúc.

- **Đóng ca / chốt** bắt buộc đã đánh giá đủ 4 lỗi (nhà sản xuất, lắp đặt, thái độ KTV, quy trình NSKX) + kết luận khiếu nại
  (`CAN_DANH_GIA_DAY_DU`); nút "Xác nhận không lỗi" đặt cả 5 mục = Không. Chốt cần "Đánh giá QL" (mặc định "Đã hoàn thành" khi chốt hàng loạt).
- QL / Admin được chốt thẳng từ `Dang xu ly`. Chốt ghi giờ xử lý hệ thống (từ tiếp nhận tới kết thúc).
- **Giải trình lý do chậm mỗi 24 giờ**: tính từ lần giải trình gần nhất (chưa có thì từ lúc tiếp nhận); quá hạn thì ca bị khoá sửa /
  đóng / chốt (`QUA_HAN_GIAI_TRINH`) tới khi thêm dòng tiến trình có lý do + nội dung giải trình.
- Mọi thay đổi trường / trạng thái ghi `khieu_nai_lich_su`.

## 4. Tra cứu & nhận diện ca

- Tạo ca: tra theo **ID CRM** (gọi DVBH qua Service Binding, lấy thông tin ca + lịch sử giải trình), **ID Lada** (API Ecolada),
  **ID truy xuất** (chỉ tra nội bộ — hệ ngoài không nhận mã này). Điền sẵn thông tin khách, cảnh báo ca gần đây cùng khách.
- Phân loại KH Thường / VIP / VIP > 6H; nhóm yêu cầu, vấn đề đầu vào theo danh mục `settings_option`.
- Báo cáo "trùng lặp" phát hiện ca lặp của cùng khách / sản phẩm.

## 5. Đồng bộ & nền tảng lỗi vi phạm (giai đoạn 1 — đã chạy)

- Lịch ngày nghỉ (Chủ nhật + lễ Việt Nam) và cách tính **48 giờ bỏ CN / lễ** (`lib/gioTinh.ts`).
- Cron mỗi giờ (`15 0-15,23 * * *` UTC): đồng bộ CRM cho tối đa 35 ca tồn / lần (bỏ ca vừa đồng bộ trong 50 phút) + mốc chốt đơn
  "ID Lada phát sinh" cho ca đang mở. Có nút "đồng bộ các ca tồn" bấm tay.
- Quy tắc lỗi đã chốt (L1a quá 48h chưa xử lý, L1b quá 48h chưa xử lý tiếp, L2 chậm đóng ca sau khi CRM / Lada đóng) — **chưa sinh lỗi**,
  đang ở kế hoạch giai đoạn sau (xem file báo cáo kế hoạch).

## 6. Báo cáo

3 tab: Tổng quan tháng · Vận hành hằng ngày · Tốc độ xử lý; thêm báo cáo SLA, chốt lỗi, theo người dùng, theo người tiếp nhận, theo
ngày (dùng ảnh chụp tồn đọng hằng ngày). Bấm số liệu → xem danh sách ca tương ứng. Lọc theo tỉnh / huyện / nhóm yêu cầu / loại lỗi đã chốt.

## 7. Lịch chạy tự động

| Lịch (UTC) | Việc |
|---|---|
| `15 0-15,23 * * *` | Đồng bộ CRM + Lada phát sinh cho ca tồn |
| `0 20 * * *` (03:00 VN) | Đồng bộ ETX nhân sự + chụp tồn đọng hằng ngày cho báo cáo |

## 8. Kết nối hệ khác

DVBH (tra ca CRM, Service Binding `DVBH_SERVICE`) · Ecolada (tra ID Lada) · ETX nhân sự · Google Drive · Web Push (chuông thông báo theo vai trò).

## 9. Tài liệu liên quan

`SRS_tong_hop.md`, `nhat_ky_lam_viec.md`, `DESIGN_SYSTEM.md`, `KE-HOACH-SUA-UX.md`, `BAO-CAO-KE-HOACH-TON-VI-PHAM-DOI-MAY.md`.

## Cửa sổ thông tin eOffice (popup Giám đốc)

`GET /api/cua-so` (không cần đăng nhập) → Worker gọi `csApi` eOffice bằng secret `CUA_SO_KHOA`, đệm 60 giây, kèm tranh SVG. Frontend `CuaSoThongTin` hiện mỗi lần mở app (và khi quay lại sau ≥ 10 phút ẩn), nút "Vào app" khoá theo `khoaNutGiay`. Lỗi / chậm / chưa có khoá → không hiện, vào app bình thường. Cùng 1 bộ mã ở mọi app hệ DVBH (bản gốc ở linh-kien-app).
