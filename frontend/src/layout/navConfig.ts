import type { VaiTro } from "../api/types";

export type ModuleKey = "trang-chu" | "khieu-nai" | "bao-cao" | "settings" | "users";

// Bao cao (SLA + trung lap): moi vai tro tru "NV Sale"/"Tong dai vien" (KTV cu - chi tao phan anh
// ho khach hang, khong tham gia giam sat/thong ke) va vai tro chua duyet (khong co trong map nay).
export const ROLE_MODULES: Record<VaiTro, ModuleKey[]> = {
  Admin: ["trang-chu", "bao-cao", "khieu-nai", "settings", "users"],
  Viewer: ["trang-chu", "bao-cao", "khieu-nai"],
  CSKH: ["trang-chu", "bao-cao", "khieu-nai"],
  "NV Sale": ["trang-chu", "khieu-nai"],
  "Tổng đài viên": ["trang-chu", "khieu-nai"],
  "TN CSKH": ["trang-chu", "bao-cao", "khieu-nai"],
  QL: ["trang-chu", "bao-cao", "khieu-nai"],
};

// Roles without an assigned vai_tro yet see nothing (should not normally happen once approved).
export const DEFAULT_MODULES: ModuleKey[] = ["trang-chu", "khieu-nai"];

// Khoa i18n tuong ung tung module, dung voi t(MODULE_I18N_KEY[m]) o Sidebar/BottomNav.
export const MODULE_I18N_KEY: Record<ModuleKey, string> = {
  "trang-chu": "nav.trangChu",
  "khieu-nai": "nav.phanAnh",
  "bao-cao": "nav.baoCao",
  settings: "nav.settings",
  users: "nav.users",
};

export const ALL_MODULES: ModuleKey[] = ["trang-chu", "khieu-nai", "bao-cao", "settings", "users"];

// Nhom sidebar theo section - module khong thuoc nhom nao (vd "trang-chu") duoc render rieng,
// khong bi bao trong khung nhom nao ca.
export interface NavGroup {
  labelKey: string;
  modules: ModuleKey[];
}

// "bao-cao" khong nam trong nhom nao - render dung canh "trang-chu" o dau sidebar (item: bao cao
// gan trang chu tren menu), xem Sidebar.tsx.
export const NAV_GROUPS: NavGroup[] = [
  { labelKey: "nav.groupPhanAnh", modules: ["khieu-nai"] },
  { labelKey: "nav.groupHeThong", modules: ["settings", "users"] },
];
