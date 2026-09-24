# 🎨 QUY TẮC THIẾT KẾ GIAO DIỆN (DESIGN SYSTEM) — PHẢN ÁNH 3T

Chuẩn hoá ngôn ngữ thiết kế cho app **Tiếp nhận phản ánh 3T** (App Khiếu nại). Kế thừa bố cục/triết lý
của Design System **CCDC 3T** (3T Asset Management), nhưng **đổi gam màu chủ đạo sang tím–chàm lấy trực
tiếp từ icon app** (`frontend/public/icon-512.png`). Mọi màn hình, module, tính năng mới đều phải tuân
theo tài liệu này.

> Nguồn sự thật (source of truth) trong code:
> - Token màu: `frontend/src/index.css` (`:root`)
> - Ánh xạ Tailwind: `frontend/tailwind.config.js` (`brand-*`, `accent*`, `ink*`, `line*`, `shadow-card/pop/brand`, `bg-sidebar/hero`)
> - Bộ UI dùng chung: `frontend/src/components/ui/*`
>
> Nếu tài liệu và code lệch nhau → sửa cả hai cùng lúc, không để trôi.

---

## 1. TRIẾT LÝ THIẾT KẾ

- **Modern Enterprise SaaS**: gọn, hiện đại, chuyên nghiệp, lấy người dùng nghiệp vụ (CSKH, KTV, TN CSKH, QL) làm trọng tâm.
- **Data-Dense but Breathable**: mật độ thông tin cao trên desktop nhưng không rối mắt nhờ khoảng cách, phân cấp chữ và nền pastel.
- **Brand Signature (Violet Indigo)**: nền điều hướng gradient tím đậm giống icon; tím `brand-600` là màu hành động; nền trang trắng ánh tím nhạt.
- **Mobile-first cho người lớn tuổi**: người dùng 40–50 tuổi thao tác chủ yếu trên điện thoại → chữ/nút/ô nhập **to hơn trên mobile**, trả về mật độ gọn cho desktop bằng `lg:` (xem §3.2). Đây là quy tắc **ưu tiên cao hơn** các cỡ chữ nhỏ trong CCDC 3T.
- **Fit-to-Viewport** trên desktop (1080p): hạn chế cuộn không cần thiết.

---

## 2. HỆ THỐNG MÀU SẮC

### 2.1. Màu thương hiệu (trích từ icon app)

Lấy mẫu trực tiếp từ icon: góc tối `#5B21DB`/`#6028E3` → thân `#6D32E8` → vùng sáng `#8B53FB` → highlight `#AD8BFC`.

| Token CSS | Tailwind | Hex | Ứng dụng |
| :--- | :--- | :--- | :--- |
| `--brand-50` | `brand-50` / `accent-soft` | `#F5F1FF` | Nền item đang chọn, hover nút phụ, nền nhấn nhẹ |
| `--brand-100` | `brand-100` | `#ECE4FF` | Nền thẻ KPI tím (điểm cuối gradient), thanh tiến độ |
| `--brand-200` | `brand-200` | `#D9CAFE` | Viền nhấn nhẹ khi hover, ring badge tím |
| `--brand-300` | `brand-300` | `#BDA2FC` | Viền hover nút phụ |
| `--brand-400` | `brand-400` | `#A07AFB` | Điểm cuối gradient thanh biểu đồ |
| `--brand-500` | `brand-500` | `#8B53FB` | Vùng sáng icon — điểm cuối banner hero |
| `--brand-600` | `brand-600` / **`accent`** | `#6D32E8` | **Màu chủ đạo**: nút chính, tab/filter active, focus, số liệu tím |
| `--brand-700` | `brand-700` / `accent-dark` / `accent-ink` | `#5B21DB` | Hover nút chính, chữ trên nền `accent-soft`, `theme-color` PWA |
| `--brand-800` | `brand-800` | `#4A1BB0` | Số KPI tone tím |
| `--brand-900` | `brand-900` | `#36157F` | Dự phòng (chữ đậm trên nền tím nhạt) |

| Token | Giá trị | Ứng dụng |
| :--- | :--- | :--- |
| `--sidebar-gradient` (`bg-sidebar`) | `linear-gradient(180deg, #5B21DB 0%, #4F1CC4 45%, #431AA6 80%, #5A2AD0 100%)` | Sidebar desktop, drawer mobile, header mobile |
| `bg-hero` | `linear-gradient(120deg, brand-700 → brand-600 → brand-500)` | Banner chào mừng Trang chủ |
| Sidebar item active | `rgba(255,255,255,0.22)` + viền trong `rgba(255,255,255,0.12)` | Menu đang chọn |
| Sidebar item hover | `rgba(255,255,255,0.10)` | Menu khi rê chuột |

> ⚠️ **Không gõ cứng mã hex tím** (`#7c3aed`, `violet-600`…) trong component để biểu thị thương hiệu. Luôn dùng `accent*` / `brand-*`.
> Tailwind `violet-*` chỉ còn dùng cho **ngữ nghĩa riêng** đã có từ trước (mức độ "Nghiêm trọng", khối tra cứu Lada, mốc timeline QL).

### 2.2. Nền & Bề mặt

| Token | Tailwind | Hex | Ứng dụng |
| :--- | :--- | :--- | :--- |
| `--bg` | `bg-bg` | `#F6F5FC` | Nền toàn trang (trắng ánh tím dịu) |
| `--surface` | `bg-surface` | `#FFFFFF` | Card, modal, dropdown, bottom nav |
| `--surface-2` | `bg-surface-2` | `#F5F3FB` | Header bảng, nền nhóm filter pill, khối phụ, hover dòng trung tính |
| `--field-bg` | `bg-field-bg` | `#F8F7FD` | Nền ô nhập liệu (lõm nhẹ) |

### 2.3. Chữ

| Token | Tailwind | Hex | Ứng dụng |
| :--- | :--- | :--- | :--- |
| `--ink` | `text-ink` | `#0F172A` | Tiêu đề, số liệu, nội dung quan trọng |
| `--ink-body` | `text-ink-body` | `#334155` | Chữ nội dung, nhãn form, ô bảng, nhãn KPI |
| `--ink-soft` | `text-ink-soft` | `#5B6477` | Mô tả phụ, ngày giờ, header bảng (đậm hơn `#64748B` của CCDC một chút cho dễ đọc) |
| `--ink-faint` | `text-ink-faint` | `#94A3B8` | Placeholder, chú thích mờ, trạng thái disabled |
| `--link` | `text-link` | `#0284C7` | **Mã định danh bấm được** (Mã KN), link CRM/tra cứu |

### 2.4. Viền

| Token | Tailwind | Hex | Ứng dụng |
| :--- | :--- | :--- | :--- |
| `--line` | `border-line` | `#EBE8F4` | Viền card, kẻ dòng bảng, phân cách — rất mờ |
| `--line-strong` | `border-line-strong` | `#D6D2E4` | Viền nút phụ, select lọc, ô tháng |
| `--field-border` | `border-field-border` | `#C3BDD8` | Viền ô nhập liệu — **cố ý rõ hơn** để người lớn tuổi thấy ngay chỗ cần nhập |

**Không** dùng viền đen đậm, viền đôi, viền tím gắt (trừ trạng thái focus và cờ cắm).

### 2.5. Bảng màu Pastel theo nhóm nghiệp vụ (KPI & trạng thái)

| Tone | Nền thẻ (gradient) | Icon tròn | Chữ số | Nghiệp vụ trong app |
| :--- | :--- | :--- | :--- | :--- |
| `brand` (Tím) | `brand-50 → brand-100` | `brand-600` | `brand-800` | Tổng phản ánh, Chờ TN CSKH |
| `blue` (Xanh dương) | `#EEF5FE → #DCEBFD` | `blue-500` | `blue-800` | Đang xử lý |
| `cyan` (Xanh ngọc) | `#E6F9FB → #D2F3F7` | `cyan-500` | `cyan-800` | Chờ đồng bộ CRM |
| `amber` (Cam vàng) | `#FFF9E7 → #FEF0C7` | `amber-500` | `amber-800` | Chờ chốt kết thúc, cần xử lý |
| `green` (Xanh lá) | `#EAFBF1 → #D4F5E2` | `emerald-500` | `emerald-800` | Đã kết thúc |
| `red` (Đỏ) | `#FEF1F1 → #FDE0E0` | `red-500` | `red-700` | Chờ tiếp nhận, ID CRM sai, Quá hạn |
| `slate` (Xám) | `#F4F5F8 → #E8EAF0` | `slate-500` | `slate-700` | Đã hủy |

Badge trạng thái phản ánh (`StatusBadge`, `components/ui/Badge.tsx`) — nền nhạt + chữ đậm + ring mảnh cùng tông:

| Trạng thái | Tone | Chấm tròn `•` |
| :--- | :--- | :--- |
| Chờ tiếp nhận | `red` | Có (đang chờ người xử lý) |
| Đang xử lý | `blue` | — |
| Chờ chốt kết thúc | `amber` | Có |
| Đã kết thúc | `green` | — |
| Hủy | `gray` | — |

Màu **mức độ** (`lib/severity.ts`) và **cắm cờ** (viền đỏ/vàng toả sáng) giữ nguyên — người dùng đã quen, không đổi theo thương hiệu.

---

## 3. TYPOGRAPHY

- **Phông chữ**: `'Plus Jakarta Sans'` (Google Fonts, có subset tiếng Việt, weight 400–800), fallback `-apple-system, "Segoe UI", Roboto, sans-serif`. Nạp ở `frontend/index.html`, khai báo `fontFamily.sans` trong Tailwind.

### 3.1. Cấp bậc chữ

| Cấp bậc | Mobile | Desktop (`lg:`) | Weight | Màu | Ví dụ |
| :--- | :--- | :--- | :--- | :--- | :--- |
| KPI Value | `28px` | `28px` | 800 | theo tone | Số trên thẻ Trang chủ |
| Page Title | `text-xl` (20px) | `21px` | 700 | `ink` | "Phản ánh", "Báo cáo" |
| Brand Title | `text-base` | `text-base` | 700 | trắng | "Phản ánh 3T" trên sidebar |
| Card Title | `15px` | `text-sm` (14px) | 700 | `ink` | Tiêu đề `Card` |
| Sidebar Menu | `text-base` | `13.5px` | 500 / 600 active | trắng 85% / trắng | Menu dọc |
| Form input / nội dung | `text-base` (16px) | `text-sm` | 400 | `ink` | `Input`, `Select`, `Combobox` |
| Nhãn form | `text-xs` | `text-xs` | 600 | `ink-body` | `Field` label |
| Header bảng | `text-xs` | `text-xs` | 600 | `ink-soft` | Không viết HOA toàn bộ |
| Caption | `text-xs` | `11px` | 400 | `ink-soft` / `ink-faint` | Gợi ý, ngày giờ |
| Badge | `text-xs` | `text-xs` | 600 | theo tone | Trạng thái |

### 3.2. Quy tắc "to trên mobile, gọn trên desktop"

Class to làm **mặc định**, thêm `lg:` trả về kích thước gọn cho desktop:

```tsx
"px-3 py-2.5 text-base lg:px-2.5 lg:py-1.5 lg:text-sm"   // ô nhập
"px-5 py-3 text-base lg:px-3.5 lg:py-2 lg:text-sm"       // Btn size="touch"
```

- Ô nhập trên mobile ≥ 44px chiều cao, chữ **16px** (tránh iOS tự zoom khi focus).
- Nút hành động chính trên mobile dùng `Btn size="touch"` (~48px).
- Không dùng `text-[10px]`/`text-[11px]` cho nội dung cần đọc trên mobile.

---

## 4. BỐ CỤC KHUNG TRANG

```
Desktop (md+)                                         Mobile (< md)
┌──────────────┬───────────────────────────────┐      ┌──────────────────────────┐
│ SIDEBAR      │ MAIN  (p-6, gap 14–16px)      │      │ HEADER gradient tím      │
│ bg-sidebar   │  Page title + hành động chính │      │ [icon] Phản ánh 3T   🔔  │
│ w-64 / w-16  │  Hero (Trang chủ)             │      ├──────────────────────────┤
│ (thu gọn)    │  KPI grid (2→4→5→10 cột)      │      │ MAIN (p-4, pb-20)        │
│ Logo + 🔔    │  Card nội dung / bảng         │      │  Card, danh sách thẻ     │
│ Menu nhóm    │                               │      ├──────────────────────────┤
│ User + ver.  │                               │      │ BOTTOM NAV (4 + Tài khoản)│
└──────────────┴───────────────────────────────┘      └──────────────────────────┘
```

- **Sidebar** (`layout/Sidebar.tsx`): nền `bg-sidebar`, chữ trắng; item cao ~40px, bo `8px`; nhãn nhóm `11px` HOA trắng 55%; badge đếm đỏ `#EF4444` viền trắng.
- **Header mobile** (`App.tsx`): cùng gradient sidebar để nhận diện thương hiệu, chuông thông báo `onDark`.
- **Bottom nav** (`layout/BottomNav.tsx`): nền trắng 95% + blur, item active có "viên nang" `accent-soft` sau icon, chữ `accent` đậm.
- **Nội dung**: `p-4` mobile / `p-6` desktop; khoảng cách khối `gap-3.5`–`gap-4`.

---

## 5. BO GÓC, VIỀN & ĐỔ BÓNG

| Thành phần | Bo góc | Tailwind |
| :--- | :--- | :--- |
| Card, modal, thẻ danh sách | 12px | `rounded-xl` |
| Thẻ KPI, banner hero | 14px | `rounded-[14px]` |
| Nút, ô nhập, select, dropdown, toast | 8px | `rounded-lg` |
| Filter pill / nhóm segment | 12px | `rounded-xl` |
| Badge, avatar, icon tròn, chấm đếm | tròn | `rounded-full` |
| Màn đăng nhập, hộp phiên hết hạn | 16px | `rounded-2xl` |

**Không dùng `rounded-md` / `rounded`** cho thành phần mới.

| Đổ bóng | Tailwind | Giá trị | Dùng cho |
| :--- | :--- | :--- | :--- |
| Card | `shadow-card` | `0 1px 3px rgba(15,23,42,.04)` | Card, thẻ danh sách, thẻ KPI |
| Nổi | `shadow-pop` | `0 4px 16px rgba(15,23,42,.08)` | Dropdown, toast, hover thẻ KPI |
| Thương hiệu | `shadow-brand` | `0 2px 8px rgba(91,33,219,.25)` | Nút chính, filter active, hero, header mobile |

---

## 6. THÀNH PHẦN CHUẨN

### 6.1. Nút (`Btn`)
- `primary`: nền `accent`, chữ trắng, `shadow-brand`, hover `accent-dark`.
- `secondary`: nền trắng, viền `line-strong`, chữ `ink-body`; hover nền `accent-soft` + chữ `accent-ink`.
- `ghost`: trong suốt, hover `accent-soft`.
- `danger`: đỏ `red-600` — chỉ cho hành động phá huỷ (Hủy ca, Xoá).
- Mọi nút: `rounded-lg`, `font-semibold`, focus-visible ring `accent/25` 3px.
- Cỡ: `sm` (nút trong bảng/sao chép), `md` (mặc định), `touch` (hành động chính trên mobile).

### 6.2. Ô nhập (`Input`, `Textarea`, `Select`, `Combobox`, `FilterSelect`)
- Nền `field-bg`, viền `field-border`, `rounded-lg`.
- Focus: viền `accent` + nền trắng + glow `ring-[3px] ring-accent/15`.
- Disabled: viền `line`, nền `surface-2`, chữ `ink-faint`.
- Select lọc ở thanh công cụ (`selCls`): nền trắng, viền `line-strong`, cùng kiểu focus.
- Combobox tự bật tìm kiếm khi > 5 lựa chọn (`FilterSelect`); dropdown `rounded-lg shadow-pop`.

### 6.3. Card (`Card`)
- `rounded-xl border-line bg-surface shadow-card`; header `px-4 py-3` kẻ dưới `line`, tiêu đề bold.

### 6.4. Thẻ KPI (`StatCard` — `HomeModule.tsx`)
1. Icon tròn 38–40px nền đậm theo tone, icon trắng.
2. Watermark cùng icon 54px, opacity 12%, góc phải dưới.
3. Tên chỉ số 12–14px weight 600 `ink-body`.
4. Số liệu 28px weight 800 màu đậm theo tone.
5. Bấm được → hover nhấc lên `-translate-y-0.5` + `shadow-pop`.

### 6.5. Bảng (`Table`)
- Header: nền `surface-2`, chữ `text-xs` 600 `ink-soft`, **không** viết hoa toàn bộ; cột sắp xếp active màu `accent`.
- Dòng: `py-2`, chữ `ink-body`, kẻ `line`; hover `accent-soft/60` (dòng có màu mức độ dùng hover riêng của mức độ).
- **Mã phiếu (Mã KN)**: `font-mono font-semibold text-link`.
- Mobile: thay bảng bằng thẻ (`KhieuNaiCard`, card báo cáo) — `md:hidden` / `hidden md:block`.

### 6.6. Bộ lọc nhanh (filter pill / segment)
- Nhóm: `rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line`.
- Item: `rounded-xl font-semibold`; active `bg-accent text-white shadow-brand`; inactive `text-ink-soft`, hover nền trắng + chữ `accent-ink`.
- Số đếm trong pill: active `bg-white/25`, inactive `bg-surface`.

### 6.7. Tabs (`Tabs`)
- Kiểu gạch chân: active viền dưới + chữ `accent`; tab có dữ liệu chữ `ink`, tab rỗng `ink-faint`; số đếm đỏ tròn.
- Trên mobile **không dùng tab** để ẩn nội dung — xếp dọc các khối (có thể thu gọn).

### 6.8. Modal & Drawer
- Modal `rounded-xl` (full-screen trên mobile), tiêu đề 16px bold; nút đóng vùng chạm ≥ 40px trên mobile, hover `accent-soft`.
- Overlay `bg-black/40–50`.

### 6.9. Thông báo (Toast)
- `rounded-lg shadow-pop font-medium`; info nền `ink`, success `green-600`, error `red-600`.

---

## 7. CHECKLIST KHI LÀM MÀN HÌNH / TÍNH NĂNG MỚI

1. Dùng component trong `components/ui/*` trước; chỉ viết class riêng khi không có component phù hợp.
2. Màu thương hiệu → `accent` / `brand-*`; màu chữ → `ink` / `ink-body` / `ink-soft` / `ink-faint`; viền → `line` / `line-strong`. Không dùng `gray-*` cho nền/viền mới.
3. Bo góc theo §5 (`rounded-lg` / `rounded-xl`), đổ bóng `shadow-card` / `shadow-pop` / `shadow-brand`.
4. Kích thước theo §3.2: to trên mobile, `lg:` về gọn trên desktop.
5. Có bảng → có phương án thẻ cho mobile.
6. Trạng thái dùng `StatusBadge` / `Badge` với tone ở §2.5, không tự chế màu.
7. Kiểm tra cả 375px (mobile) và desktop trước khi commit.
