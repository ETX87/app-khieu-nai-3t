# Kế hoạch sửa UX hệ thống 3T

Nguồn: rà soát 08/09/2026 (64 phát hiện). Nhánh: `fix/ux-audit-2026-09`.

## Quyết định của chủ dự án (09/2026)

| # | Vấn đề | Quyết định | Hệ quả kế hoạch |
|---|--------|-----------|-----------------|
| 1 | D11 — "Ghi chú lý do chậm" vs "Giải trình chậm đổi máy" | **Là 2 báo cáo chậm khác nhau, giữ nguyên** | Không gộp. Chỉ làm rõ nhãn + hint để phân biệt. |
| 2 | D6 — Vai trò KTV | **Chỉ tài khoản được cấp quyền được vào "báo đơn"** → KTV = tạo đơn + xem | Giữ vai trò KTV ở mức tạo/xem. Không mở thêm quyền sửa. Sửa lỗi hiển thị mã thô. |
| 3 | C4 — Số điện thoại khách | **Để chờ, không bắt buộc** | Thêm cột `sdt_khach` cho phép NULL, ô nhập không bắt buộc. Không ép. |
| 4 | D4 — "Giờ xử lý" của QL | **Không cần loại trừ khoảng nào** | Bỏ ô nhập tay, hiển thị số giờ tự tính (tiếp nhận → kết thúc/hiện tại). |
| 5 | D1 — Trang riêng cho Chi tiết/Tạo | **Giữ modal, không cần URL riêng.** Gửi ID đơn cho ai cần xem, người đó tự tìm theo ID | Giữ modal. Thêm nút "Sao chép mã đơn". Bảo đảm tìm theo mã hoạt động tốt. |
| 6 | H1 — "Người phụ trách ca" (assignment) | **Đồng ý** | Thêm cột `nguoi_phu_trach` + gán/nhận ca + lọc "Ca của tôi" + hàng đợi Trang chủ. |

## Quy ước "đạt"

Mỗi hạng mục (WI) có mục **Đầu ra đạt** = danh sách kiểm tra thực tế trên app đang chạy. Chỉ đánh dấu `[x]` khi đã tự chạy app và xác nhận từng gạch đầu dòng. Sau mỗi batch: commit + tái kiểm thử + ghi kết quả vào mục "Nhật ký thực hiện" cuối file.

---

## BATCH P0 — chặn trải nghiệm cơ bản

### WI-05 · Mở rộng schema (tiền đề)
Migration `migrations/0005_ux_audit.sql`:
- `khieu_nai.sdt_khach TEXT` (NULL) — QĐ #3
- `khieu_nai.nguoi_phu_trach TEXT REFERENCES users(email)` (NULL) — QĐ #6
- `khieu_nai.ly_do_huy TEXT`, `nguoi_huy TEXT`, `ngay_huy TEXT` — D8
- `khieu_nai.ql_gio_xu_ly_he_thong NUMERIC` (số giờ chốt lại khi Chốt) — D4
- Bảng `khieu_nai_lich_su (id, khieu_nai_id, nguoi, thoi_diem, hanh_dong, truong, gia_tri_cu, gia_tri_moi)` — D9 (audit tối thiểu)

**Đầu ra đạt:**
- [ ] `npm run db:migrate:local` chạy sạch, không lỗi.
- [ ] `SELECT` các cột mới trên `khieu_nai` trả về (giá trị NULL) không lỗi.

### WI-01 · Combobox chuẩn bàn phím  ·  (C1, C6, C7, X2, X3, T1)
Viết lại `frontend/src/components/ui/Combobox.tsx`:
- Hooks đặt lên đầu (sửa T1 — không `return` trước hook).
- Bàn phím: `↑/↓` di chuyển mục tô sáng, `Enter` **hoặc** `Tab` chọn mục tô sáng rồi để focus đi tiếp tự nhiên, `Esc` đóng giữ giá trị cũ.
- `onBlur` = commit: nếu query khớp chính xác 1 nhãn → chọn; nếu `creatable` và query khác rỗng → tạo mới; nếu không khớp → hoàn về giá trị hợp lệ trước đó (không để text rác).
- Bỏ dòng hint cố định; chuyển vào `placeholder` ("Gõ để tìm / thêm mới…").
- Thay các `<select>` chọn-một trong `KhieuNaiForm` + `KhieuNaiDetail` (Model, Mức độ, Nhóm yêu cầu, Phân loại KH, Nhóm vấn đề, Vấn đề đầu vào, Kết quả đổi máy, Bộ phận bàn giao, Đánh giá QL) bằng Combobox. Giữ `<select>` gốc cho Có/Không/Chưa đánh giá và Cảm cờ.

**Đầu ra đạt:**
- [ ] Form Tạo KN: đặt con trỏ ô "Tên khách", chỉ dùng bàn phím (gõ + `↓` + `Tab`) đi hết form, mọi combobox lưu đúng giá trị, kết thúc submit được — **không chạm chuột**.
- [ ] Gõ dở ở 1 combobox rồi `Tab` sang ô khác: giá trị được commit (khớp) hoặc hoàn nguyên (không khớp) — không còn hiện tượng "MiềnNguyễn Văn Báo".
- [ ] `Enter` trong ô 1 dòng không submit form.
- [ ] Mở khu "Nhánh đổi máy" ngay sau khi tải trang (chưa mở màn khác) — không lỗi React, khu hiển thị bình thường (T1).
- [ ] Các ô cùng hàng canh mép đều (không lệch do hint).

### WI-02 · An toàn form Tạo  ·  (C2, C8, C9)
- `KhieuNaiForm`: `Enter` ở input 1 dòng → focus ô kế, không `submit`.
- Bắt buộc tối thiểu: `ten_khach`, `nhom_van_de`, `thong_tin_ban_dau`. Nút "Tạo" `disabled` tới khi đủ; hiện danh sách trường còn thiếu.
- Ô "Ngày tiếp nhận" (date, mặc định hôm nay, cho sửa) → gửi lên BE.
- Guard "còn thay đổi chưa lưu" khi đóng modal Tạo (Esc / nút ✕ / click nền).

**Đầu ra đạt:**
- [ ] Bấm "Tạo" khi form trắng → không tạo; hiện rõ "Còn thiếu: Tên khách, Nhóm vấn đề, Thông tin ban đầu".
- [ ] Nhập vài ký tự rồi Esc → hỏi "Bỏ khiếu nại đang nhập?".
- [ ] Chọn ngày tiếp nhận = hôm qua → ca tạo ra có đúng ngày đó.

### WI-03 · Đăng nhập &amp; phiên  ·  (A1, A2, A3, A4, T3)
- `api/client.ts`: bỏ hard-redirect vô điều kiện. Khi 401:
  - Nếu chưa từng có phiên trong app (cờ `hadSession` chưa set) → để `AuthContext` render `LoginScreen variant="anonymous"`.
  - Nếu đang có phiên (đã đăng nhập trước đó) → phát sự kiện `session-expired`; hiện overlay "Phiên đã hết hạn — Đăng nhập lại" (mở `/api/auth/login` ở tab hiện tại) **mà không xoá state form**.
- `LoginScreen`: thêm dòng liên hệ Admin + nút "Kiểm tra lại" / "Đăng nhập tài khoản khác" cho các biến thể pending/rejected/disabled.
- Auto-lưu nháp `KhieuNaiForm` vào `localStorage` (khoá `khieunai_draft_new`), khôi phục khi mở lại, xoá khi tạo thành công.

**Đầu ra đạt:**
- [ ] Mở app khi chưa đăng nhập (xoá cookie) → thấy màn 3T có logo + nút "Đăng nhập với Google", **không** nhảy thẳng sang Google.
- [ ] Đang điền form Tạo, xoá cookie phiên, bấm "Tạo" → form giữ nguyên nội dung + overlay đăng nhập lại.
- [ ] Reload giữa lúc điền form Tạo → nội dung được khôi phục từ nháp; sau khi tạo thành công, mở lại form → trống.

### WI-04 · Toàn vẹn hồ sơ &amp; hành động quyết định  ·  (D5, D7, D8, D16, X6, T4, T5)
Backend:
- `PATCH /khieu-nai/:id`: từ chối (409) nếu `trang_thai='Da ket thuc'` — trừ khi có cờ mở lại của Admin.
- `POST /khieu-nai/:id/chot`: yêu cầu `danh_gia_ql IS NOT NULL`; đồng thời ghi `ql_gio_xu_ly_he_thong`.
- `POST /khieu-nai/:id/huy`: nhận body `{ ly_do_huy }` bắt buộc; ghi `ly_do_huy/nguoi_huy/ngay_huy` + 1 dòng `khieu_nai_lich_su`.
- Mọi chuyển trạng thái ghi `khieu_nai_lich_su`.
- (Tuỳ chọn) `POST /khieu-nai/:id/mo-lai` (Admin) — chuyển "Đã kết thúc" → "Chờ chốt kết thúc", ghi lý do + lịch sử.
Frontend:
- Ca "Đã kết thúc": tất cả khu chỉ đọc + banner "Ca đã kết thúc — chỉ xem" (+ nút "Mở lại ca" cho Admin).
- Nút "Chốt" và "Hủy": hộp xác nhận có tóm tắt (mã đơn, kết luận, trạng thái đích). "Hủy" bắt chọn `ly_do_huy` từ danh mục + ghi chú.
- Cạnh nút "Đóng ca": checklist "✓/✗ Lỗi NSX · Lỗi lắp đặt · Lỗi thái độ KTV · Lỗi quy trình NSKX · Kết luận"; bấm mục ✗ cuộn tới ô đó.
- Toast lỗi không tự tắt + có nút đóng; sau chuyển trạng thái, trạng thái trên màn cập nhật ngay (không chỉ dựa toast).

**Đầu ra đạt:**
- [ ] Đăng nhập Admin, mở ca "Đã kết thúc" → không có nút Lưu nào, có banner; thử `PATCH` trực tiếp → 409.
- [ ] QL bấm "Chốt" khi `danh_gia_ql` trống → bị chặn, thông báo "Cần nhập Đánh giá QL trước khi chốt".
- [ ] Bấm "Hủy" → bắt chọn lý do; sau khi hủy, lý do hiển thị trong khu Tiến trình/lịch sử.
- [ ] Nút "Đóng ca" bị mờ → checklist cạnh nút chỉ rõ 2 mục còn "✗"; bấm vào cuộn tới đúng ô.

---

## BATCH P1 — công cụ làm việc hằng ngày

### WI-10 · Đánh giá QL: giờ xử lý tự tính  ·  (D4)
- Bỏ `<Input type=number>` "Giờ xử lý". Hiển thị "Giờ xử lý (hệ thống): N giờ" tính `ngay_tiep_nhan → (ngay_ket_thuc | now)`. Lưu chốt số này khi "Chốt".
**Đầu ra đạt:** [ ] Khu Đánh giá QL không còn ô nhập tay; số giờ khớp với giá trị cột ở danh sách.

### WI-08 · Danh sách khiếu nại  ·  (L1–L7, X5)
- Tiện ích `frontend/src/lib/formatVN.ts`: `date` / `dateTime` / `relative`. Áp dụng toàn app.
- Bộ lọc chip: Trạng thái, Mức độ, Nhóm vấn đề, Khoảng ngày tiếp nhận, "Chưa đồng bộ CRM", "Ca của tôi" (WI-06). Lưu bộ lọc gần nhất (`localStorage`).
- Backend GET nhận thêm: `muc_do`, `nhom_van_de`, `tu_ngay`, `den_ngay`, `chua_dong_bo`, `nguoi_phu_trach`.
- Cột: gộp `Mã · Model · Lada` (2 dòng) | `Khách / Tỉnh` | `Mức độ` (màu) | `Nhóm vấn đề` | `Trạng thái` | `Chỉ báo` (suy ra) | `Cập nhật` (tương đối). Bảng full width, mật độ vừa.
- "KTV hoàn thành" → 3 trạng thái: "Không áp dụng" (không CRM) / "Chưa" / "Xong · <ngày>".
- Sắp xếp theo Ngày tiếp nhận / Cập nhật / Mức độ. Cỡ trang 20/50/100.
**Đầu ra đạt:**
- [ ] Lọc `Mức độ = Nghiêm trọng` + khoảng ngày → tập kết quả đúng (đối chiếu SQL).
- [ ] Bảng dùng hết chiều rộng khả dụng; ngày hiện "05/09 08:12" + cột Cập nhật "2 giờ trước".
- [ ] Ca "Đã kết thúc" không còn hiện "Chưa hoàn thành" gây hiểu nhầm.
- [ ] Cột "Chỉ báo" hiện đúng: "Chờ 4 lỗi" / "Sẵn sàng đóng ca" / "Sẵn sàng chốt" / "Chưa đồng bộ CRM".

### WI-06 · Người phụ trách ca  ·  (H1-assignment)
- BE: `POST /khieu-nai/:id/phu-trach` (nhận `{ email | null }`; CSKH/TN CSKH/QL/Admin). Ghi lịch sử.
- FE: khối "Người phụ trách" ở đầu Chi tiết + nút "Nhận ca" (gán mình). Cột/bộ lọc "Ca của tôi".
**Đầu ra đạt:**
- [ ] Bấm "Nhận ca" → người phụ trách = mình, hiện ở danh sách; lọc "Ca của tôi" ra đúng.
- [ ] Gỡ phụ trách được.

### WI-07 · Trang chủ theo vai trò  ·  (H1, H2, H3, H5, U7, H6)
- Khối "Việc của tôi" theo vai trò:
  - QL: ca "Chờ chốt kết thúc"; nút "Đồng bộ n ca tồn CRM" (WI-13).
  - TN CSKH: ca "Đang xử lý" đã đủ 4 lỗi + kết luận (sẵn sàng đóng ca).
  - CSKH: ca mình phụ trách còn mở + ca quá 48h chưa cập nhật.
  - Admin: "n người chờ duyệt" + "n ca tồn CRM".
  - Mọi vai trò: "Ca tôi phụ trách".
- 6 KPI (thêm "Chờ chốt", "Hủy") — mỗi thẻ bấm mở Danh sách đã lọc.
- Biểu đồ nhóm vấn đề: thêm số đếm + bấm lọc.
- App bar mỏng (desktop): tên màn + ô tìm nhanh + "+ Tạo" + menu người dùng.
**Đầu ra đạt:**
- [ ] Đăng nhập QL → khối "Việc của tôi" liệt kê đúng ca "Chờ chốt".
- [ ] Đăng nhập TN CSKH → liệt kê đúng ca sẵn sàng đóng ca.
- [ ] Đăng nhập Admin → thấy "n người chờ duyệt", bấm mở màn Người dùng.
- [ ] Bấm KPI "Đang xử lý" → mở Danh sách đã lọc trạng thái đó.
- [ ] Màn đầu tiên (1440×900) không còn vùng trắng lớn cuối trang.

### WI-09 · Chi tiết KN  ·  (D2, D3, D10, D12, D13, D14, D15, X7, D1-copyID)
- Header modal: nút "Sao chép mã đơn"; dòng "Bước kế: <ai> <làm gì>".
- Thứ tự khu: Tóm tắt &amp; liên hệ → Nội dung &amp; Tiến trình → CRM Karofi → Nhánh đổi máy → Đánh giá nguyên nhân lỗi → Đánh giá QL.
- "Tiến trình": ô nhập `textarea` đưa lên đầu; hiện **tên** người (từ `/nguoi-directory`); thời gian `formatVN`.
- Đổi tên khu "Đánh giá lỗi (TN CSKH)" → "Đánh giá nguyên nhân lỗi"; tách "Kết luận khiếu nại" thành khối riêng ngay trên nút Đóng ca.
- "Nhánh đổi máy": công tắc "Ca này có nhánh đổi máy?" — tắt thì thu gọn 1 dòng. D11: giữ 2 trường, thêm hint phân biệt ("Lý do chậm — báo cáo tiến trình" vs "Giải trình chậm đổi máy — báo cáo nhánh đổi máy").
- `ReadField` dịch mã (`cam_co`, `ket_qua_doi_may`) qua bảng nhãn dùng chung.
- Thanh dính đáy modal: "n thay đổi chưa lưu · Lưu các thay đổi" (gọi lần lượt từng khu dirty); guard khi đóng.
- Modal: bẫy focus + khoá cuộn nền.
**Đầu ra đạt:**
- [ ] Bấm "Sao chép mã đơn" → clipboard có đúng mã; dán vào ô tìm ở Danh sách ra đúng ca.
- [ ] Sửa 2 khu, bấm ✕ → cảnh báo "2 thay đổi chưa lưu"; "Lưu các thay đổi" lưu cả hai.
- [ ] "Cảm cờ" ở chế độ đọc hiện "Không cờ" (không phải "Khong co").
- [ ] Tiến trình hiển thị tên người + "08/09 09:42".
- [ ] Tab không thoát khỏi modal khi đang mở.

### WI-11 · Cấu hình danh mục  ·  (S1, S2, S3, S5)
- Bộ lọc trạng thái: Đang dùng / Đã ẩn / Tất cả (GET `active` tuỳ chọn).
- Mỗi dòng: công tắc bật–tắt (dùng `PATCH active` 2 chiều đã có).
- Vô hiệu → toast có "Hoàn tác".
- Ô tìm trong tab; cột "Số lần dùng" (đếm tham chiếu).
- Bố cục 2 cột: menu nhóm trái, bảng + form phải full width.
**Đầu ra đạt:**
- [ ] Vô hiệu 1 mục → đổi filter "Đã ẩn" thấy lại → bật lại được.
- [ ] Toast "Đã ẩn … · Hoàn tác" — bấm Hoàn tác khôi phục.
- [ ] Gõ vào ô tìm → danh sách lọc theo.

### WI-12 · Người dùng  ·  (U1–U7)
- Hàng sửa → mở hộp "Chỉnh sửa người dùng" (vai trò + trạng thái duyệt + khoá) có nút **Lưu**.
- "Nâng lên Admin" và "Khoá" → hộp xác nhận riêng.
- Người "Chờ duyệt": nút **"Duyệt &amp; gán vai trò"** (mở chọn vai trò, đặt cả hai). Chặn chuyển "Đã duyệt" khi vai trò trống.
- Dòng của chính mình: không cho tự đổi vai trò / tự khoá. Chặn hạ Admin cuối cùng.
- Cột "Đăng nhập gần nhất" (từ `login_log`), "Ngày tạo". Ô tìm email/tên. Gộp cột Khoá thành 1 công tắc.
- Ghi `khieu_nai_lich_su`? → dùng bảng riêng `user_audit` hoặc log tối giản. (Tối thiểu: console/log server.)
**Đầu ra đạt:**
- [ ] Đổi vai trò trong hộp → chỉ áp dụng sau khi bấm "Lưu".
- [ ] "Nâng lên Admin" / "Khoá" → hỏi xác nhận.
- [ ] Dòng tài khoản đang đăng nhập: ô vai trò &amp; nút khoá bị vô hiệu.
- [ ] Hạ Admin duy nhất còn lại → bị chặn.
- [ ] Cột "Đăng nhập gần nhất" có dữ liệu.

### WI-13 · UI đồng bộ ca tồn CRM  ·  (T2)
- Nút trên Trang chủ (Admin/QL): "Đồng bộ n ca tồn CRM" → gọi `POST /khieu-nai/dong-bo-cac-ca-ton`, hiện tiến độ + kết quả (n thành công / n lỗi).
**Đầu ra đạt:** [ ] Bấm nút → gọi API, hiện bảng kết quả; số "Tồn đọng CRM" cập nhật lại.

---

## BATCH P2 — hiện đại hoá (không chặn công việc)

### WI-14 · Điều hướng &amp; thị giác nhỏ  ·  (X8, X9, H6-mobile)
- Icon cho sidebar + KPI.
- Bottom nav mobile: bỏ "Thêm" khi ≤3 module; thêm mục "Tài khoản".
- Phân cấp thị giác (không phải "mọi thứ là card").
**Đầu ra đạt:** [ ] Sidebar có icon; mobile ≤3 module không còn nút "Thêm" cụt.

### WI-15 · Chế độ tối  ·  (X4)
- Token hoá triệt để; thêm bộ biến `[data-theme="dark"]` + `@media (prefers-color-scheme: dark)`; công tắc Sáng / Tối / Theo hệ thống trong menu người dùng.
**Đầu ra đạt:** [ ] Chuyển Tối → toàn bộ màn đọc được, tương phản đạt; đổi lại Sáng hoạt động.

---

## Ngoài phạm vi đợt này (đã có quyết định)
- C4 số điện thoại: chỉ thêm **cột + ô nhập không bắt buộc**, không ép, không kéo từ CRM (chờ).
- D11: giữ 2 trường báo cáo chậm.
- D6: không mở thêm quyền cho KTV.
- S4 (nhóm 14 tab Cấu hình), U3 (mời người dùng trước), xuất Excel: để sau.

---

## Nhật ký thực hiện

| Ngày | Batch/WI | Kết quả tái kiểm thử | Commit |
|------|----------|----------------------|--------|
| _(đang cập nhật)_ | | | |
