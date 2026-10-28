import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { lookupOrdersByIdLada, ngayLadaSangVN } from "./center3tClient";
import { dongBoCrmLo } from "../routes/khieuNai";

// Cron dong bo tu dong (GD1 ke hoach "Quan ly ca ton & Loi vi pham", chot 28/10/2026) - chay moi gio
// trong ngay (wrangler.jsonc triggers.crons). Truoc day du lieu CRM chi cap nhat khi co nguoi bam nut ->
// cac loi vi pham tinh theo moc CRM/Lada se chay tren du lieu cu.

// Moi lan cron: toi da CRM_MOI_LAN ca (moi ca 1 subrequest toi DVBH; giu duoi gioi han subrequest/lan
// chay Worker), bo qua ca vua dong bo trong BO_QUA_PHUT phut. ~136 ca ton / 35 ca moi gio -> moi ca
// duoc lam moi khoang 4 gio/lan.
const CRM_MOI_LAN = 35;
const BO_QUA_PHUT = 50;
const LADA_MOI_LAN = 500; // API Ecolada nhan toi 20.000 ma/lan - 1 lan goi la du

function vnTruPhut(phut: number): string {
  return new Date(Date.now() + 7 * 3_600_000 - phut * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

type LadaRow = Record<string, string>;

function ladaFields(row: LadaRow | undefined): { ngayChot: string | null; trangThai: string | null } {
  if (!row) return { ngayChot: null, trangThai: null };
  return { ngayChot: ngayLadaSangVN(row["Ngày Chốt Đơn"]), trangThai: row["Trạng thái"]?.trim() || null };
}

// Moc "dong case tren Lada" (loi L2) = "Ngay Chot Don" cua ID LADA PHAT SINH. Chi lay ca dang mo chua co
// moc chot (da chot thi moc khong doi nua, khong can hoi lai).
export async function dongBoLadaPhatSinh(env: Env): Promise<{ hoi: number; daChot: number; warning?: string }> {
  const rows = await env.DB.prepare(
    `SELECT id, id_lada_phat_sinh FROM khieu_nai
     WHERE COALESCE(id_lada_phat_sinh, '') <> '' AND lada_ps_ngay_chot IS NULL
       AND trang_thai NOT IN ('Da ket thuc', 'Huy')
     ORDER BY lada_ps_sync_at IS NOT NULL, lada_ps_sync_at LIMIT ?`,
  ).bind(LADA_MOI_LAN).all<{ id: string; id_lada_phat_sinh: string }>();
  if (rows.results.length === 0) return { hoi: 0, daChot: 0 };

  const codes = [...new Set(rows.results.map((r) => r.id_lada_phat_sinh.trim()))];
  const res = await lookupOrdersByIdLada(env, codes);
  if (!res.ok) return { hoi: codes.length, daChot: 0, warning: res.warning };

  const ts = nowVN();
  let daChot = 0;
  const stmts = rows.results.map((r) => {
    const f = ladaFields(res.rows.get(r.id_lada_phat_sinh.trim()));
    if (f.ngayChot) daChot++;
    return env.DB.prepare(
      "UPDATE khieu_nai SET lada_ps_ngay_chot = ?, lada_ps_trang_thai = COALESCE(?, lada_ps_trang_thai), lada_ps_sync_at = ? WHERE id = ?",
    ).bind(f.ngayChot, f.trangThai, ts, r.id);
  });
  await env.DB.batch(stmts);
  return { hoi: codes.length, daChot };
}

// Tra cuu ngay khi CSKH luu/sua ID Lada phat sinh (PATCH /khieu-nai/:id) - tra ve cac cot can ghi.
// Loi mang -> chi ghi lai moc da thu, de cron thu lai sau.
export async function traCuuLadaPhatSinh(
  env: Env,
  code: string | null,
): Promise<{ lada_ps_ngay_chot: string | null; lada_ps_trang_thai: string | null; lada_ps_sync_at: string | null }> {
  if (!code) return { lada_ps_ngay_chot: null, lada_ps_trang_thai: null, lada_ps_sync_at: null };
  const res = await lookupOrdersByIdLada(env, [code]).catch(() => null);
  const f = res?.ok ? ladaFields(res.rows.get(code)) : { ngayChot: null, trangThai: null };
  return { lada_ps_ngay_chot: f.ngayChot, lada_ps_trang_thai: f.trangThai, lada_ps_sync_at: nowVN() };
}

export async function chayDongBoTuDong(env: Env): Promise<void> {
  try {
    const crm = await dongBoCrmLo(env, vnTruPhut(BO_QUA_PHUT), CRM_MOI_LAN);
    console.log("[dongBoTuDong] CRM", { xuLy: crm.results.length, loi: crm.results.filter((r) => !r.ok).length, conLai: crm.can - crm.results.length });
  } catch (err) {
    console.error("[dongBoTuDong] CRM loi", err);
  }
  try {
    console.log("[dongBoTuDong] Lada phat sinh", await dongBoLadaPhatSinh(env));
  } catch (err) {
    console.error("[dongBoTuDong] Lada loi", err);
  }
}
