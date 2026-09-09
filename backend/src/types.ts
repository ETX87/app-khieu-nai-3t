// "KTV" (2026-09) tách thành "NV Sale" + "Tổng đài viên" - 2 vai trò cùng luồng quy trình/quyền hạn
// như KTV cũ, chỉ khác nhãn hiển thị để phân loại người tạo phản ánh. Xem KTV_LIKE_ROLES (routes/
// khieuNai.ts) cho danh sách nơi 2 vai trò này được xử lý gộp như KTV cũ.
export const VAI_TRO_VALUES = ["Admin", "Viewer", "CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL"] as const;
export type VaiTro = (typeof VAI_TRO_VALUES)[number];
export type TrangThaiDuyet = "Cho duyet" | "Da duyet" | "Tu choi";

export interface AppUser {
  email: string;
  ten: string | null;
  vai_tro: VaiTro | null;
  trang_thai_duyet: TrangThaiDuyet;
  bi_khoa: boolean;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOOTSTRAP_ADMIN_EMAIL: string;
  GOOGLE_REDIRECT_URI: string;
  FRONTEND_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  DVBH_API_BASE: string;
  DVBH_PARTNER_API_KEY: string;
  // Service Binding (RPC nội bộ qua Cloudflare, KHÔNG fetch() mạng thật) tới Worker "dvbh" - cùng 1
  // tài khoản Cloudflare nên fetch() thẳng URL bị chặn lỗi 1042 (chống SSRF Worker-gọi-Worker), xem
  // linh-kien-app/backend/src/types.ts (CASE_LOOKUP_SERVICE) - đã xác nhận đây là nguyên nhân thật
  // của "tra cứu ID CRM luôn lỗi" (2026-09-09), không phải do API key.
  DVBH_SERVICE: Fetcher;
  LOCAL_DEV_BYPASS_AUTH?: string;
}

// Registers the keys set via c.set()/read via c.get() across middleware so that
// `Context<{ Bindings: Env }>` (without an explicit Variables generic) type-checks
// everywhere — mirrors the reference app's convention.
declare module "hono" {
  interface ContextVariableMap {
    email: string;
    user: AppUser;
  }
}
