// Chuan hoa ten tinh ve dung ten trong danh muc (settings_option nhom 'tinh' / 'tinh_moi').
// Nguon sai chinh ta: nguoi dung go tay ("Dak nông", "Đak nông"), du lieu tu he thong ngoai (Ecolada,
// CRM DVBH) viet khac dau / co tien to "Tỉnh"/"TP". So sanh sau khi bo dau + bo tien to + gop khoang
// trang; khop thi tra ve ten chuan, khong khop thi giu nguyen gia tri nguoi dung nhap.

export type NhomTinh = "tinh" | "tinh_moi";

export function foldTinh(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(tinh|thanh pho|tp\.?)\s+/, "");
}

// Cache danh muc theo isolate (danh sach ~63/34 tinh, gan nhu khong doi) - tranh 1 lan doc D1 moi
// lan luu ca. Het han sau 10 phut de nhan tinh Admin moi them.
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<NhomTinh, { at: number; byFold: Map<string, string> }>();

async function danhMuc(db: D1Database, nhom: NhomTinh): Promise<Map<string, string>> {
  const hit = cache.get(nhom);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.byFold;
  const { results } = await db
    .prepare("SELECT gia_tri FROM settings_option WHERE nhom = ? AND active = 1 AND parent IS NULL")
    .bind(nhom)
    .all<{ gia_tri: string }>();
  const byFold = new Map<string, string>();
  for (const r of results) if (!byFold.has(foldTinh(r.gia_tri))) byFold.set(foldTinh(r.gia_tri), r.gia_tri);
  cache.set(nhom, { at: Date.now(), byFold });
  return byFold;
}

export async function chuanHoaTinh(db: D1Database, nhom: NhomTinh, value: unknown): Promise<unknown> {
  if (typeof value !== "string" || value.trim() === "") return value;
  const chuan = (await danhMuc(db, nhom)).get(foldTinh(value));
  return chuan ?? value.trim();
}

// Tim ten chuan (neu co) - dung de chan tao trung trong danh muc.
export async function timTinhChuan(db: D1Database, nhom: NhomTinh, value: string): Promise<string | undefined> {
  return (await danhMuc(db, nhom)).get(foldTinh(value));
}
