import type { Env } from "../types";

// Toan bo cot ma "/api/partner/case-lookup" ben dvbh tra ve (xem CASE_LOOKUP_COLUMNS trong
// partnerApi.ts cua he do) - khai bao du de man chi tiet ben nay (KhieuNaiDetail.tsx) hien duoc
// day du thong tin xu ly cua KTV (cach thuc xu ly, dinh gia, nganh hang...), khong chi tap con
// dung de tu dien form tao phan anh (item 8).
export interface DvbhCasePreview {
  ky_thuat_vien: string | null; khach_hang: string | null; seri_san_pham: string | null;
  khu_vuc: string | null; tinh: string | null; quan_huyen: string | null; hang: string | null;
  san_pham_bao_hanh: string | null; tien_do_hoan_thanh: string | null; mo_ta_loi: string | null;
  nhom_san_pham: string | null; nhom_yeu_cau: string | null; loai_yeu_cau: string | null;
  hinh_thuc_bao_hanh: string | null; ngay_mua: string | null;
  thoi_gian_cskh_tiep_nhan: string | null; thoi_gian_hen_xu_ly: string | null; thoi_gian_hoan_thanh: string | null;
  doi_tac: string | null; link_crm: string | null; noi_dung_xu_ly: string | null;
  luu_y_loi_linh_kien: string | null; cach_thuc_xu_ly: string | null;
  nganh: string | null; loai_nganh: string | null; nhom_kh: string | null;
  dt_san_pham: string | number | null; dt_linh_kien: string | number | null; dt_dich_vu: string | number | null;
  ly_do_qua_han: string | null; ngay_import: string | null; ngay_cap_nhat_gan_nhat: string | null;
  dung_han: string | number | null; xu_ly_24h_bucket: string | null; ly_do_huy: string | null;
  link_hinh_anh: string[] | string | null;
  [key: string]: unknown;
}
export interface DvbhGiaiTrinhRow {
  case_id: string; ly_do_cham: string; noi_dung: string | null; ngay_giai_trinh: string;
  nguoi_giai_trinh?: string;
}
export interface DvbhLookupResult { found: boolean; preview: DvbhCasePreview | null; giaiTrinh: DvbhGiaiTrinhRow[]; }

export async function lookupDvbhCase(env: Env, id: string): Promise<DvbhLookupResult> {
  const url = `${env.DVBH_API_BASE}/api/partner/case-lookup?id=${encodeURIComponent(id)}`;
  // Dùng Service Binding (env.DVBH_SERVICE.fetch) thay vì fetch() mạng thật - fetch() thẳng URL từ
  // 1 Worker khác cùng tài khoản Cloudflare bị chặn với lỗi 1042 (chống SSRF), xem types.ts.
  const res = await env.DVBH_SERVICE.fetch(url, { headers: { "X-API-Key": env.DVBH_PARTNER_API_KEY } });
  if (!res.ok) throw new Error(`DVBH_LOOKUP_HTTP_${res.status}`);
  return res.json();
}

export function formatGiaiTrinhHistory(rows: DvbhGiaiTrinhRow[]): string {
  if (rows.length === 0) return "";
  return rows.map((r) => `[${r.ngay_giai_trinh}] ${r.ly_do_cham}${r.noi_dung ? ": " + r.noi_dung : ""}`).join("\n");
}
