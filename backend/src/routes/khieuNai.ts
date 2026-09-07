import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { lookupDvbhCase, formatGiaiTrinhHistory } from "../lib/dvbhClient";

const app = new Hono<{ Bindings: Env }>();
app.use("*", verifySessionMiddleware, loadUser);

const DANH_GIA_VALUES = new Set(["Khong", "Co", "Chua danh gia"]);

const CSKH_FIELDS = [
  "ten_khach", "id_lada", "sale_khu_vuc", "tinh", "quan_huyen", "phuong_xa", "model", "hang",
  "thong_tin_ban_dau", "nguoi_bao", "muc_do", "nhom_yeu_cau", "nhom_van_de", "van_de_dau_vao",
  "phan_loai_kh", "ghi_chu_nguoi_tao", "bo_phan_ban_giao", "ma_duyet_doi_linh_kien", "cam_co",
  "ghi_chu_ly_do_cham", "id_lada_phat_sinh", "ngay_ghi_nhan_doi_may", "ngay_dong_doi_may",
  "giai_trinh_cham_doi_may", "ket_qua_doi_may", "nguoi_xac_nhan_doi_may", "id_crm_karofi",
];

const TN_CSKH_FIELDS = [
  "loi_nha_san_xuat", "loi_lap_dat", "loi_thai_do_ktv", "loi_quy_trinh_nskx", "ket_luan_khieu_nai",
];

const QL_FIELDS = ["danh_gia_ql", "ql_gio_xu_ly", "ql_chon_ngay_hen", "ql_chon_ly_do"];

async function generateId(db: D1Database): Promise<string> {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  const prefix = `KN-${y}${m}${d}-`;
  const row = await db.prepare("SELECT COUNT(*) as cnt FROM khieu_nai WHERE id LIKE ?").bind(`${prefix}%`).first<{ cnt: number }>();
  const seq = (row?.cnt ?? 0) + 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

interface CrmFields {
  ngay_tiep_nhan_crm: string | null;
  ket_qua_crm: string | null;
  thong_tin_xu_ly_crm: string | null;
  ngay_ktv_hoan_thanh: string | null;
  thong_tin_giai_trinh_dvbh: string;
}

async function tryLookupCrm(env: Env, idCrmKarofi: string): Promise<{ fields: CrmFields | null; warning?: string }> {
  try {
    const result = await lookupDvbhCase(env, idCrmKarofi);
    if (!result.found || !result.preview) return { fields: null, warning: "DVBH_NOT_FOUND" };
    return {
      fields: {
        ngay_tiep_nhan_crm: result.preview.thoi_gian_cskh_tiep_nhan ?? null,
        ket_qua_crm: result.preview.tien_do_hoan_thanh ?? null,
        thong_tin_xu_ly_crm: result.preview.noi_dung_xu_ly ?? null,
        ngay_ktv_hoan_thanh: result.preview.thoi_gian_hoan_thanh ?? null,
        thong_tin_giai_trinh_dvbh: formatGiaiTrinhHistory(result.giaiTrinh),
      },
      warning: undefined,
    };
  } catch {
    return { fields: null, warning: "DVBH_LOOKUP_FAILED" };
  }
}

app.get("/", async (c) => {
  const trangThai = c.req.query("trang_thai");
  const idCrmKarofi = c.req.query("id_crm_karofi");
  const q = c.req.query("q");
  let page = parseInt(c.req.query("page") ?? "1", 10);
  let pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (trangThai) { conditions.push("trang_thai = ?"); binds.push(trangThai); }
  if (idCrmKarofi) { conditions.push("id_crm_karofi = ?"); binds.push(idCrmKarofi); }
  if (q) {
    conditions.push("(ten_khach LIKE ? OR id_lada LIKE ? OR id LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const [list, count] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM khieu_nai ${where} ORDER BY ngay_tiep_nhan DESC LIMIT ? OFFSET ?`)
      .bind(...binds, pageSize, offset)
      .all(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM khieu_nai ${where}`).bind(...binds).first<{ cnt: number }>(),
  ]);

  return c.json({ items: list.results, total: count?.cnt ?? 0, page, pageSize });
});

// GET /api/khieu-nai/stats - so lieu that cho Trang chu (khong phai du lieu mau/gia lap) - dat
// TRUOC "/:id" vi Hono khop route theo thu tu, dat sau se bi "/:id" nuot mat "stats" lam id.
app.get("/stats", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as tong,
       SUM(CASE WHEN trang_thai = 'Dang xu ly' THEN 1 ELSE 0 END) as dang_xu_ly,
       SUM(CASE WHEN trang_thai = 'Cho chot ket thuc' THEN 1 ELSE 0 END) as cho_chot_ket_thuc,
       SUM(CASE WHEN trang_thai = 'Da ket thuc' THEN 1 ELSE 0 END) as da_ket_thuc,
       SUM(CASE WHEN trang_thai = 'Huy' THEN 1 ELSE 0 END) as huy,
       SUM(CASE WHEN id_crm_karofi IS NOT NULL AND ngay_ktv_hoan_thanh IS NULL THEN 1 ELSE 0 END) as ton_dong_crm
     FROM khieu_nai`,
  ).first<{
    tong: number; dang_xu_ly: number; cho_chot_ket_thuc: number; da_ket_thuc: number; huy: number; ton_dong_crm: number;
  }>();

  const { results: theoNhomVanDe } = await c.env.DB.prepare(
    `SELECT nhom_van_de, COUNT(*) as so_luong FROM khieu_nai
     WHERE nhom_van_de IS NOT NULL GROUP BY nhom_van_de ORDER BY so_luong DESC LIMIT 6`,
  ).all<{ nhom_van_de: string; so_luong: number }>();

  return c.json({ ...row, theoNhomVanDe });
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [khieuNai, tienTrinh] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first(),
    c.env.DB.prepare("SELECT * FROM khieu_nai_tien_trinh WHERE khieu_nai_id = ? ORDER BY ngay_tao DESC").bind(id).all(),
  ]);
  if (!khieuNai) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ khieuNai, tienTrinh: tienTrinh.results });
});

app.post("/", requireRole("CSKH", "KTV", "TN CSKH", "QL", "Admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const id = await generateId(c.env.DB);
  const ts = nowVN();

  let crmFields: CrmFields | null = null;
  let crm_sync_warning: string | undefined;
  if (body.id_crm_karofi) {
    const lookup = await tryLookupCrm(c.env, body.id_crm_karofi);
    crmFields = lookup.fields;
    crm_sync_warning = lookup.warning;
  }

  const columns: Record<string, unknown> = {
    id,
    ten_khach: body.ten_khach ?? null,
    id_lada: body.id_lada ?? null,
    sale_khu_vuc: body.sale_khu_vuc ?? null,
    tinh: body.tinh ?? null,
    quan_huyen: body.quan_huyen ?? null,
    phuong_xa: body.phuong_xa ?? null,
    model: body.model ?? null,
    hang: body.hang ?? null,
    thong_tin_ban_dau: body.thong_tin_ban_dau ?? null,
    nguoi_bao: body.nguoi_bao ?? null,
    muc_do: body.muc_do ?? null,
    nhom_yeu_cau: body.nhom_yeu_cau ?? null,
    nhom_van_de: body.nhom_van_de ?? null,
    van_de_dau_vao: body.van_de_dau_vao ?? null,
    phan_loai_kh: body.phan_loai_kh ?? null,
    ghi_chu_nguoi_tao: body.ghi_chu_nguoi_tao ?? null,
    id_crm_karofi: body.id_crm_karofi ?? null,
    trang_thai: "Dang xu ly",
    nguoi_tao: user.email,
    cskh_tiep_nhan: user.email,
    ngay_tiep_nhan: ts,
    ngay_thay_doi: ts,
    ...(crmFields ?? {}),
  };

  const cols = Object.keys(columns);
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((k) => columns[k]);
  await c.env.DB.prepare(`INSERT INTO khieu_nai (${cols.join(", ")}) VALUES (${placeholders})`).bind(...values).run();

  const created = await c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first();
  return c.json({ khieuNai: created, crm_sync_warning }, 201);
});

app.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();

  const allowed = new Set<string>();
  if (user.vai_tro === "Admin") {
    [...CSKH_FIELDS, ...TN_CSKH_FIELDS, ...QL_FIELDS].forEach((f) => allowed.add(f));
  } else {
    if (user.vai_tro === "CSKH") CSKH_FIELDS.forEach((f) => allowed.add(f));
    if (user.vai_tro === "TN CSKH") TN_CSKH_FIELDS.forEach((f) => allowed.add(f));
    if (user.vai_tro === "QL") QL_FIELDS.forEach((f) => allowed.add(f));
  }

  const bodyKeys = Object.keys(body);
  const disallowed = bodyKeys.filter((k) => !allowed.has(k));
  if (disallowed.length > 0) return c.json({ error: "FORBIDDEN_FIELD", fields: disallowed }, 403);
  if (bodyKeys.length === 0) return c.json({ error: "NO_FIELDS" }, 400);

  for (const f of TN_CSKH_FIELDS) {
    if (f in body && !DANH_GIA_VALUES.has(body[f])) {
      return c.json({ error: "INVALID_DANH_GIA_VALUE", field: f }, 400);
    }
  }

  const sets: string[] = [];
  const binds: unknown[] = [];
  let crm_sync_warning: string | undefined;

  for (const key of bodyKeys) {
    if (key === "id_crm_karofi") {
      const existing = await c.env.DB.prepare("SELECT id_crm_karofi FROM khieu_nai WHERE id = ?").bind(id).first<{ id_crm_karofi: string | null }>();
      if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
      sets.push("id_crm_karofi = ?");
      binds.push(body.id_crm_karofi ?? null);
      if (body.id_crm_karofi && body.id_crm_karofi !== existing.id_crm_karofi) {
        const lookup = await tryLookupCrm(c.env, body.id_crm_karofi);
        crm_sync_warning = lookup.warning;
        if (lookup.fields) {
          for (const [fk, fv] of Object.entries(lookup.fields)) {
            sets.push(`${fk} = ?`);
            binds.push(fv);
          }
        }
      }
      continue;
    }
    sets.push(`${key} = ?`);
    binds.push(body[key] ?? null);
  }

  sets.push("ngay_thay_doi = ?");
  binds.push(nowVN());
  binds.push(id);

  const result = await c.env.DB.prepare(`UPDATE khieu_nai SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
  if (result.meta.changes === 0) return c.json({ error: "NOT_FOUND" }, 404);

  const updated = await c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first();
  return c.json({ khieuNai: updated, crm_sync_warning });
});

app.post("/:id/dong-ca", requireRole("TN CSKH", "Admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT trang_thai, loi_nha_san_xuat, loi_lap_dat, loi_thai_do_ktv, loi_quy_trinh_nskx, ket_luan_khieu_nai FROM khieu_nai WHERE id = ?",
  ).bind(id).first<{
    trang_thai: string; loi_nha_san_xuat: string; loi_lap_dat: string; loi_thai_do_ktv: string;
    loi_quy_trinh_nskx: string; ket_luan_khieu_nai: string;
  }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai !== "Dang xu ly") return c.json({ error: "INVALID_STATE" }, 400);

  const fields = [row.loi_nha_san_xuat, row.loi_lap_dat, row.loi_thai_do_ktv, row.loi_quy_trinh_nskx, row.ket_luan_khieu_nai];
  if (fields.some((f) => f === "Chua danh gia" || f === null || f === undefined)) {
    return c.json({ error: "CAN_DANH_GIA_DAY_DU" }, 400);
  }

  const user = c.get("user");
  const ts = nowVN();
  await c.env.DB.prepare(
    "UPDATE khieu_nai SET trang_thai = 'Cho chot ket thuc', ngay_ket_thuc = ?, nguoi_ket_thuc = ?, ngay_thay_doi = ? WHERE id = ?",
  ).bind(ts, user.email, ts, id).run();

  return c.json({ ok: true });
});

app.post("/:id/chot", requireRole("QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT trang_thai FROM khieu_nai WHERE id = ?").bind(id).first<{ trang_thai: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai !== "Cho chot ket thuc") return c.json({ error: "INVALID_STATE" }, 400);

  const user = c.get("user");
  const ts = nowVN();
  await c.env.DB.prepare(
    "UPDATE khieu_nai SET trang_thai = 'Da ket thuc', ql_nguoi_danh_gia = ?, ngay_ql_danh_gia = ?, ngay_thay_doi = ? WHERE id = ?",
  ).bind(user.email, ts, ts, id).run();

  return c.json({ ok: true });
});

app.post("/:id/huy", requireRole("CSKH", "QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT trang_thai FROM khieu_nai WHERE id = ?").bind(id).first<{ trang_thai: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai === "Da ket thuc") return c.json({ error: "INVALID_STATE" }, 400);

  const ts = nowVN();
  await c.env.DB.prepare("UPDATE khieu_nai SET trang_thai = 'Huy', ngay_thay_doi = ? WHERE id = ?").bind(ts, id).run();

  return c.json({ ok: true });
});

app.post("/:id/dong-bo-crm", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT id_crm_karofi FROM khieu_nai WHERE id = ?").bind(id).first<{ id_crm_karofi: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (!row.id_crm_karofi) return c.json({ error: "NO_CRM_ID" }, 400);

  const lookup = await tryLookupCrm(c.env, row.id_crm_karofi);
  if (!lookup.fields) return c.json({ error: lookup.warning ?? "DVBH_LOOKUP_FAILED" }, 502);

  const ts = nowVN();
  await c.env.DB.prepare(
    `UPDATE khieu_nai SET ngay_tiep_nhan_crm = ?, ket_qua_crm = ?, thong_tin_xu_ly_crm = ?, ngay_ktv_hoan_thanh = ?, thong_tin_giai_trinh_dvbh = ?, ngay_thay_doi = ? WHERE id = ?`,
  ).bind(
    lookup.fields.ngay_tiep_nhan_crm,
    lookup.fields.ket_qua_crm,
    lookup.fields.thong_tin_xu_ly_crm,
    lookup.fields.ngay_ktv_hoan_thanh,
    lookup.fields.thong_tin_giai_trinh_dvbh,
    ts,
    id,
  ).run();

  return c.json({ ok: true });
});

app.post("/dong-bo-cac-ca-ton", requireRole("QL", "Admin"), async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, id_crm_karofi FROM khieu_nai WHERE id_crm_karofi IS NOT NULL AND ngay_ktv_hoan_thanh IS NULL LIMIT 50",
  ).all<{ id: string; id_crm_karofi: string }>();

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of rows.results) {
    const lookup = await tryLookupCrm(c.env, row.id_crm_karofi);
    if (lookup.fields) {
      const ts = nowVN();
      await c.env.DB.prepare(
        `UPDATE khieu_nai SET ngay_tiep_nhan_crm = ?, ket_qua_crm = ?, thong_tin_xu_ly_crm = ?, ngay_ktv_hoan_thanh = ?, thong_tin_giai_trinh_dvbh = ?, ngay_thay_doi = ? WHERE id = ?`,
      ).bind(
        lookup.fields.ngay_tiep_nhan_crm,
        lookup.fields.ket_qua_crm,
        lookup.fields.thong_tin_xu_ly_crm,
        lookup.fields.ngay_ktv_hoan_thanh,
        lookup.fields.thong_tin_giai_trinh_dvbh,
        ts,
        row.id,
      ).run();
      results.push({ id: row.id, ok: true });
    } else {
      results.push({ id: row.id, ok: false, error: lookup.warning ?? "DVBH_LOOKUP_FAILED" });
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return c.json({ results });
});

app.post("/:id/tien-trinh", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);

  const exists = await c.env.DB.prepare("SELECT id FROM khieu_nai WHERE id = ?").bind(id).first();
  if (!exists) return c.json({ error: "NOT_FOUND" }, 404);

  const tienTrinhId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO khieu_nai_tien_trinh (id, khieu_nai_id, nguoi_tao, noi_dung_ghi_chep, ly_do_xu_ly_cham) VALUES (?, ?, ?, ?, ?)",
  ).bind(tienTrinhId, id, user.email, (body as Record<string, unknown>).noi_dung_ghi_chep ?? null, (body as Record<string, unknown>).ly_do_xu_ly_cham ?? null).run();

  const created = await c.env.DB.prepare("SELECT * FROM khieu_nai_tien_trinh WHERE id = ?").bind(tienTrinhId).first();
  return c.json({ tienTrinh: created }, 201);
});

export default app;
