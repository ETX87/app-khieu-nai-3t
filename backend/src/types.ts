export const VAI_TRO_VALUES = ["Admin", "Viewer", "CSKH", "KTV", "TN CSKH", "QL"] as const;
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
