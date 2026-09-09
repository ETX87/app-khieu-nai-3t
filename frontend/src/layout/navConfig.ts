import type { VaiTro } from "../api/types";

export type ModuleKey = "trang-chu" | "khieu-nai" | "bao-cao" | "settings" | "users";

// Bao cao (SLA + trung lap): moi vai tro tru "NV Sale"/"Tong dai vien" (KTV cu - chi tao phan anh
// ho khach hang, khong tham gia giam sat/thong ke) va vai tro chua duyet (khong co trong map nay).
export const ROLE_MODULES: Record<VaiTro, ModuleKey[]> = {
  Admin: ["trang-chu", "khieu-nai", "bao-cao", "settings", "users"],
  Viewer: ["trang-chu", "khieu-nai", "bao-cao"],
  CSKH: ["trang-chu", "khieu-nai", "bao-cao"],
  "NV Sale": ["trang-chu", "khieu-nai"],
  "Tổng đài viên": ["trang-chu", "khieu-nai"],
  "TN CSKH": ["trang-chu", "khieu-nai", "bao-cao"],
  QL: ["trang-chu", "khieu-nai", "bao-cao"],
};

// Roles without an assigned vai_tro yet see nothing (should not normally happen once approved).
export const DEFAULT_MODULES: ModuleKey[] = ["trang-chu", "khieu-nai"];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  "trang-chu": "Trang chủ",
  "khieu-nai": "Phản ánh",
  "bao-cao": "Báo cáo",
  settings: "Cấu hình",
  users: "Người dùng",
};

export const ALL_MODULES: ModuleKey[] = ["trang-chu", "khieu-nai", "bao-cao", "settings", "users"];

// Nhom sidebar theo section - module khong thuoc nhom nao (vd "trang-chu") duoc render rieng,
// khong bi bao trong khung nhom nao ca.
export interface NavGroup {
  label: string;
  modules: ModuleKey[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: "Quản lý phản ánh", modules: ["khieu-nai", "bao-cao"] },
  { label: "Hệ thống", modules: ["settings", "users"] },
];
