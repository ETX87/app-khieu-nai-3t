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

// Thong tin khach hang + CRM - chi CSKH/Admin sua
const CSKH_FIELDS = [
  "ten_khach", "sdt_khach", "id_lada", "sale_khu_vuc",
  "tinh", "quan_huyen", "phuong_xa", "tinh_moi", "phuong_xa_moi", "model", "hang",
  "thong_tin_ban_dau", "nguoi_bao", "muc_do", "nhom_yeu_cau", "nhom_van_de", "van_de_dau_vao",
  "phan_loai_kh", "ghi_chu_nguoi_tao", "id_crm_karofi",
];

// Nhanh doi may - CSKH/TN CSKH/QL/Admin cung xu ly duoc (mo rong theo yeu cau ra soat ma tran vai tro)
const DOI_MAY_FIELDS = [
  "bo_phan_ban_giao", "ma_duyet_doi_linh_kien", "cam_co", "ghi_chu_ly_do_cham", "id_lada_phat_sinh",
  "ngay_ghi_nhan_doi_may", "ngay_dong_doi_may", "giai_trinh_cham_doi_may", "ket_qua_doi_may",
  "nguoi_xac_nhan_doi_may",
];

// Danh gia 4 loi + ket luan khieu nai - CSKH/TN CSKH/QL/Admin cung xu ly duoc
const TN_CSKH_FIELDS = [
  "loi_nha_san_xuat", "loi_lap_dat", "loi_thai_do_ktv", "loi_quy_trinh_nskx", "ket_luan_khieu_nai",
];

const QL_FIELDS = ["danh_gia_ql", "ql_gio_xu_ly", "ql_chon_ngay_hen", "ql_chon_ly_do"];

// Nhan Tieng Viet cho nhat ky "cap nhat" chung (khong bao gom TN_CSKH_FIELDS/danh_gia_ql - da co nhat ky rieng).
const FIELD_LABELS: Record<string, string> = {
  ten_khach: "Tên khách hàng", sdt_khach: "Số điện thoại", id_lada: "ID Lada",
  sale_khu_vuc: "Sale khu vực", tinh: "Tỉnh (cũ)", quan_huyen: "Quận/Huyện (cũ)",
  phuong_xa: "Phường/Xã (cũ)", tinh_moi: "Tỉnh (mới)", phuong_xa_moi: "Phường/Xã (mới)",
  model: "Model", hang: "Hãng", thong_tin_ban_dau: "Thông tin ban đầu", nguoi_bao: "Người báo",
  muc_do: "Mức độ", nhom_yeu_cau: "Nhóm yêu cầu", nhom_van_de: "Nhóm vấn đề",
  van_de_dau_vao: "Vấn đề đầu vào", phan_loai_kh: "Phân loại KH", ghi_chu_nguoi_tao: "Ghi chú người tạo",
  id_crm_karofi: "ID CRM Karofi",
  bo_phan_ban_giao: "Bộ phận bàn giao", ma_duyet_doi_linh_kien: "Mã duyệt đổi linh kiện",
  cam_co: "Cắm cờ", ghi_chu_ly_do_cham: "Ghi chú lý do chậm", id_lada_phat_sinh: "ID Lada phát sinh",
  ngay_ghi_nhan_doi_may: "Ngày ghi nhận đổi máy", ngay_dong_doi_may: "Ngày đóng đổi máy",
  giai_trinh_cham_doi_may: "Giải trình chậm đổi máy", ket_qua_doi_may: "Kết quả đổi máy",
  nguoi_xac_nhan_doi_may: "Người xác nhận đổi máy",
  ql_gio_xu_ly: "Giờ xử lý (QL nhập)", ql_chon_ngay_hen: "Ngày hẹn", ql_chon_ly_do: "Lý do",
};

// Dich vai gia tri enum sang nhan Tieng Viet de nhat ky de doc (khop nhan hien thi ngoai UI).
const VALUE_LABELS: Record<string, Record<string, string>> = {
  cam_co: { "Khong co": "Không cờ", "Co vang": "Cờ vàng", "Co do": "Cờ đỏ" },
  ket_qua_doi_may: {
    "Khong co": "Không có", "Dang xu ly": "Đang xử lý", "Doi thanh cong": "Đổi thành công",
    "Huy bo": "Hủy bỏ", "Doi khong thanh cong": "Đổi không thành công",
  },
};
function displayValue(key: string, v: unknown): string {
  const s = String(v ?? "—");
  return VALUE_LABELS[key]?.[s] ?? s;
}

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

async function logLichSu(
  db: D1Database,
  khieuNaiId: string,
  nguoi: string,
  hanhDong: string,
  truong?: string | null,
  cu?: string | null,
  moi?: string | null,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO khieu_nai_lich_su (id, khieu_nai_id, nguoi, hanh_dong, truong, gia_tri_cu, gia_tri_moi) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), khieuNaiId, nguoi, hanhDong, truong ?? null, cu ?? null, moi ?? null)
    .run();
}

// So gio xu ly he thong tinh: ngay_tiep_nhan -> (moc ket thuc | bay gio). Khong loai tru khoang nao
// (theo quyet dinh chu du an 09/2026).
function gioXuLyHeThong(ngayTiepNhan: string, ngayKetThuc: string | null): number {
  const start = new Date(ngayTiepNhan.replace(" ", "T") + "Z").getTime();
  const end = ngayKetThuc
    ? new Date(ngayKetThuc.replace(" ", "T") + "Z").getTime()
    : Date.now() + 7 * 60 * 60 * 1000;
  return Math.max(0, Math.round(((end - start) / 3_600_000) * 10) / 10);
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

const SORT_COLUMNS: Record<string, string> = {
  ngay_tiep_nhan: "ngay_tiep_nhan",
  ngay_thay_doi: "ngay_thay_doi",
  muc_do: "muc_do",
};

app.get("/", async (c) => {
  const trangThai = c.req.query("trang_thai");
  const idCrmKarofi = c.req.query("id_crm_karofi");
  const q = c.req.query("q");
  const mucDo = c.req.query("muc_do");
  const nhomVanDe = c.req.query("nhom_van_de");
  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const chuaDongBo = c.req.query("chua_dong_bo");
  const nguoiPhuTrach = c.req.query("nguoi_phu_trach");
  const sort = SORT_COLUMNS[c.req.query("sort") ?? ""] ?? "ngay_tiep_nhan";
  const dir = c.req.query("dir") === "asc" ? "ASC" : "DESC";
  let page = parseInt(c.req.query("page") ?? "1", 10);
  let pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (trangThai) { conditions.push("trang_thai = ?"); binds.push(trangThai); }
  if (idCrmKarofi) { conditions.push("id_crm_karofi = ?"); binds.push(idCrmKarofi); }
  if (mucDo) { conditions.push("muc_do = ?"); binds.push(mucDo); }
  if (nhomVanDe) { conditions.push("nhom_van_de = ?"); binds.push(nhomVanDe); }
  if (nguoiPhuTrach) { conditions.push("nguoi_phu_trach = ?"); binds.push(nguoiPhuTrach); }
  if (tuNgay) { conditions.push("ngay_tiep_nhan >= ?"); binds.push(`${tuNgay} 00:00:00`); }
  if (denNgay) { conditions.push("ngay_tiep_nhan <= ?"); binds.push(`${denNgay} 23:59:59`); }
  if (chuaDongBo === "1") {
    conditions.push("id_crm_karofi IS NOT NULL AND ngay_ktv_hoan_thanh IS NULL AND trang_thai != 'Da ket thuc'");
  }
  if (q) {
    conditions.push("(ten_khach LIKE ? OR id_lada LIKE ? OR id LIKE ? OR id_crm_karofi LIKE ? OR sdt_khach LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const [list, count] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM khieu_nai ${where} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`)
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

// GET /api/khieu-nai/tra-cuu?id_lada=... | ?id_crm=...
// Tra cuu nhanh khi nguoi tao phan anh nhap ID o dau form (item 8, item 10):
//  - id_lada: soi trong cac phan anh cu cung id_lada, lay ban ghi moi nhat de tu dien + liet ke don cu.
//  - id_crm:  goi API DVBH goc, neu khop tra thong tin co ban + tu dien model/tinh/huyen/xa/sdt.
// Dat TRUOC "/:id" (Hono khop route theo thu tu).
const LADA_FILL_COLUMNS = [
  "ten_khach", "sdt_khach", "tinh", "quan_huyen", "phuong_xa", "tinh_moi", "phuong_xa_moi",
  "hang", "model", "sale_khu_vuc", "phan_loai_kh",
];

async function optionExists(db: D1Database, nhom: string, giaTri: string): Promise<boolean> {
  const r = await db.prepare(
    "SELECT 1 FROM settings_option WHERE nhom = ? AND gia_tri = ? AND active = 1 LIMIT 1",
  ).bind(nhom, giaTri).first();
  return !!r;
}

app.get("/tra-cuu", async (c) => {
  const idLada = c.req.query("id_lada")?.trim();
  const idCrm = c.req.query("id_crm")?.trim();

  if (idLada) {
    const { results } = await c.env.DB.prepare(
      `SELECT id, ngay_tiep_nhan, trang_thai, nhom_van_de, van_de_dau_vao, thong_tin_ban_dau,
              ${LADA_FILL_COLUMNS.join(", ")}
       FROM khieu_nai WHERE id_lada = ? ORDER BY ngay_tiep_nhan DESC LIMIT 20`,
    ).bind(idLada).all<Record<string, string | null>>();

    if (results.length === 0) return c.json({ found: false, source: "lada" });

    const latest = results[0];
    const fill: Record<string, string> = {};
    for (const col of LADA_FILL_COLUMNS) {
      const v = latest[col];
      if (v != null && v !== "") fill[col] = v;
    }
    const recent = results.map((r) => ({
      id: r.id, ngay_tiep_nhan: r.ngay_tiep_nhan, trang_thai: r.trang_thai,
      nhom_van_de: r.nhom_van_de, van_de_dau_vao: r.van_de_dau_vao,
    }));
    return c.json({ found: true, source: "lada", fill, recent });
  }

  if (idCrm) {
    try {
      const result = await lookupDvbhCase(c.env, idCrm);
      if (!result.found || !result.preview) return c.json({ found: false, source: "crm", warning: "DVBH_NOT_FOUND" });
      const p = result.preview;
      const fill: Record<string, string> = {};
      const put = (k: string, v: unknown) => { if (typeof v === "string" && v.trim() !== "") fill[k] = v.trim(); };
      put("ten_khach", p.khach_hang);
      put("sdt_khach", p.so_dien_thoai);
      put("model", p.model);
      // Địa chỉ: ưu tiên khớp địa chính MỚI (sau sáp nhập 2025); không khớp thì điền theo địa chính CŨ.
      const tinhVal = typeof p.tinh === "string" ? p.tinh.trim() : "";
      const xaVal = typeof p.phuong_xa === "string" ? p.phuong_xa.trim() : "";
      if (tinhVal && (await optionExists(c.env.DB, "tinh_moi", tinhVal))) {
        fill.tinh_moi = tinhVal;
        if (xaVal && (await optionExists(c.env.DB, "phuong_xa_moi", xaVal))) fill.phuong_xa_moi = xaVal;
      } else {
        put("tinh", p.tinh);
        put("quan_huyen", p.quan_huyen);
        put("phuong_xa", p.phuong_xa);
      }
      return c.json({
        found: true, source: "crm", fill,
        preview: {
          khach_hang: p.khach_hang ?? null,
          ky_thuat_vien: p.ky_thuat_vien ?? null,
          tien_do_hoan_thanh: p.tien_do_hoan_thanh ?? null,
          noi_dung_xu_ly: p.noi_dung_xu_ly ?? null,
          thoi_gian_cskh_tiep_nhan: p.thoi_gian_cskh_tiep_nhan ?? null,
          thoi_gian_hoan_thanh: p.thoi_gian_hoan_thanh ?? null,
        },
        giaiTrinh: formatGiaiTrinhHistory(result.giaiTrinh),
      });
    } catch {
      return c.json({ found: false, source: "crm", warning: "DVBH_LOOKUP_FAILED" });
    }
  }

  return c.json({ error: "MISSING_QUERY" }, 400);
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [khieuNai, tienTrinh, lichSu] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first(),
    c.env.DB.prepare("SELECT * FROM khieu_nai_tien_trinh WHERE khieu_nai_id = ? ORDER BY ngay_tao DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM khieu_nai_lich_su WHERE khieu_nai_id = ? ORDER BY thoi_diem DESC").bind(id).all(),
  ]);
  if (!khieuNai) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ khieuNai, tienTrinh: tienTrinh.results, lichSu: lichSu.results });
});

// H1: gan / go nguoi phu trach ca.
app.post("/:id/phu-trach", requireRole("CSKH", "KTV", "TN CSKH", "QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const target = body.email === null ? null : typeof body.email === "string" && body.email ? body.email : user.email;

  const row = await c.env.DB.prepare("SELECT trang_thai, nguoi_phu_trach FROM khieu_nai WHERE id = ?")
    .bind(id).first<{ trang_thai: string; nguoi_phu_trach: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai === "Da ket thuc") return c.json({ error: "CASE_CLOSED" }, 409);

  const ts = nowVN();
  await c.env.DB.prepare("UPDATE khieu_nai SET nguoi_phu_trach = ?, ngay_thay_doi = ? WHERE id = ?")
    .bind(target, ts, id).run();
  await logLichSu(c.env.DB, id!, user.email, "phu_trach", "nguoi_phu_trach", row.nguoi_phu_trach ?? "", target ?? "");

  const updated = await c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first();
  return c.json({ khieuNai: updated });
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

  // Ngay tiep nhan: mac dinh bay gio; neu nguoi tao chon ngay (yyyy-mm-dd) thi giu gio hien tai.
  const ngayTiepNhan =
    typeof body.ngay_tiep_nhan === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.ngay_tiep_nhan)
      ? `${body.ngay_tiep_nhan}${ts.slice(10)}`
      : ts;

  const columns: Record<string, unknown> = {
    id,
    ten_khach: body.ten_khach ?? null,
    sdt_khach: body.sdt_khach ?? null,
    id_lada: body.id_lada ?? null,
    sale_khu_vuc: body.sale_khu_vuc ?? null,
    tinh: body.tinh ?? null,
    quan_huyen: body.quan_huyen ?? null,
    phuong_xa: body.phuong_xa ?? null,
    tinh_moi: body.tinh_moi ?? null,
    phuong_xa_moi: body.phuong_xa_moi ?? null,
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
    nguoi_phu_trach: user.email,
    ngay_tiep_nhan: ngayTiepNhan,
    ngay_thay_doi: ts,
    ...(crmFields ?? {}),
  };

  const cols = Object.keys(columns);
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((k) => columns[k]);
  await c.env.DB.prepare(`INSERT INTO khieu_nai (${cols.join(", ")}) VALUES (${placeholders})`).bind(...values).run();
  await logLichSu(c.env.DB, id, user.email, "tao_moi", null, null, null);

  const created = await c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first();
  return c.json({ khieuNai: created, crm_sync_warning }, 201);
});

app.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();

  const allowed = new Set<string>();
  if (user.vai_tro === "Admin") {
    [...CSKH_FIELDS, ...DOI_MAY_FIELDS, ...TN_CSKH_FIELDS, ...QL_FIELDS].forEach((f) => allowed.add(f));
  } else {
    if (user.vai_tro === "CSKH") [...CSKH_FIELDS, ...DOI_MAY_FIELDS, ...TN_CSKH_FIELDS].forEach((f) => allowed.add(f));
    if (user.vai_tro === "TN CSKH") [...TN_CSKH_FIELDS, ...DOI_MAY_FIELDS].forEach((f) => allowed.add(f));
    if (user.vai_tro === "QL") [...QL_FIELDS, ...DOI_MAY_FIELDS, ...TN_CSKH_FIELDS].forEach((f) => allowed.add(f));
  }

  const bodyKeys = Object.keys(body);
  const disallowed = bodyKeys.filter((k) => !allowed.has(k));
  if (disallowed.length > 0) return c.json({ error: "FORBIDDEN_FIELD", fields: disallowed }, 403);
  if (bodyKeys.length === 0) return c.json({ error: "NO_FIELDS" }, 400);

  // Khoa du lieu theo trang thai: ca "Da ket thuc" chi doc (Admin muon sua phai "Mo lai ca" truoc).
  // Lay ca dong de vua kiem tra trang thai vua co gia tri cu cho nhat ky "cap nhat" chung.
  const cur = await c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first<Record<string, string | null>>();
  if (!cur) return c.json({ error: "NOT_FOUND" }, 404);
  if (cur.trang_thai === "Da ket thuc") return c.json({ error: "CASE_CLOSED" }, 409);

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
      sets.push("id_crm_karofi = ?");
      binds.push(body.id_crm_karofi ?? null);
      if (body.id_crm_karofi && body.id_crm_karofi !== cur.id_crm_karofi) {
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

  // Nhat ky: chi ghi cac moc quan trong (danh gia loi, danh gia QL).
  for (const f of TN_CSKH_FIELDS) {
    if (f in body && body[f] !== cur[f]) {
      await logLichSu(c.env.DB, id!, user.email, "danh_gia_loi", f, cur[f] ?? null, String(body[f] ?? ""));
    }
  }
  if ("danh_gia_ql" in body && body.danh_gia_ql != null && String(body.danh_gia_ql).trim() !== "" && body.danh_gia_ql !== cur.danh_gia_ql) {
    await logLichSu(c.env.DB, id!, user.email, "danh_gia_ql", "danh_gia_ql", cur.danh_gia_ql ?? null, String(body.danh_gia_ql));
  }

  // Nhat ky "cap nhat" chung: cac truong con lai (thong tin khach hang, doi may...) da co gia tri thuc su thay doi,
  // gop thanh 1 dong nhat ky moi lan luu (thay vi 1 dong moi truong) de danh sach khong bi loang.
  const SPECIFIC_LOGGED = new Set<string>([...TN_CSKH_FIELDS, "danh_gia_ql"]);
  const changedGeneric = bodyKeys.filter((k) => !SPECIFIC_LOGGED.has(k) && String(body[k] ?? "") !== String(cur[k] ?? ""));
  if (changedGeneric.length > 0) {
    const summary = changedGeneric.map((k) => `${FIELD_LABELS[k] ?? k}: ${displayValue(k, body[k])}`).join("; ");
    await logLichSu(c.env.DB, id!, user.email, "cap_nhat", changedGeneric.join(","), null, summary);
  }

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
  await logLichSu(c.env.DB, id!, user.email, "chuyen_trang_thai", "trang_thai", "Dang xu ly", "Cho chot ket thuc");

  return c.json({ ok: true });
});

app.post("/:id/chot", requireRole("QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT trang_thai, danh_gia_ql, ngay_tiep_nhan, ngay_ket_thuc FROM khieu_nai WHERE id = ?",
  ).bind(id).first<{ trang_thai: string; danh_gia_ql: string | null; ngay_tiep_nhan: string; ngay_ket_thuc: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai !== "Cho chot ket thuc") return c.json({ error: "INVALID_STATE" }, 400);
  // Tien dieu kien: phai co Danh gia QL truoc khi chot (doi xung voi "Dong ca" doi du 4 loi).
  if (!row.danh_gia_ql || row.danh_gia_ql.trim() === "") return c.json({ error: "CAN_DANH_GIA_QL" }, 400);

  const user = c.get("user");
  const ts = nowVN();
  const gio = gioXuLyHeThong(row.ngay_tiep_nhan, row.ngay_ket_thuc);
  await c.env.DB.prepare(
    "UPDATE khieu_nai SET trang_thai = 'Da ket thuc', ql_nguoi_danh_gia = ?, ngay_ql_danh_gia = ?, ql_gio_xu_ly_he_thong = ?, ngay_thay_doi = ? WHERE id = ?",
  ).bind(user.email, ts, gio, ts, id).run();
  await logLichSu(c.env.DB, id!, user.email, "chuyen_trang_thai", "trang_thai", "Cho chot ket thuc", "Da ket thuc");

  return c.json({ ok: true });
});

app.post("/:id/mo-lai", requireRole("Admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const lyDo = typeof body.ly_do === "string" ? body.ly_do.trim() : "";
  if (!lyDo) return c.json({ error: "CAN_LY_DO" }, 400);
  const row = await c.env.DB.prepare("SELECT trang_thai FROM khieu_nai WHERE id = ?").bind(id).first<{ trang_thai: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai !== "Da ket thuc") return c.json({ error: "INVALID_STATE" }, 400);

  const user = c.get("user");
  const ts = nowVN();
  await c.env.DB.prepare(
    "UPDATE khieu_nai SET trang_thai = 'Cho chot ket thuc', ngay_thay_doi = ? WHERE id = ?",
  ).bind(ts, id).run();
  await logLichSu(c.env.DB, id!, user.email, "mo_lai", "trang_thai", "Da ket thuc", `Cho chot ket thuc — ${lyDo}`);

  return c.json({ ok: true });
});

app.post("/:id/huy", requireRole("CSKH", "TN CSKH", "QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const lyDoHuy = typeof body.ly_do_huy === "string" ? body.ly_do_huy.trim() : "";
  if (!lyDoHuy) return c.json({ error: "CAN_LY_DO_HUY" }, 400);
  const ghiChu = typeof body.ghi_chu === "string" ? body.ghi_chu.trim() : "";

  const row = await c.env.DB.prepare("SELECT trang_thai FROM khieu_nai WHERE id = ?").bind(id).first<{ trang_thai: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai === "Da ket thuc") return c.json({ error: "INVALID_STATE" }, 400);

  const user = c.get("user");
  const ts = nowVN();
  await c.env.DB.prepare(
    "UPDATE khieu_nai SET trang_thai = 'Huy', ly_do_huy = ?, nguoi_huy = ?, ngay_huy = ?, ngay_thay_doi = ? WHERE id = ?",
  ).bind(ghiChu ? `${lyDoHuy} — ${ghiChu}` : lyDoHuy, user.email, ts, ts, id).run();
  await logLichSu(c.env.DB, id!, user.email, "huy", "trang_thai", row.trang_thai, `Huy — ${lyDoHuy}`);

  return c.json({ ok: true });
});

const CRM_RESYNC_MIN_INTERVAL_MS = 5000;

app.post("/:id/dong-bo-crm", requireRole("CSKH", "KTV", "TN CSKH", "QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT id_crm_karofi, trang_thai, crm_last_sync_at FROM khieu_nai WHERE id = ?",
  ).bind(id).first<{ id_crm_karofi: string | null; trang_thai: string; crm_last_sync_at: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (!row.id_crm_karofi) return c.json({ error: "NO_CRM_ID" }, 400);
  if (row.trang_thai === "Da ket thuc") return c.json({ error: "CASE_CLOSED" }, 400);
  if (row.crm_last_sync_at) {
    // crm_last_sync_at duoc ghi boi nowVN() = gio VN (UTC+7) nhung luu duoi dang chuoi "UTC tran" (khong co Z/offset),
    // nen phai tru lai 7h sau khi parse-nhu-UTC de ra dung moc UTC that, moi so sanh voi Date.now() (UTC that).
    const storedAsUtc = new Date(row.crm_last_sync_at.replace(" ", "T") + "Z").getTime();
    const trueWriteUtc = storedAsUtc - 7 * 60 * 60 * 1000;
    const elapsedMs = Date.now() - trueWriteUtc;
    if (elapsedMs < CRM_RESYNC_MIN_INTERVAL_MS) {
      return c.json({ error: "RESYNC_TOO_SOON", retryAfterMs: CRM_RESYNC_MIN_INTERVAL_MS - elapsedMs }, 429);
    }
  }

  const ts = nowVN();
  await c.env.DB.prepare("UPDATE khieu_nai SET crm_last_sync_at = ? WHERE id = ?").bind(ts, id).run();

  const lookup = await tryLookupCrm(c.env, row.id_crm_karofi);
  if (!lookup.fields) return c.json({ error: lookup.warning ?? "DVBH_LOOKUP_FAILED" }, 502);

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
    "SELECT id, id_crm_karofi FROM khieu_nai WHERE id_crm_karofi IS NOT NULL AND ngay_ktv_hoan_thanh IS NULL AND trang_thai != 'Da ket thuc' LIMIT 50",
  ).all<{ id: string; id_crm_karofi: string }>();

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of rows.results) {
    const lookup = await tryLookupCrm(c.env, row.id_crm_karofi);
    const ts = nowVN();
    await c.env.DB.prepare("UPDATE khieu_nai SET crm_last_sync_at = ? WHERE id = ?").bind(ts, row.id).run();
    if (lookup.fields) {
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

app.post("/:id/tien-trinh", requireRole("CSKH", "TN CSKH", "QL", "Admin"), async (c) => {
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
