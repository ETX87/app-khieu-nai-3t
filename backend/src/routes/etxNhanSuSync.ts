import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { runEtxNhanSuSyncWithState } from "../lib/etxNhanSuSync";

// Quan tri "ETX nhan su" (xem lib/etxNhanSuSync.ts) - danh ba nhan su dong bo tu he ETX, du lieu nhay
// cam hon danh sach users thuong nen Admin-only toan bo router. Cron trong index.ts (scheduled()) goi
// thang runEtxNhanSuSyncWithState() moi ngay luc 3h sang gio VN, khong qua route nay.
const etxNhanSuSync = new Hono<{ Bindings: Env }>();
etxNhanSuSync.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

interface EtxNhanSuSyncStateRow {
  last_run_at: string | null;
  last_status: string | null;
  changed_count: number;
  last_error: string | null;
}

// GET /?search=&trang_thai=on|off - danh sach danh ba, LEFT JOIN users theo gmail (khop truc tiep,
// App Khieu Nai khong co bang trung gian nhu ktv_lien_he) de hien "Tai khoan lien ket" tham khao.
etxNhanSuSync.get("/", async (c) => {
  const search = c.req.query("search")?.trim().normalize("NFC");
  const trangThai = c.req.query("trang_thai")?.trim();

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    conditions.push(
      "(LOWER(e.ma_nhan_su) LIKE LOWER(?) OR LOWER(e.ho_ten) LIKE LOWER(?) OR LOWER(COALESCE(e.gmail,'')) LIKE LOWER(?))",
    );
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (trangThai === "on" || trangThai === "off") {
    conditions.push("e.trang_thai_lam_viec = ?");
    binds.push(trangThai);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { results } = await c.env.DB.prepare(
    `SELECT e.*, u.vai_tro AS lien_ket_vai_tro, u.trang_thai_duyet AS lien_ket_trang_thai_duyet, u.bi_khoa AS lien_ket_bi_khoa
     FROM etx_nhan_su e LEFT JOIN users u ON LOWER(u.email) = LOWER(e.gmail) ${where} ORDER BY e.ho_ten`,
  )
    .bind(...binds)
    .all();
  return c.json({ items: results });
});

etxNhanSuSync.get("/sync-status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT last_run_at, last_status, changed_count, last_error FROM etx_nhan_su_sync_state WHERE id = 1",
  ).first<EtxNhanSuSyncStateRow>();
  return c.json(row ?? { last_run_at: null, last_status: null, changed_count: 0, last_error: null });
});

etxNhanSuSync.post("/sync/run", async (c) => {
  await runEtxNhanSuSyncWithState(c.env, c.env.DB);
  const row = await c.env.DB.prepare(
    "SELECT last_run_at, last_status, changed_count, last_error FROM etx_nhan_su_sync_state WHERE id = 1",
  ).first<EtxNhanSuSyncStateRow>();
  return c.json(row);
});

export default etxNhanSuSync;
