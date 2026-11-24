# Nhật ký làm việc — App Khiếu nại 3T

> Mỗi đợt làm việc 1 mục, **mới nhất ở trên**: ngày, phiên bản, yêu cầu, đã làm gì, kiểm thử gì, việc còn dở. Chỉ ghi thêm, không xoá mục cũ.
> Không ghi tài khoản, mật khẩu, khoá hay mô tả lỗ hổng bảo mật vào file này (repo có thể công khai).

## 24/11/2026 — v1.088: Cửa sổ thông tin eOffice (popup Giám đốc)

**Yêu cầu (nguyên văn):** "làm luôn cho toàn bộ hệ thống app dvbh: đặt lk, đổi trả, ông thợ, vi phạm, tiếp nhận..." (+ "thêm cả muahang", "cả ccdc") — tài liệu "API Cửa sổ thông tin — dành cho app ngoài (ETX87)".

**Đã làm:** chép nguyên bộ mã mẫu từ linh-kien-app v1.556: `backend/src/lib/cuaSoThongTin.ts` + `GET /api/cua-so` (không cần đăng nhập; Worker gọi `csApi` eOffice bằng secret `CUA_SO_KHOA`, đệm 60 giây, kèm tranh SVG) và `frontend/src/components/CuaSoThongTin.tsx` (gắn ở điểm render gốc, ngoài App → hiện cả màn đăng nhập, phủ trên mọi popup). Hiện mỗi lần mở app + khi quay lại sau ≥ 10 phút ẩn; nút "Vào app" khoá `khoaNutGiay` giây; Esc / Back chỉ đóng sau khi hết khoá. API lỗi / chậm / chưa đặt khoá → không hiện, vào app bình thường.

**Kiểm thử:** build 0 lỗi; sau deploy gọi `/api/cua-so` trên production trả đúng cửa sổ đang bật. Giao diện đã xem trên linh-kien-app (cùng 1 component).

**Còn dở:** đang dùng chung mã khoá với các app khác — nên xin mã riêng cho app này ở eOffice › Quản trị › Cửa sổ thông tin › Kết nối app ngoài rồi đặt lại secret `CUA_SO_KHOA`.

## 17/11/2026 — Tạo bộ tài liệu tổng hợp

- Yêu cầu: "dựa theo nguyên tắc tạo 3 file bắt buộc, rà soát toàn bộ các repo và tạo 3 file rồi đẩy lên repo etx87".
- Tạo `nhat_ky_lam_viec.md` (file này), `TONG_HOP_LOGIC.md`, `SRS_tong_hop.md`.
- Phần "Lịch sử dựng lại từ Git" bên dưới sinh tự động từ commit (bỏ commit gộp nhánh + commit tự động Workflow Mây). Từ nay ghi tay mục mới ở trên.

## Lịch sử dựng lại từ Git (129 commit, 2026-09-07 → 2026-10-30)

### 2026-10-30
- feat(bang): keo doi do rong cot, luu localStorage tren may (v1.087) (`c8f68bc`)
- feat(phan-anh): icon rieng cho tung loai loi + popup thong tin ca rong 95% man hinh (v1.086) (`2a8a874`)
- fix(phan-anh): bo trung Chi bao/KTV hoan thanh, moi dong gon 1 dong + cat '...' (v1.085) (`d1b08ff`)

### 2026-10-29
- feat(phan-anh): cot + bo loc nhieu moc ton; ca da dong bo CRM/Lada khong con hien 'Cho dong bo CRM' (v1.084) (`22d4476`)
- feat(bao-cao,phan-anh): loc tinh/huyen/loai loi da chot + bam so lieu bao cao xem danh sach ca (v1.083) (`3387d56`)

### 2026-10-28
- chore: tang phien ban 1.082 (GD1 lich ngay nghi + cron dong bo) (`57f546c`)
- feat(gd1): nen tang loi vi pham - lich ngay nghi, gio tinh 48h bo CN/le, cron dong bo CRM + Lada phat sinh (`28d740a`)
- docs(ke-hoach): cap nhat quyet dinh chot 28/10 - L1a/L1b/L2, 48h bo CN+le, dong bo Lada, hang doi gui vi pham (`fbc1a4e`)
- docs: bao cao phan tich & ke hoach - CRM day du, quan ly ca ton + loi vi pham, bao cao doi may (`33ad50b`)

### 2026-10-19
- feat(danh-gia-loi): nut "Xac nhan khong loi" - dat ca 5 muc = Khong va luu ngay (v1.081) (`439dca8`)

### 2026-10-17
- feat(danh-sach): rut gon ten loc trang thai, thanh loc nhanh gon 1 dong (v1.080) (`40b8e7f`)
- chore: tang phien ban 1.079 (`5168875`)
- feat(danh-sach): them loc nhanh phan loai KH - Thuong / VIP / VIP > 6H (`29d19da`)

### 2026-10-15
- D1: index khieu_nai_lich_su(khieu_nai_id, hanh_dong, thoi_diem) + settings_option(nhom, parent, active) - bao cao toc do xu ly doc 10M dong/lan (migration 0023) (`863e8d0`)

### 2026-10-13
- feat(i18n): dich man Chi tiet phan anh (KhieuNaiDetail) sang VI/EN/ID (`9b65f51`)
- feat(i18n): dich man form Tao phan anh (KhieuNaiForm) sang VI/EN/ID (`f478b00`)
- feat(i18n): dich man Bao cao (BaoCaoModule) sang VI/EN/ID (`82855b9`)
- feat(i18n): dich man Nguoi dung (UsersModule) sang VI/EN/ID (`181e307`)
- feat(i18n): dich man Cau hinh (SettingsModule) sang VI/EN/ID (`ec56fd0`)
- feat(i18n): dich man danh sach Phan anh (KhieuNaiModule) sang VI/EN/ID (`f5a1330`)
- feat(i18n): dich man Trang chu (HomeModule) sang VI/EN/ID (`e9c4eaa`)
- chore: doi lai tieu de app thanh "Tiep nhan phan anh" (`e5d51cc`)
- chore: doi ten tieu de app thanh "Ghi nhan phan anh, khieu nai" (`fdac783`)
- chore: bump version 1.076 cho dot deploy da ngon ngu + cong ty mac dinh (`116c4e8`)
- feat(i18n+cong-ty): them da ngon ngu VI/EN/ID va cong ty mac dinh theo nguoi dung (`0bf75b9`)

### 2026-10-12
- feat(bao-cao): tach man Bao cao thanh 3 tab (Tong quan thang / Van hanh hang ngay / Toc do xu ly) (`cd02645`)
- feat(phan-anh): nho Nguon nguoi dung chon gan nhat khi tao phan anh moi (`b80a674`)
- chore: bump version 1.073 cho dot deploy them nguon PLP (`508a2d4`)
- feat(phan-anh): them lua chon Nguon "PLP" (`b7273c1`)
- feat(phan-anh): them filter Nhom yeu cau cho danh sach chi tiet Phan anh (`27081c9`)
- feat(bao-cao): them filter Nhom yeu cau cho muc Tong quan thang (`d1add26`)

### 2026-10-07
- fix(crm): ho tro ma ID CRM dang SC + yymmdd + STT (`2d107be`)

### 2026-10-02
- feat(bao-cao): them 2 chi so chat luong - tong ca phat sinh/thang va ty le hoan thanh 48h (`46f19de`)
- feat(bao-cao): them filter Nguon (NSKX/3T) cho muc Tong quan thang (`1850a61`)
- feat(bao-cao): bo sung bang ty le % SLA theo khoang ngay xu ly (`467b1af`)

### 2026-09-28
- feat(crm): dong bo hang loat ca ton cho CSKH, TN CSKH - tu chia luot, bo qua ca vua dong bo < 1 phut (`d89fd97`)

### 2026-09-26
- feat(form-mobile): cai tao form tao phan anh cho mobile theo design system (`0d6b68b`)
- feat(bao-cao): thiet ke lai man Bao cao - the KPI, bieu do va mau sac theo design system (`6c0d356`)

### 2026-09-24
- feat(ui): design system gam tim theo icon app + ap dung toan app (`4fda435`)
- feat(crm): chi bao 'ID CRM sai' khi ca da tao qua 4 gio, truoc do la 'Dang cho dong bo' (`5126772`)

### 2026-09-23
- fix(dia-gioi): chuan hoa 'Đak nông' / 'Dak nông' -> 'Đắk Nông' + chan tao tinh sai chinh ta (`f5ddc46`)
- fix(bao-cao): theo nguoi tiep nhan tach tu mo moi / nguon khac / ton cu (`5c1e79c`)
- fix(bao-cao): ty le tiep nhan theo nguoi vuot 100% - mau so thieu ton cu chua tiep nhan (`04d33e2`)
- feat(bao-cao): bao cao theo nguoi tiep nhan + toc do xu ly theo ngay/tuan/thang (`0ae9d31`)
- feat(ui): bo loc co tren 5 lua chon tu dong thanh o go-de-tim (tim khong dau) (`a9dbcf3`)
- chore: gitignore 2 file bi mat o goc repo + settings.local.json truoc khi day len GitHub (`59a0bbd`)
- feat(users): quyen 'Xem tat ca ca' cho NV Sale / Tong dai vien (mac dinh tat) (`df77789`)
- fix(khieu-nai): o tim kiem danh sach tim duoc theo ID Truy xuat (`19824c9`)
- feat(crm): tach ca ton dong bo CRM thanh 'Cho dong bo' va 'ID CRM sai' (`4c84958`)
- feat(khieu-nai): QL dong ca hang loat cac ca San sang dong ca (`4b5de90`)
- feat(users): tach 2 tab Nguoi dung / ETX nhan su, phan trang 20 dong + tim kiem o server (`76dbbc6`)
- fix(mobile): o nhap rong het hang tren dien thoai thay vi kho co dinh (`3ab2d39`)
- feat(mobile): man Tao phan anh chiem tron man hinh tren dien thoai (`192e50f`)
- fix(mobile): form tao PA bi chong cac khoi len nhau tren dien thoai (`3b73c2f`)
- feat(mobile): giao dien mobile chu to, nut/o nhap lon, bo tab cho nguoi dung lon tuoi (`b6ce8b4`)

### 2026-09-22
- feat(khieu-nai): modal chi tiet DVBH hien du toan bo cot API tra ve (`0437f8c`)
- feat(khieu-nai): bam ID CRM de xem chi tiet don DVBH (giong app vi pham) (`7d4e154`)

### 2026-09-21
- perf(khieu-nai): view mac dinh Phan anh chi doc ca ton, khong quet toan bang (`596453d`)
- fix(khieu-nai): tra cuu rieng theo ID Truy xuat (khong dung nham API id_lada) (`0202c12`)
- feat(khieu-nai): chuong thong bao cuon vo han 10 dong/lan + 3 the Tong/Chua doc/Da doc (`d960818`)
- fix(khieu-nai): uu tien gop nhom trung lap theo ID Truy xuat; bo doan dia chinh moi khong co that (`2880a9a`)
- fix(khieu-nai): sua sai dia chinh cu/moi khi tra cuu ID Lada (`82d43fa`)
- fix(khieu-nai): doi ten "ID Truy van" -> "ID Truy xuat"; sua tra cuu ID Lada thieu du lieu (`b39380f`)
- fix(khieu-nai): loc trung-lap/tai-phat theo thang; them so ca vao nut loc nhanh (`d839cf9`)
- fix(khieu-nai): dem du ca tu tiep nhan + loai ca huy khoi tai phat; them dinh kem khi tao moi (`8306a27`)
- feat(khieu-nai): them dinh kem anh/video (Google Drive) khi bao ca (`2e295c2`)
- feat(khieu-nai): them "Bao cao theo ngay" (SL/ty le, loc 6 chieu, mo rong duoc theo tuan/thang) (`0993bb6`)
- fix(khieu-nai): chan COUNT(*) quet toan bang khi danh sach khong loc gi (`2c58fa4`)
- feat(khieu-nai): nhom lai UI "Thong tin dau vao" theo 5 khu vuc de de kiem soat (`918e3ae`)
- feat(khieu-nai): them nut loc nhanh trang thai (Tat ca/Tat ca ton/Cho tiep nhan/...) o danh sach (`4c42e60`)
- feat(khieu-nai): loc Trang chu + Bao cao theo thang, tranh quet toan bo lich su khi du lieu tang (`a89d0b1`)
- fix(khieu-nai): hover dong danh sach tang dam mau theo muc do thay vi xam chung (`2e1b1c0`)
- feat(khieu-nai): gach ngang + mo dong don da Huy trong danh sach de de phan biet (`772f0b5`)
- feat(khieu-nai): luu ID Truy van vao DB, hien/sua duoc o trang chi tiet nhu ID Lada (`2c78353`)
- feat(khieu-nai): cho CSKH/TN CSKH sua thong tin don goc truoc khi chot, du dang qua han giai trinh (`5e8dbda`)
- fix(ui): sua bug con tro nhay khoi textarea khi go, va thieu Tinh moi tren danh sach (`b4f762a`)
- fix(khieu-nai): chan huy don nhieu lan - thieu chan trang thai da la "Huy" (`c0f36a6`)
- feat(khieu-nai): them 3 nut loc nhanh Nguon (Tat ca/NSKX/3T), thu gon 4 o ID ve 1 dong (`6c4ff5d`)
- feat(khieu-nai): doi nhan hien thi Nguon "CRM Karofi/Lada" -> "3T/NSKX" (`ad2a710`)
- feat(khieu-nai): them o "ID Truy van" trong Tra cuu nhanh theo ID (`596849a`)
- feat(nguoi-dung): dong bo danh ba ETX nhan su, tu duyet NV Sale + khoa/mo khoa theo trang thai lam viec (`25fbdc0`)
- feat(trang-chu): sua KPI Ton dong CRM, them the Cho TN CSKH + Qua han giai trinh (`735b77d`)
- fix(chuong): doi popover sang Drawer truot canh phai, tham khao linh-kien-app (`3a25029`)
- feat(khieu-nai): QL chot truc tiep tu "Dang xu ly", bo qua buoc Dong ca (`3d9eaa5`)
- feat(khieu-nai): them truong Nguon (Lada/CRM) cho don khieu nai (`58a10af`)
- fix(trang-chu): them nut Huy/Tao phan anh cho popup tao moi tren Trang chu (`9973b7d`)

### 2026-09-17
- feat(khieu-nai): tich hop tra cuu ID Lada voi he thong Center3T (`a6c81a0`)

### 2026-09-12
- fix(trang-chu): xoa het bo loc cu khi bam KPI "Tong phan anh" (`78fc256`)

### 2026-09-10
- feat(vai-tro): mo rong quyen TN CSKH/QL, chot hang loat, chuong thong bao (`6964239`)
- fix(khieu-nai): tranh trung ID khi tao nhieu don gan nhu dong thoi (`2a0cda4`)
- fix(combobox): sua bug danh sach dropdown bi cat mat trong khung cuon (`9edf998`)
- feat(detail): gop banner canh bao vao icon (!) thu gon, lam noi bat PT tren thanh tieu de (`6c0edc3`)
- feat(bao-cao): them bao cao Chot loi (theo thang/tinh/nhom yeu cau/nhom van de/nguon tao/nguoi tao) (`4f147c8`)
- feat(form): xac nhan truoc khi dien tu ID CRM/Lada, mo rong so sanh + log tien trinh; tab mobile; thu gon filter; sua thu tu trung lap (`6433033`)

### 2026-09-09
- fix(popup): sua loi mau Gap/Xoa diu khong hien tren vien popup (chi Nghiem trong hoat dong) (`2547561`)
- fix(ui): tach mau Trung binh khac Gap (tim/xanh la ro rang) + tra fieldset ve nen trang (`82bc7ee`)
- fix(form): vien mau muc do/VIP ap len khung popup ngoai cung, khong to len vung nhap; sap lai thu tu Muc do (`ab583b1`)
- feat(scale+ui): index cho du lieu tang manh, filter thang dong, sua vien VIP khong tat + mau muc do trung (`3f1d9ee`)
- feat(form): to mau + vien VIP ngay khi chon Muc do / Phan loai KH luc tao phan anh (`13f8adb`)
- feat(phan-anh): them cot So gio xu ly + to mau dong theo muc do, vien vang KH VIP (`31f102f`)
- feat(menu+phan-anh): dua Bao cao len canh Trang chu, them filter thoi gian ton + sort theo cot (`5b4dbfd`)
- feat(bao-cao): them bao cao SLA + ca trung lap/tai phat ID Lada, danh sach don lien quan trong chi tiet (`a623b8b`)
- fix(form): tra cuu ID CRM luon ghi de Model, cac field khac giu nguyen quy tac chi dien khi trong (`94bea4c`)
- feat: bat buoc CSKH tiep nhan truoc khi sua + tach vai tro KTV thanh NV Sale/Tong dai vien (`35297e4`)
- feat(detail): "Tiến trình & lịch sử" dạng timeline + gọn "Đồng bộ CRM Karofi" (`bb99e6b`)
- feat(crm/lada): timeline giải trình + tab UI chi tiết học theo dvbh (`58f3339`)
- fix(crm-lookup): dùng Service Binding thay fetch() thẳng URL sang dvbh (`43cbbbc`)
- Đợt 4: consolidate banner Tạo mới, tách 2 khối form, nút đánh giá lỗi, gộp Thông tin khác, giải trình quá hạn 24h, KTV chỉ xem ca của mình, sidebar thu gọn (`846450e`)
- Nhat ky he thong + mau theo Muc do/cam co + gon form Tao phan anh (`cf61954`)

### 2026-09-08
- Cân đối lại form Tạo phản ánh: gọn, hợp nhập liệu (`9e4182d`)
- Địa chính mới 2025: khối "cũ" + "mới" song song, tra cứu CRM ưu tiên khớp mới (`405f2c8`)
- Phase 11: đổi tên "phản ánh", form tạo mới theo section + tra cứu ID, địa lý cascading (`ea09fea`)
- style(ui): phân biệt vùng dữ liệu bằng màu, ô nhập có viền rõ, thu gọn khoảng cách (`5726550`)
- fix(ui): popup Chi tiết KN và Tạo KN chiếm 95% màn hình (đúng yêu cầu) (`3ddaf89`)
- feat(chi-tiet-kn): cắm cờ thành nút riêng, cố định trên tiêu đề (`9810b9e`)
- redesign(chi-tiet + tạo KN): popup tra cứu + nhập liệu qua nút riêng (`1a7c1f5`)
- redesign(chi-tiet-kn): popup 95% màn hình, chia vùng có màu, action bar cố định top (`e19cb12`)
- docs: nhật ký thực hiện đợt 3 (`815554f`)
- fix(ux): đợt 3 — chống mất dữ liệu Chi tiết, icon điều hướng, nhóm tab Cấu hình (`e19137f`)
- docs: nhật ký thực hiện đợt 2 (`cc1dae9`)
- fix(ux): P1 đợt 2 — Danh sách, Người dùng, Cấu hình, điều hướng KPI (`f7f9caa`)
- docs: nhật ký thực hiện đợt 1 (`01a70ec`)
- fix(ux): P0 rà soát 09/2026 — nhập liệu, phiên, toàn vẹn hồ sơ (`af1caa6`)
- docs: kế hoạch sửa UX theo rà soát 09/2026 + quyết định chủ dự án (`2422e17`)

### 2026-09-07
- Add creatable/searchable comboboxes and mobile bottom nav + card list (`f53b53f`)
- Fix remaining listdown/free-text mismatches vs Ma tran spec (`658c962`)
- Rework role permission matrix per business review (`0df4713`)
- Allow all non-Viewer roles to create new complaints (`c4c2506`)
- Initial commit: independent complaint-tracking app (3T) (`8d65dab`)
