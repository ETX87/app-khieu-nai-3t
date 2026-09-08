import type { Env } from "../types";

export interface DvbhCasePreview {
  ky_thuat_vien: string | null; khach_hang: string | null; tien_do_hoan_thanh: string | null;
  noi_dung_xu_ly: string | null; thoi_gian_cskh_tiep_nhan: string | null; thoi_gian_hoan_thanh: string | null;
  // Bổ sung: DVBH trả kèm để tự điền form tạo phản ánh (item 8)
  model: string | null; tinh: string | null; quan_huyen: string | null; phuong_xa: string | null;
  so_dien_thoai: string | null;
  [key: string]: unknown;
}
export interface DvbhGiaiTrinhRow { case_id: string; ly_do_cham: string; noi_dung: string | null; ngay_giai_trinh: string; }
export interface DvbhLookupResult { found: boolean; preview: DvbhCasePreview | null; giaiTrinh: DvbhGiaiTrinhRow[]; }

export async function lookupDvbhCase(env: Env, id: string): Promise<DvbhLookupResult> {
  const url = `${env.DVBH_API_BASE}/api/partner/case-lookup?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { "X-API-Key": env.DVBH_PARTNER_API_KEY } });
  if (!res.ok) throw new Error(`DVBH_LOOKUP_HTTP_${res.status}`);
  return res.json();
}

export function formatGiaiTrinhHistory(rows: DvbhGiaiTrinhRow[]): string {
  if (rows.length === 0) return "";
  return rows.map((r) => `[${r.ngay_giai_trinh}] ${r.ly_do_cham}${r.noi_dung ? ": " + r.noi_dung : ""}`).join("\n");
}
