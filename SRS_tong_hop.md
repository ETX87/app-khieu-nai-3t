# SRS tổng hợp — App Khiếu nại 3T ("Tiếp nhận phản ánh")

> Đặc tả yêu cầu **đã chốt** (theo code tới 17/11/2026 + quyết định 28/10/2026 trong `BAO-CAO-KE-HOACH-TON-VI-PHAM-DOI-MAY.md`).
> Logic chi tiết: `TONG_HOP_LOGIC.md`.

## 1. Mục tiêu

Mọi phản ánh / khiếu nại của khách được ghi nhận 1 chỗ, có người phụ trách, giải trình đúng hạn, đánh giá lỗi rõ ràng (nhà sản xuất,
lắp đặt, thái độ KTV, quy trình) và được quản lý chốt; số liệu báo cáo phản ánh đúng tốc độ xử lý và tồn đọng.

## 2. Người dùng

NV Sale, Tổng đài viên, CSKH, TN CSKH, QL, Admin, Viewer (quyền ở `TONG_HOP_LOGIC.md` §2). Đăng nhập Google, Admin duyệt tài khoản.

## 3. Màn hình

| Màn | Yêu cầu chính |
|---|---|
| Trang chủ | Số ca theo trạng thái, việc của tôi |
| Phản ánh (danh sách) | Lọc nhanh 1 dòng (trạng thái, Thường / VIP / VIP > 6H, nhóm yêu cầu, nhiều mốc tồn), bảng kéo đổi độ rộng cột (lưu trên máy), mỗi dòng gọn 1 dòng; icon theo loại lỗi |
| Tạo phản ánh | Tra ID CRM / ID Lada / ID truy xuất để điền sẵn; nhớ Nguồn chọn gần nhất; đính kèm ảnh / video |
| Chi tiết phản ánh | Popup ~95% màn hình: thông tin ca + CRM, tiến trình / giải trình, đánh giá 4 lỗi + kết luận, đánh giá QL, đính kèm, lịch sử; nút theo vai trò (Tiếp nhận, Đóng ca, Chốt, Hủy, Mở lại, Đồng bộ CRM) |
| Báo cáo | Tổng quan tháng, Vận hành hằng ngày, Tốc độ xử lý, SLA, trùng lặp, chốt lỗi; bấm số → danh sách ca |
| Cấu hình | Danh mục lựa chọn, kết nối Google Drive, ngày nghỉ |
| Người dùng | Duyệt tài khoản, vai trò, "xem tất cả" cho NV Sale / Tổng đài viên, đồng bộ ETX |

## 4. Quy tắc nghiệp vụ

- Đóng ca / chốt khi đủ 4 lỗi + kết luận; chốt cần đánh giá QL.
- Giải trình lý do chậm mỗi 24 giờ; quá hạn khoá thao tác tới khi giải trình (dòng giải trình quá hạn bắt buộc có lý do + nội dung).
- Mốc 48 giờ của lỗi vi phạm tính bỏ Chủ nhật + ngày lễ (không theo khung giờ trong ngày).
- Lỗi vi phạm (giai đoạn sau): L1a quá 48h chưa xử lý, L1b quá 48h chưa xử lý tiếp (lặp mỗi 48h), L2 chậm đóng ca sau khi CRM / Lada đóng.

## 5. Yêu cầu chung

- Đa ngôn ngữ VI / EN / ID; mọi thời gian giờ Việt Nam.
- Dữ liệu CRM / Lada tự đồng bộ theo giờ cho ca tồn (không phụ thuộc người bấm).
- Báo cáo đọc khối lượng lớn phải có index phù hợp (lịch sử ca hàng triệu dòng).
