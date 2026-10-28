# Báo cáo phân tích & kế hoạch triển khai — CRM đầy đủ · Quản lý ca tồn & Lỗi vi phạm · Báo cáo đổi máy

Ngày lập: 28/10/2026 · Phạm vi: App Khiếu nại 3T (`tiepnhan`), có liên quan hệ DVBH (`dvbh`) và hệ Vi phạm (`vipham`)
Số liệu hiện trạng lấy từ DB production lúc lập báo cáo (truy vấn chỉ đọc).

---

## 0. Tóm tắt

| # | Yêu cầu gốc | Hiện trạng tóm tắt | Đề xuất chính |
|---|---|---|---|
| 1 | API theo ID CRM kéo đủ thông tin ca CRM, gồm cả giải trình tồn của TNGS | DVBH trả về **36 cột case + lịch sử giải trình + khảo sát + vi phạm**, nhưng app chỉ lưu **6 cột** + giải trình dạng text; khảo sát/vi phạm **bị bỏ qua**; giải trình thiếu 4 trường chi tiết; **không có đồng bộ tự động** | Lưu bản sao CRM đầy đủ (cache) + dòng hóa giải trình; DVBH mở rộng API; thêm cron tự đồng bộ ca tồn |
| 2 | Mục Quản lý ca tồn, lọc thông minh; ca >48h thiếu giải trình → CSKH giải trình → bắt lỗi → gắn thẻ CSKH → mục LỖI VI PHẠM để kéo sang hệ khác | Có lọc "Tất cả tồn", luật giải trình 24h (khóa thao tác) nhưng **không ghi nhận lỗi**; hiện có **136 ca tồn, 55 ca >48h, 7 ca đang quá hạn giải trình** | Màn "Quản lý ca tồn" riêng + bộ máy phát hiện lỗi tự động + bảng `loi_vi_pham` có quy trình giải trình/miễn trừ/chốt + API cho hệ khác kéo |
| 3 | Tách riêng báo cáo ca ĐỔI MÁY | Nhánh đổi máy có 8 trường nhưng **chỉ 1/1.894 ca có dữ liệu**; 27 ca thuộc nhóm "CA LẶP CẦN XEM XÉT, ĐỔI MÁY" | Định nghĩa rõ "ca đổi máy", ràng buộc nhập liệu, rồi mới làm tab báo cáo riêng |
| 3b | Ca kết thúc quá 48h (16 giờ làm việc) mà không đóng ca → bắt lỗi | Không có quy tắc; lịch sử: **53 ca** đóng muộn >48h sau khi KTV hoàn thành trên CRM | Quy tắc lỗi "Chậm đóng ca" dùng **lịch giờ làm việc** (cần xây nền tảng tính giờ làm việc + ngày lễ) |

**Khuyến nghị thứ tự làm:** (A) Nền tảng: lịch giờ làm việc + cron đồng bộ CRM → (B) CRM đầy đủ → (C) Quản lý ca tồn + Lỗi vi phạm → (D) Báo cáo đổi máy. Lý do: quy tắc bắt lỗi (C) phụ thuộc vào mốc "KTV hoàn thành" và giải trình lấy từ CRM (B), và cả hai quy tắc đều cần cách tính giờ làm việc (A).

---

## 0b. Quyết định đã chốt (28/10/2026) & điều chỉnh kế hoạch

| Câu hỏi | Quyết định | Ảnh hưởng tới kế hoạch |
|---|---|---|
| TNGS là ai | **= Giám sát** (vai trò `Giam sat` trên DVBH) | Mục 1 giữ nguyên: kéo bảng `giai_trinh` của GS, kèm tên/vai trò người giải trình |
| Ca >48h thiếu giải trình | **Bắt cả 2 trường hợp, tách 2 loại lỗi:** **L1a "Quá 48h chưa được xử lý"** và **L1b "Quá 48h chưa xử lý tiếp"** | Thay quy tắc L1 cũ (mục 2.3) bằng L1a + L1b, chi tiết bên dưới |
| Mốc tính chậm đóng ca | **Sau khi case được đóng trên CRM (ca 3T) hoặc trên Lada (ca NSKX)** | L2 có 2 nguồn mốc → cần **đồng bộ cả Lada**, không chỉ CRM (xem bên dưới) |
| Cách tính 48h | **48 giờ, bỏ Chủ nhật và ngày lễ Việt Nam.** Không cần tính theo khung giờ trong ngày | Đơn giản hơn nhiều so với "16 giờ làm việc": chỉ cần lịch ngày nghỉ (CN + lễ) |
| "Bên kia" nhận lỗi vi phạm | **Sau này tạo vi phạm và bắn API sang các bên xin thông tin** | App Khiếu nại **chủ động đẩy** (phương án P2) khi có bên đăng ký. Đợt này chỉ dựng sẵn hàng đợi gửi, chưa gửi đi đâu |

### Quy tắc lỗi sau khi chốt

Mọi mốc "48h" dưới đây đều tính **48 giờ bỏ Chủ nhật và ngày lễ**: giờ rơi vào ngày CN/lễ không được đếm.

| Mã | Tên lỗi | Điều kiện phát sinh | Gắn cho | Lặp lại |
|---|---|---|---|---|
| **L1a** | Quá 48h chưa được xử lý | Ca chưa đóng/hủy, đã quá 48h kể từ **tiếp nhận**, mà **chưa có dòng tiến trình/giải trình nào** | CSKH phụ trách | 1 lần/ca |
| **L1b** | Quá 48h chưa xử lý tiếp | Ca chưa đóng/hủy, **đã có** tiến trình, nhưng đã quá 48h kể từ **dòng tiến trình gần nhất** mà chưa có dòng mới | CSKH phụ trách | Mỗi lần lại trôi qua 48h không cập nhật thì thêm 1 lỗi |
| **L2** | Chậm đóng ca | Case đã **đóng trên CRM** (ca có ID CRM) hoặc **đóng trên Lada** (ca NSKX), mà quá 48h vẫn chưa "Đóng ca" bên Khiếu nại | CSKH phụ trách | 1 lần/ca |

- Ca vừa có L1 vừa có L2: tính đủ cả hai, vì là 2 hành vi khác nhau (không cập nhật / không đóng).
- Luật khóa thao tác 24h hiện có **giữ nguyên**. Lỗi L1a/L1b là lớp ghi nhận riêng, không thay thế luật khóa.

### Lịch ngày nghỉ (thay cho "lịch giờ làm việc" ở mục 4)

- Bảng `ngay_nghi` (ngày, tên, loại: lễ/bù) quản lý trong **Cấu hình**.
  - Tự nạp sẵn lễ dương lịch cố định: 1/1, 30/4, 1/5, 2/9 (+ ngày liền kề theo quy định từng năm).
  - Lễ âm lịch (Tết Nguyên đán, Giỗ Tổ 10/3 ÂL) và ngày nghỉ bù: Admin nhập đầu mỗi năm theo thông báo của Nhà nước.
- Chủ nhật tự động là ngày nghỉ, không cần nhập.
- Hàm `cong48hBoNgayNghi(moc)` / `soGioTinh(a, b)`: cộng/đếm giờ, bỏ trọn các ngày CN/lễ. Có kiểm thử cho các trường hợp: mốc rơi vào CN, qua chuỗi Tết dài, qua cuối năm.

### Đồng bộ trạng thái đóng ca từ Lada (bổ sung cho L2)

- Ca NSKX dùng ID Lada. Hiện app chỉ tra cứu Lada để **điền form**, **không lưu** trạng thái/ngày đóng.
- Bổ sung:
  - Lưu `lada_trang_thai` và `lada_ngay_dong` vào ca.
  - Đưa ca NSKX tồn vào cron đồng bộ. API Ecolada nhận **nhiều mã/lần gọi** (`codes: [...]`), nên 1 lượt gọi kéo được cả lô.
- ⚠️ **Cần xác nhận:** API Ecolada có cột **"Trạng thái"** và **"Ngày Chốt Đơn"** của đơn. Cần chốt giá trị "Trạng thái" nào nghĩa là **case đã đóng**, và "Ngày Chốt Đơn" có đúng là thời điểm đóng case không.

### Lỗi vi phạm & gửi sang bên khác

- Bảng `loi_vi_pham` giữ thiết kế ở mục 2.3, thêm:
  - Hàng đợi gửi `loi_vi_pham_gui`: lỗi, bên nhận, trạng thái chờ/đã gửi/lỗi, số lần thử, lần thử gần nhất.
  - Danh mục **"Bên nhận vi phạm"** trong Cấu hình: tên, URL nhận, khóa API, loại lỗi nhận, bật/tắt.
- Khi có bên đăng ký, lỗi **đã chốt** sẽ được đẩy sang. Lỗi mạng thì tự gửi lại theo cron.
- Đợt này dựng sẵn hàng đợi gửi và định dạng dữ liệu gửi đi. **Chưa gửi tới bên nào** cho tới khi có thông tin bên nhận.

### Lộ trình sau điều chỉnh

| Giai đoạn | Nội dung | Ước lượng |
|---|---|---|
| GĐ1 – Nền tảng | Bảng ngày nghỉ + hàm tính 48h bỏ CN/lễ (kiểm thử) · cron đồng bộ **CRM + Lada** cho ca tồn mỗi 2h · lưu mốc đóng CRM/Lada | 3–4 ngày |
| GĐ2 – CRM đầy đủ | Như mục 6 cũ (DVBH mở rộng API, bảng `crm_case`/`crm_giai_trinh`, giải trình GS hiện trong Tiến trình) | 4–5 ngày |
| GĐ3 – Quản lý ca tồn | Như mục 6 cũ, thêm thẻ/lọc **"Sắp L1a / L1b / L2"** (còn <8h tính) | 4–5 ngày |
| GĐ4 – Lỗi vi phạm | Cron phát hiện **L1a, L1b, L2** · thẻ CSKH · cảnh báo sớm · giải trình/miễn trừ · màn Lỗi vi phạm · hàng đợi gửi (chưa bật) | 5–6 ngày |
| GĐ5 – Báo cáo đổi máy | Như mục 3 (vẫn chờ chốt định nghĩa ca đổi máy D1–D4) | 3–4 ngày |

### Chốt bổ sung (28/10/2026, lần 2)

| Câu hỏi | Quyết định |
|---|---|
| "Có xử lý" cho L1a/L1b | **Mọi dòng tiến trình** do người ghi |
| Mốc đóng case NSKX trên Lada | Cột **"Ngày Chốt Đơn"** của API Ecolada (có giá trị = đã đóng) |
| L2 kết thúc khi | TN CSKH bấm **"Đóng ca"** |
| Phạm vi tính lỗi | **Từ ngày bật tính năng + các ca đang tồn** lúc bật. Ca đã đóng trước đó không tính. Ca tồn lúc bật được xét theo mốc thật, nhưng **tối đa 1 lỗi mỗi loại** ở lần quét đầu (không dồn nhiều lỗi L1b cho các chu kỳ đã qua) |
| Nhận diện ca đổi máy | Kết hợp **3 nguồn** (bên dưới) |
| Lỗi chính thức khi nào | **Tự thành lỗi** ngay khi hệ thống phát hiện, không chờ duyệt. CSKH vẫn được ghi giải trình kèm lỗi để lưu vết. Riêng QL/Admin có quyền **miễn trừ** (bắt buộc ghi lý do, có nhật ký) cho trường hợp bắt nhầm |

**Nhận diện ca đổi máy (thay cho D1–D4 ở mục 3.2):**
1. **"KN đổi máy" từ DVBH:** cột `theo_doi_doi_tra` của case (2 = khớp tự động chờ xác nhận, 1 = đã xác nhận đúng, 3 = bỏ qua). → DVBH bổ sung vào `case-lookup`.
2. **"Luồng đổi máy" từ DVBH:** luồng trong hệ "Theo dõi đổi máy": trạng thái + các mốc tiếp nhận / đề xuất / duyệt / giao xử lý / kết thúc. DVBH không lưu luồng trong DB mà gọi sang hệ đó → DVBH bổ sung `luongDoiMay` vào `case-lookup` (gọi theo case, có cache).
3. **Thông tin bên Khiếu nại** (thẻ "Thông tin khác"): **ID Lada phát sinh đổi máy** + **trạng thái/kết quả đổi máy**.

Ca được coi là **ca đổi máy** khi có ít nhất 1 trong 3 nguồn trên: `theo_doi_doi_tra ∈ {1, 2}`, có luồng đổi máy, hoặc có ID Lada phát sinh / kết quả đổi máy khác "Không có". Báo cáo đổi máy hiện rõ **nguồn nhận diện** của từng ca và **so lệch**, ví dụ: CRM có luồng đổi máy nhưng bên Khiếu nại chưa nhập kết quả, để nhắc bổ sung.

### Câu hỏi còn lại (bản trước, đã trả lời 1–5)

1. **"Có xử lý"** cho L1a/L1b tính là **mọi dòng tiến trình** CSKH ghi, hay chỉ dòng có **lý do xử lý chậm** (như luật khóa 24h)? *Đề xuất: mọi dòng tiến trình do người ghi.*
2. **Ca NSKX:** giá trị "Trạng thái" nào trên Lada = đã đóng? Mốc thời gian lấy từ "Ngày Chốt Đơn" hay cột nào khác?
3. **L2 kết thúc khi nào:** khi TN CSKH bấm **"Đóng ca"** (chuyển "Chờ chốt kết thúc"), hay khi QL **"Chốt"**? *Đề xuất: "Đóng ca".*
4. **Ngày bắt đầu tính lỗi:** chỉ tính từ ngày bật tính năng, không truy hồi ca cũ (*đề xuất*)?
5. **Ca đổi máy:** định nghĩa theo D1/D2/D3 hay D4 (mục 3.2)?
6. Lỗi tự động chính thức sau N ngày nếu CSKH không giải trình, hay luôn chờ QL duyệt?

---

## 1. Yêu cầu 1 — Kéo đủ thông tin ca CRM (kèm giải trình tồn của TNGS)

### 1.1. Hiện trạng (đã kiểm tra code 2 hệ)

**DVBH `GET /api/partner/case-lookup?id=` đang trả về:**
- `preview`: 36 cột của `case_dvbh` (KTV, khách, seri, khu vực, tỉnh/huyện, hãng, sản phẩm, tiến độ, mô tả lỗi, nhóm/loại yêu cầu, hình thức bảo hành, ngày mua, thời gian CSKH tiếp nhận/hẹn/hoàn thành, đối tác, link CRM, nội dung xử lý, lưu ý lỗi linh kiện, cách thức xử lý, ngành, nhóm KH, 3 cột doanh thu, lý do quá hạn, ngày import/cập nhật, đúng hạn, bucket 24h, lý do hủy, link hình ảnh).
- `giaiTrinh[]`: lịch sử giải trình tồn — `ly_do_cham, noi_dung, ngay_giai_trinh, nguoi_giai_trinh`.
- `khaoSat[]` (từ 12/10): kết quả gọi khảo sát khách hàng.
- `viPham[]` (từ 12/10): vi phạm KTV của case + giải trình vi phạm.

**App Khiếu nại đang dùng:**
- Lưu vào ca: chỉ 6 trường — `ngay_tiep_nhan_crm, ket_qua_crm, thong_tin_xu_ly_crm, ngay_ktv_hoan_thanh, thong_tin_giai_trinh_dvbh` (text ghép) và `giai_trinh_dvbh_json`.
- Modal "Chi tiết đơn ĐVBH" tra cứu **sống** mỗi lần mở → hiện `preview` + `giaiTrinh`; **không** hiện `khaoSat`, `viPham`.
- Đồng bộ chỉ chạy khi: tạo ca / sửa ID / bấm "Đồng bộ lại" / bấm "Đồng bộ n ca tồn". **Không có cron tự động** (cron 3h sáng hiện chỉ kéo nhân sự ETX + chụp số liệu báo cáo).

**Khoảng trống dữ liệu:**

| Nhóm | Có trong DVBH nhưng chưa tới App Khiếu nại |
|---|---|
| Giải trình tồn | 4 trường chi tiết của bảng `giai_trinh`: **linh kiện thiếu, ngày dự kiến hoàn thành, ngày yêu cầu có hàng, mã xuất hàng liên quan**; vai trò/tên người giải trình (hiện chỉ có email) |
| Thông tin case | Giám sát phụ trách (`assigned_to`), KTV triển khai, lịch hẹn, mức độ, linh kiện lỗi, tỉnh/xã mới, yêu cầu hủy, ID khách hàng, khu vực CRM, ngày sản xuất |
| Cờ cảnh báo | Nghi ngờ nạp gas, nghi ngờ tranh chấp (+ người xác nhận), theo dõi đổi trả, lý do tồn tranh chấp gần nhất |
| Ca lặp | Bảng `giai_trinh_lap`: đánh giá lặp, hình thức xử lý, diễn giải, QC chốt |
| Tồn/cảnh báo | Tuổi tồn, có thuộc danh sách "Cảnh báo tồn cấp 2 (CEO)" không, tiến trình tranh chấp |
| Đã có trong API nhưng app bỏ qua | `khaoSat[]`, `viPham[]` |

> **Giả định cần xác nhận:** "TNGS" = Trưởng nhóm Giám sát, vai trò `Giam sat` trong DVBH — người nhập giải trình tồn vào bảng `giai_trinh`. DVBH không có vai trò nào tên TNGS.

### 1.2. Phương án

| | **A. Lưu bản sao CRM đầy đủ (khuyến nghị)** | B. Chỉ xem sống, không lưu | C. Kéo hàng loạt qua `/cases` (Excel) |
|---|---|---|---|
| Cách làm | Bảng mới `crm_case` (1 dòng/ID CRM: các cột hay lọc + `raw_json` đầy đủ) và `crm_giai_trinh` (1 dòng/lần giải trình). Ca khiếu nại tham chiếu qua `id_crm_karofi` | Mở rộng modal hiển thị đủ mọi thứ API trả về | Dùng export `/cases` 30 lượt/ngày |
| Lọc/báo cáo theo dữ liệu CRM | ✅ Được (vd lọc "Giám sát X", "có thiếu linh kiện") | ❌ Không | ✅ Được |
| Làm nền cho quy tắc bắt lỗi | ✅ | ❌ | ⚠️ Dữ liệu trễ |
| Khối lượng | Trung bình | Nhỏ | Lớn (đọc Excel trong Worker) |
| Rủi ro | Dữ liệu cũ nếu không đồng bộ → cần cron | Chậm, tốn lượt API | Bị giới hạn 30 lượt/ngày |

**Phương án A — chi tiết:**
1. **Phía DVBH** (thay đổi nhỏ, tương thích ngược):
   - Thêm 4 trường chi tiết vào `giaiTrinh[]` và tên người giải trình.
   - Thêm các cột case ở bảng khoảng trống bên trên (tùy chọn qua tham số `?full=1`, để không tăng tải cho hệ Linh kiện/Vi phạm).
   - Thêm `giaiTrinhLap` (ca lặp) và `tranhChap[]` (tiến trình tranh chấp).
   - Cập nhật `PARTNER_API_GUIDE.md`.
2. **Phía App Khiếu nại:**
   - Migration tạo 2 bảng.
   - `dvbhClient.ts` lưu toàn bộ phản hồi.
   - 6 trường cũ vẫn ghi như hiện nay để báo cáo cũ không đổi.
3. **Màn chi tiết ca**, tab "Đồng bộ CRM Karofi" sắp lại thành các khối:
   - Thông tin case
   - Tiến độ KTV
   - **Giải trình tồn (bảng: ngày · người · lý do · LK thiếu · ngày dự kiến · ngày có hàng · mã xuất)**
   - Khảo sát khách hàng
   - Vi phạm KTV
   - Ca lặp
   - Cờ cảnh báo
   - Kèm dòng "cập nhật lúc …".
4. **Cron tự đồng bộ:**
   - Mỗi 2 giờ trong giờ làm việc, quét ca tồn có ID CRM (hiện ~136 ca).
   - Chạy theo lô 40 ca như nút đồng bộ hàng loạt hiện có.
   - Nằm thoải mái trong giới hạn 200 lượt/phút của API.
   - Thêm 1 lượt sau khi đóng ca để chốt dữ liệu cuối.
5. **Giải trình của Giám sát hiện vào Tiến trình ca** (đánh dấu nguồn "CRM · Giám sát"), để CSKH thấy ngay lý do tồn mà không phải mở CRM.

**Điểm cần chốt:**
- Giải trình tồn của Giám sát trên CRM **có được tính là "đã giải trình"** cho luật 24h/48h bên Khiếu nại không? Khuyến nghị: **không thay thế**. Đây là 2 trách nhiệm khác nhau: GS giải trình tiến độ kỹ thuật, CSKH giải trình việc chăm sóc khách. Nhưng nên hiển thị cạnh nhau, và cho CSKH bấm "dẫn lại giải trình CRM" để ghi nhanh.
- 3 cột doanh thu (`dt_*`) là dữ liệu tài chính. Khuyến nghị chỉ QL/Admin xem.

---

## 2. Yêu cầu 2 — Quản lý ca tồn & Lỗi vi phạm CSKH

### 2.1. Hiện trạng

- Danh sách phản ánh đã có lọc: "Tất cả tồn", "Tồn tối thiểu N ngày", "Quá hạn giải trình", "Chờ TN CSKH", "Ca của tôi", trạng thái CRM.
- **Luật giải trình hiện hành:** mỗi 24h kể từ tiếp nhận (hoặc lần giải trình gần nhất) phải ghi tiến trình có **lý do xử lý chậm**. Quá hạn thì ca bị **khóa** đánh giá/đóng/chốt. Luật này chỉ chặn thao tác, **không để lại dấu vết lỗi nào**: giải trình muộn 3 ngày cũng không ai biết.
- Số liệu hiện tại: 136 ca tồn · 55 ca tồn >48h · 7 ca đang quá hạn giải trình 24h.
- Ca có `nguoi_phu_trach` (CSKH phụ trách) → làm căn cứ gắn lỗi cho người.

### 2.2. Màn "Quản lý ca tồn" (mục menu mới)

Màn riêng, tách khỏi danh sách phản ánh chung, tập trung vào "việc phải làm":

1. **Thanh thẻ số liệu** (bấm vào thẻ là lọc):
   - Tồn theo tuổi: <24h · 24–48h · 48–72h · >72h · >7 ngày.
   - Sắp quá hạn giải trình (còn <4h).
   - Đã quá hạn giải trình.
   - CRM đã hoàn thành nhưng chưa đóng ca.
   - Chờ chốt.
   - VIP.
   - ID CRM sai.
2. **Bộ lọc thông minh**:
   - **Bộ lọc mẫu dựng sẵn**: "Việc của tôi hôm nay", "Sắp thành lỗi", "Đã thành lỗi chưa giải trình", "VIP tồn >6H", "CRM xong – chờ đóng".
   - Lưu bộ lọc riêng theo người dùng.
   - Lọc theo: người phụ trách, nguồn, Giám sát CRM, khu vực, nhóm vấn đề, có/không thiếu linh kiện (từ giải trình CRM).
3. **Sắp xếp theo mức độ khẩn**: điểm ưu tiên = hạn còn lại + VIP + mức độ + số lần tồn. Ca sắp thành lỗi luôn nằm trên.
4. **Cột riêng:**
   - Hạn giải trình kế tiếp (đếm ngược).
   - Giải trình gần nhất (ai, khi nào, nội dung rút gọn).
   - Giải trình CRM gần nhất của Giám sát.
   - Số lỗi đã phát sinh trên ca.
5. **Giải trình nhanh**:
   - Chọn nhiều ca, nhập 1 lý do + nội dung chung, hoặc giải trình từng dòng ngay trên danh sách mà không phải mở ca.
   - Danh mục lý do chậm chuẩn hóa trong Cấu hình, để thống kê được.
6. **Nhóm theo người phụ trách**: xem tải công việc từng CSKH (số tồn, số sắp lỗi, số đã lỗi).
7. Trên điện thoại: dạng thẻ, có nút giải trình nhanh.

### 2.3. Bộ máy phát hiện lỗi vi phạm

**Bảng mới `loi_vi_pham`** (1 dòng = 1 lỗi):

| Trường | Ý nghĩa |
|---|---|
| `id`, `khieu_nai_id` | Lỗi của ca nào |
| `loai_loi` | Mã loại lỗi (danh mục trong Cấu hình) |
| `nguoi_vi_pham`, `vai_tro` | Gắn thẻ cho ai: CSKH phụ trách **tại thời điểm vượt hạn** |
| `moc_bat_dau`, `han`, `phat_hien_luc` | Căn cứ tính lỗi, để đối soát |
| `so_gio_tre` | Trễ bao nhiêu giờ (làm việc) |
| `trang_thai` | `Moi` → `Da giai trinh` → `Xac nhan loi` / `Mien tru` → `Da dong bo` |
| `giai_trinh`, `nguoi_duyet`, `ly_do_mien_tru` | Quy trình khiếu nại lỗi |
| `dong_bo_luc`, `ma_ben_ngoai` | Đã kéo sang hệ khác chưa |
| `UNIQUE(khieu_nai_id, loai_loi, chu_ky)` | Chống tạo trùng khi cron chạy lại |

**Quy tắc lỗi đề xuất:**

| Mã | Tên | Điều kiện | Gắn cho |
|---|---|---|---|
| L1 | **Thiếu giải trình ca tồn >48h** (yêu cầu gốc 2) | Ca chưa đóng/hủy, tuổi >48h, **và** không có giải trình trong cửa sổ 24h gần nhất | CSKH phụ trách |
| L2 | **Chậm đóng ca** (yêu cầu gốc 3b) | CRM đã hoàn thành (`ngay_ktv_hoan_thanh`) mà quá **16 giờ làm việc** vẫn chưa "Đóng ca" | CSKH/TN CSKH phụ trách (cần chốt) |
| L3 *(đề xuất thêm)* | Chậm chốt | Ở trạng thái "Chờ chốt kết thúc" quá N giờ làm việc | QL |
| L4 *(đề xuất thêm)* | Chậm tiếp nhận | "Chờ tiếp nhận" quá N giờ làm việc | CSKH ca trực |
| L5 *(đề xuất thêm)* | VIP tồn >6H không giải trình | Khách VIP, xử lý >6 giờ mà chưa có giải trình | CSKH phụ trách |

Chỉ bật L1 + L2 trong đợt đầu. L3–L5 dựng sẵn trong danh mục nhưng tắt, bật khi được duyệt.

**Cách phát hiện:**
- Cron chạy **mỗi giờ trong giờ làm việc**. Wrangler hỗ trợ nhiều lịch cron nên thêm lịch mới, giữ nguyên lịch 3h sáng.
- Kiểm tra thêm ngay khi có thao tác trên ca.
- Chạy lại không tạo trùng.
- Lỗi đã chốt thì **không tự xóa**, kể cả khi sau đó ca được giải trình. Chỉ được miễn trừ có duyệt.

**Gắn thẻ CSKH & thông báo:**
- Thẻ đỏ "Lỗi: Thiếu giải trình 48h" trên ca và trên dòng danh sách. Hồ sơ người dùng hiện số lỗi trong tháng.
- **Cảnh báo sớm:** thông báo đẩy + chuông **trước khi thành lỗi** (còn 4h, còn 1h), sau đó mới báo "đã phát sinh lỗi". Mục tiêu là giảm lỗi chứ không chỉ đếm lỗi.
- QL nhận tổng hợp lỗi mới hằng ngày.

**Quy trình sau khi có lỗi:**
1. CSKH giải trình lỗi: lý do khách quan như CRM chậm, khách hẹn lại, nghỉ phép…
2. QL xét: "Xác nhận lỗi" hoặc "Miễn trừ" (bắt buộc ghi lý do).
3. Khóa kỳ: sau ngày X của tháng sau, lỗi của tháng trước được chốt, không sửa nữa. Lúc đó mới đồng bộ sang hệ khác.

### 2.4. Mục "LỖI VI PHẠM" & kéo sang hệ khác

- **Màn "Lỗi vi phạm":**
  - Danh sách lỗi, lọc theo tháng / người / loại / trạng thái.
  - Bảng tổng hợp theo CSKH (số lỗi, tỷ lệ lỗi trên số ca phụ trách).
  - Xuất Excel.
  - Cho phép QL thêm lỗi thủ công kèm bằng chứng.
- **"Bên kia" là hệ nào — cần chốt.** Các lựa chọn:

| | **P1. API để bên kia kéo về (khuyến nghị)** | P2. Đẩy sang khi có lỗi | P3. Đưa vào hệ Vi phạm (`vipham`) hiện có |
|---|---|---|---|
| Cách làm | `GET /api/partner/loi-vi-pham?thang=…` có khóa API riêng, chỉ trả lỗi **đã chốt** | Gọi sang hệ đích mỗi khi lỗi được chốt | Mở rộng `POST /api/nhan-vi-pham` thêm đối tượng "CSKH" |
| Ưu | Đơn giản, chắc chắn; bên kia chủ động; cùng mô hình API đối tác DVBH đã dùng | Thời gian thực | Dùng lại hệ có sẵn |
| Nhược | Bên kia phải lập lịch kéo | Phải xử lý gửi lại khi lỗi mạng | Hệ vipham đang thiết kế cho **KTV** (bảng KTV, khớp mã KTV) → phải sửa nhiều |

---

## 3. Yêu cầu 3 — Báo cáo riêng cho ca ĐỔI MÁY

### 3.1. Hiện trạng — vấn đề dữ liệu cần xử lý trước

- Ca đã có nhánh "Đổi máy" với 8 trường: kết quả đổi máy, ngày ghi nhận, ngày đóng, người xác nhận, giải trình chậm, mã duyệt đổi linh kiện, ID Lada phát sinh, bộ phận bàn giao.
- **Thực tế gần như không ai nhập**: chỉ **1/1.894 ca** có dữ liệu nhánh đổi máy (1 ca "Đổi không thành công").
- Nhóm vấn đề **"CA LẶP CẦN XEM XÉT, ĐỔI MÁY"** có 27 ca (17 ca "CA ĐỔI MÁY CẦN XEM XÉT", 10 ca "CA LẶP CẦN XEM XÉT").
- ⇒ Nếu làm báo cáo ngay thì báo cáo **gần như trống**. Phải chốt định nghĩa và ép nhập liệu trước.

### 3.2. Định nghĩa "ca đổi máy" — phương án

| | Nhận diện theo | Ghi chú |
|---|---|---|
| D1 | Có dữ liệu nhánh đổi máy (kết quả ≠ "Không có") | Chính xác nhưng hiện gần như không có dữ liệu |
| D2 | Nhóm vấn đề / vấn đề đầu vào = "Đổi máy" | Có sẵn 17–27 ca, nhưng lẫn ca lặp |
| D3 | Từ CRM: cờ "theo dõi đổi trả", hình thức/cách xử lý = đổi máy | Khách quan, cần làm Yêu cầu 1 trước |
| **D4 (khuyến nghị)** | Cờ `la_ca_doi_may` trên ca: tự bật khi D1/D2/D3 đúng, CSKH bật/tắt tay được | Một định nghĩa duy nhất cho mọi báo cáo |

**Ràng buộc nhập liệu đi kèm:**
- Ca có cờ đổi máy thì **không cho đóng ca** khi chưa có kết quả đổi máy và ngày đóng đổi máy, giống cách bắt đánh giá đủ 4 lỗi hiện nay.
- Tách nhóm "CA LẶP" và "ĐỔI MÁY" thành 2 vấn đề đầu vào riêng.

### 3.3. Tab báo cáo "Đổi máy"

- **Thẻ số liệu:**
  - Số ca đổi máy trong kỳ.
  - % thành công / không thành công / hủy.
  - Thời gian trung bình ghi nhận → đóng đổi máy.
  - % quá hạn đổi máy.
  - Ca đổi máy đang tồn.
- **Phễu trạng thái:** Ghi nhận → Đang xử lý → Thành công / Không thành công / Hủy.
- **Phân tích theo:** model, hãng, tỉnh, nguyên nhân (4 lỗi đánh giá), nguồn (NSKX/3T/PLP), bộ phận bàn giao, người xác nhận, tháng.
- **Danh sách chi tiết:** xuất Excel; có cột giải trình chậm, mã duyệt đổi linh kiện, ID Lada phát sinh; có liên kết sang ca gốc và ca phát sinh.
- **Liên kết ca lặp:** khách đã báo bao nhiêu lần trước khi đổi máy (dùng lại logic "trùng lặp" đang có).
- Có bộ lọc tháng/nguồn như các tab báo cáo hiện tại. Mặc định **loại ca đổi máy ra khỏi** báo cáo tổng, có công tắc "gồm/không gồm đổi máy" để số liệu SLA chung không bị lệch.

---

## 4. Yêu cầu 3b — Quy tắc "16 giờ làm việc"

- Hiện **không hệ nào** (Khiếu nại, DVBH, Vi phạm) có hàm tính giờ làm việc. Mọi SLA đang tính theo giờ lịch 24/7.
- Cần xây **lịch làm việc dùng chung**:
  - Khung giờ mỗi ngày, ví dụ 08:00–12:00 và 13:30–17:30 = 8h.
  - Ngày làm việc trong tuần (T2–T6 hay T2–T7?).
  - **Bảng ngày nghỉ lễ** quản lý trong Cấu hình.
- Hàm `congGioLamViec(moc, soGio)` và `soGioLamViecGiua(a, b)`. Có kiểm thử với các trường hợp: qua đêm, qua cuối tuần, qua lễ, mốc rơi vào giờ nghỉ trưa.
- **Mốc bắt đầu của L2 — cần chốt:**
  - (a) Lúc KTV hoàn thành trên CRM (`ngay_ktv_hoan_thanh`). Khuyến nghị dùng mốc này, vì đúng nghĩa "ca đã xong mà chưa đóng".
  - (b) Lúc ca chuyển "Chờ chốt kết thúc". Nếu chọn mốc này thì lỗi thuộc về QL.
- Lưu ý: mốc (a) phụ thuộc đồng bộ CRM. CRM về trễ thì phải tính từ **giờ KTV hoàn thành thực tế**, không phải giờ đồng bộ. Đó là lý do cần cron ở Yêu cầu 1.
- Có thể dùng lại lịch này cho luật 24h/48h hiện tại, nếu muốn chuyển sang giờ làm việc. Cần chốt; khuyến nghị giữ 48h lịch cho L1 theo đúng yêu cầu gốc.

---

## 5. Các mảng liên quan đề xuất thêm (ngoài yêu cầu gốc)

1. **Đồng bộ CRM tự động** (cron): không có nó thì mọi quy tắc dựa trên CRM đều chạy trên dữ liệu cũ.
2. **Lịch làm việc & ngày lễ** dùng chung cho mọi SLA. Có thể đưa thành thư viện dùng chung cho DVBH/Vi phạm sau này.
3. **Cảnh báo sớm trước hạn** (đẩy thông báo + chuông + email tổng hợp sáng cho QL).
4. **Bảng KPI cá nhân CSKH**:
   - Số ca phụ trách, % đúng hạn, số lỗi, thời gian giải trình trung bình.
   - Xếp hạng theo tháng.
   - Dùng làm căn cứ đánh giá.
5. **Danh mục chuẩn hóa** trong Cấu hình: lý do chậm, loại lỗi vi phạm (tên, mô tả, ngưỡng giờ, bật/tắt, mức nặng), lý do miễn trừ.
6. **Phân quyền & nhật ký**:
   - CSKH chỉ thấy lỗi của mình. QL thấy tất cả và duyệt miễn trừ. Admin cấu hình quy tắc.
   - Mọi thay đổi trạng thái lỗi ghi vào lịch sử.
7. **Khóa kỳ tháng** cho lỗi vi phạm và báo cáo, để số đã gửi đi không thay đổi.
8. **Chất lượng dữ liệu** (phát hiện khi khảo sát):
   - 54 ca thiếu nhóm yêu cầu, 4 ca thiếu phân loại KH.
   - Nhánh đổi máy bỏ trống.
   - Vài ID CRM sai thật (`Kagofi`, `A106796`…).
   - Đề xuất thêm mục "Dữ liệu cần bổ sung" trong Quản lý ca tồn.
9. **Hiệu năng D1**:
   - Thêm index cho các truy vấn mới: `loi_vi_pham(nguoi_vi_pham, thang)`, `crm_giai_trinh(id_crm, ngay)`.
   - Cron đọc theo lô, không quét toàn bảng.
   - Dùng snapshot cho báo cáo tháng.
10. **Song ngữ VI/EN/ID** cho mọi màn mới, giữ nguyên chuẩn hiện tại.

---

## 6. Lộ trình triển khai đề xuất

| Giai đoạn | Nội dung | Phụ thuộc | Ước lượng |
|---|---|---|---|
| **GĐ0 – Chốt nghiệp vụ** | Trả lời các câu hỏi ở mục 7 | — | 1 buổi họp |
| **GĐ1 – Nền tảng** | Lịch giờ làm việc + ngày lễ (kèm kiểm thử) · cron đồng bộ CRM ca tồn mỗi 2h · danh mục cấu hình mới | GĐ0 | 3–4 ngày |
| **GĐ2 – CRM đầy đủ** | DVBH mở rộng `case-lookup` (+ tài liệu) · bảng `crm_case`/`crm_giai_trinh` · màn chi tiết CRM mới · giải trình GS hiện trong Tiến trình | GĐ1 | 4–5 ngày (gồm 1–1,5 ngày phía DVBH) |
| **GĐ3 – Quản lý ca tồn** | Màn mới, thẻ số liệu, bộ lọc mẫu, điểm ưu tiên, giải trình nhanh/hàng loạt, nhóm theo người | GĐ1 (GĐ2 để lọc theo dữ liệu CRM) | 4–5 ngày |
| **GĐ4 – Lỗi vi phạm** | Bảng `loi_vi_pham`, cron phát hiện L1/L2, cảnh báo sớm, thẻ CSKH, quy trình giải trình/miễn trừ, màn Lỗi vi phạm, khóa kỳ, xuất Excel, API cho hệ khác | GĐ1, GĐ3 | 5–6 ngày |
| **GĐ5 – Báo cáo đổi máy** | Cờ `la_ca_doi_may` + ràng buộc đóng ca · tách vấn đề đầu vào · tab báo cáo · công tắc gồm/không gồm đổi máy | GĐ0 (GĐ2 nếu dùng D3) | 3–4 ngày |
| **GĐ6 – Mở rộng** | KPI cá nhân CSKH, L3–L5, email tổng hợp | GĐ4 | 3 ngày |

Có thể làm **GĐ5 song song** với GĐ3–GĐ4, vì gần như độc lập.

**Thả dần để giảm rủi ro:**
- L1/L2 chạy **"chế độ quan sát" 1–2 tuần**: ghi lỗi nhưng không thông báo, không đồng bộ. QL đối chiếu xem quy tắc có bắt nhầm không, rồi mới bật chính thức.
- Ước tính: nếu bật ngay, theo số liệu lịch sử, L2 có thể phát sinh khoảng 50 lỗi chỉ tính các ca đã qua (53 ca đóng muộn >48h lịch). Đề xuất **chỉ tính lỗi từ ngày bật**, không truy hồi.

---

## 7. Câu hỏi ban đầu (đã trả lời 1, 3, 4, 5, 6 — xem mục 0b)

1. **TNGS** có đúng là Giám sát (vai trò `Giam sat`) trên DVBH không?
2. Giải trình tồn của Giám sát trên CRM **có được tính thay** giải trình của CSKH không? (Khuyến nghị: không, nhưng hiển thị cạnh nhau.)
3. **Định nghĩa L1:** "ca >48h thiếu giải trình" là (a) tồn >48h mà **chưa từng** giải trình, hay (b) tồn >48h và **không có giải trình trong 24h gần nhất**? (Khuyến nghị b. Hiện mọi ca >48h đều đã có ít nhất 1 giải trình, nên với định nghĩa (a) sẽ gần như không bắt được lỗi nào.)
4. **Định nghĩa L2:** mốc "ca kết thúc" là lúc **KTV hoàn thành trên CRM**, hay lúc ca ở **"Chờ chốt kết thúc"**? Lỗi gắn cho CSKH phụ trách, TN CSKH hay QL?
5. **Giờ làm việc:** khung giờ mỗi ngày? Làm thứ 7 không (cả ngày/nửa ngày)? Ai cập nhật lịch nghỉ lễ?
6. **"Bên kia"** để kéo lỗi vi phạm là hệ nào (Vi phạm `vipham`, KPI trong DVBH, hay HR/ETX)? Hình thức: P1 (bên kia kéo về) / P2 (đẩy sang) / P3 (đưa vào hệ Vi phạm)?
7. Lỗi có cần **duyệt của QL** trước khi tính, hay tự động thành lỗi chính thức sau N ngày nếu không ai khiếu nại?
8. **Ca đổi máy** nhận diện theo D1/D2/D3 hay D4 (cờ chung)? Có bắt buộc nhập nhánh đổi máy trước khi đóng ca không?
9. Lỗi có **tính truy hồi** các ca cũ không? (Khuyến nghị: không, chỉ tính từ ngày bật.)
10. Ai được xem 3 cột doanh thu từ CRM?

---

## 8. Rủi ro & lưu ý

| Rủi ro | Giảm thiểu |
|---|---|
| CRM đồng bộ chậm/sai ID → bắt lỗi nhầm | Cron 2h + tính theo giờ KTV hoàn thành thực tế + chế độ quan sát + quy trình miễn trừ |
| Đổi người phụ trách giữa chừng → gắn lỗi sai người | Gắn cho người phụ trách **tại thời điểm vượt hạn**, lưu vết trong `loi_vi_pham` |
| CSKH nghỉ phép/ca trực | Miễn trừ có duyệt. Giai đoạn sau có thể lấy lịch nghỉ từ ETX nhân sự (đã đồng bộ về app) |
| Tăng tải API DVBH | Lô 40 ca, cách 200ms, chỉ ca tồn; trong giới hạn 200 lượt/phút |
| Báo cáo đổi máy trống do thiếu dữ liệu | Làm ràng buộc nhập liệu (GĐ5) **trước** khi công bố báo cáo |
| Thay đổi API DVBH ảnh hưởng hệ Linh kiện/Vi phạm | Chỉ **thêm** trường, bật bằng `?full=1`, không đổi trường cũ |
