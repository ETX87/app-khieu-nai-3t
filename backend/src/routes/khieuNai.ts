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

// "KTV" cu tach thanh 2 vai tro hien thi khac nhau (NV Sale / Tong dai vien) nhung CUNG luong quy
// trinh/quyen han - dung chung 1 danh sach de khong lap lai logic o nhieu noi.
const KTV_LIKE_ROLES = ["NV Sale", "Tổng đài viên"] as const;
const isKtvLike = (vaiTro: string | null | undefined) => (KTV_LIKE_ROLES as readonly string[]).includes(vaiTro ?? "");

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

const GIAI_TRINH_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface GiaiTrinhStatus {
  overdue: boolean;
  deadline: string; // moc VN-naive tiep theo phai giai trinh
}

// Bat buoc giai trinh ly do cham moi 24h (tinh tu luc tao ca hoac lan giai trinh gan nhat) truoc khi
// duoc tiep tuc xu ly ca. Khong ap dung cho ca da ket thuc/huy (khong con "xu ly" tren do nua).
async function getGiaiTrinhStatus(db: D1Database, id: string): Promise<GiaiTrinhStatus | null> {
  const kn = await db.prepare("SELECT trang_thai, ngay_tiep_nhan FROM khieu_nai WHERE id = ?")
    .bind(id).first<{ trang_thai: string; ngay_tiep_nhan: string }>();
  if (!kn) return null;
  if (kn.trang_thai === "Da ket thuc" || kn.trang_thai === "Huy") return null;

  const lastMoc = await db.prepare(
    "SELECT ngay_tao FROM khieu_nai_tien_trinh WHERE khieu_nai_id = ? AND ly_do_xu_ly_cham IS NOT NULL ORDER BY ngay_tao DESC LIMIT 1",
  ).bind(id).first<{ ngay_tao: string }>();
  const mocAt = lastMoc?.ngay_tao ?? kn.ngay_tiep_nhan;

  const deadlineMs = new Date(mocAt.replace(" ", "T") + "Z").getTime() + GIAI_TRINH_INTERVAL_MS;
  const trueNowAsVnNaiveMs = Date.now() + 7 * 60 * 60 * 1000;
  return {
    overdue: trueNowAsVnNaiveMs > deadlineMs,
    deadline: new Date(deadlineMs).toISOString().slice(0, 19).replace("T", " "),
  };
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
  giai_trinh_dvbh_json: string;
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
        giai_trinh_dvbh_json: JSON.stringify(result.giaiTrinh),
      },
      warning: undefined,
    };
  } catch {
    return { fields: null, warning: "DVBH_LOOKUP_FAILED" };
  }
}

const SORT_COLUMNS: Record<string, string> = {
  id: "id",
  ngay_tiep_nhan: "ngay_tiep_nhan",
  ngay_thay_doi: "ngay_thay_doi",
  muc_do: "muc_do",
  ten_khach: "ten_khach",
  nhom_van_de: "nhom_van_de",
  trang_thai: "trang_thai",
  ngay_ktv_hoan_thanh: "ngay_ktv_hoan_thanh",
};

app.get("/", async (c) => {
  const user = c.get("user");
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
  const tonToiThieuNgay = parseInt(c.req.query("ton_toi_thieu_ngay") ?? "", 10);
  if (Number.isFinite(tonToiThieuNgay) && tonToiThieuNgay > 0) {
    // "Thoi gian ton" = so ngay tu luc tiep nhan den nay, chi tinh cho ca CHUA dong (khong tinh
    // "Da ket thuc"/"Huy" - da xong thi khong con "ton" nua).
    conditions.push(
      "trang_thai NOT IN ('Da ket thuc','Huy') AND (julianday(datetime('now','+7 hours')) - julianday(ngay_tiep_nhan)) >= ?",
    );
    binds.push(tonToiThieuNgay);
  }
  const thangDong = c.req.query("thang_dong"); // "YYYY-MM" - loc theo thang cua ngay_ket_thuc (item: du lieu tang manh, can loc theo thang de bao cao/tra cuu khong phai quet toan bo).
  if (thangDong && /^\d{4}-\d{2}$/.test(thangDong)) {
    conditions.push("ngay_ket_thuc >= ? AND ngay_ket_thuc < datetime(? , '+1 month')");
    binds.push(`${thangDong}-01 00:00:00`, `${thangDong}-01 00:00:00`);
  }
  if (q) {
    conditions.push("(ten_khach LIKE ? OR id_lada LIKE ? OR id LIKE ? OR id_crm_karofi LIKE ? OR sdt_khach LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const nguoiTaoVaiTro = c.req.query("nguoi_tao_vai_tro");
  if (nguoiTaoVaiTro) {
    conditions.push("nguoi_tao IN (SELECT email FROM users WHERE vai_tro = ?)");
    binds.push(nguoiTaoVaiTro);
  }
  // NV Sale/Tong dai vien (KTV cu) chi tao phan anh de bao gia ho hien truong, khong tham gia xu ly
  // toan bo hang doi -> chi nhin thay dun minh tao (item 12).
  if (isKtvLike(user.vai_tro)) { conditions.push("nguoi_tao = ?"); binds.push(user.email); }
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
  const user = c.get("user");
  // NV Sale/Tong dai vien (KTV cu) chi thay so lieu cua chinh minh (item 12), giong pham vi danh sach.
  const onlyMine = isKtvLike(user.vai_tro);
  const whereMine = onlyMine ? "WHERE nguoi_tao = ?" : "";
  const andMine = onlyMine ? "AND nguoi_tao = ?" : "";
  const mineBind = onlyMine ? [user.email] : [];

  const row = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as tong,
       SUM(CASE WHEN trang_thai = 'Cho tiep nhan' THEN 1 ELSE 0 END) as cho_tiep_nhan,
       SUM(CASE WHEN trang_thai = 'Dang xu ly' THEN 1 ELSE 0 END) as dang_xu_ly,
       SUM(CASE WHEN trang_thai = 'Cho chot ket thuc' THEN 1 ELSE 0 END) as cho_chot_ket_thuc,
       SUM(CASE WHEN trang_thai = 'Da ket thuc' THEN 1 ELSE 0 END) as da_ket_thuc,
       SUM(CASE WHEN trang_thai = 'Huy' THEN 1 ELSE 0 END) as huy,
       SUM(CASE WHEN id_crm_karofi IS NOT NULL AND ngay_ktv_hoan_thanh IS NULL THEN 1 ELSE 0 END) as ton_dong_crm
     FROM khieu_nai ${whereMine}`,
  ).bind(...mineBind).first<{
    tong: number; cho_tiep_nhan: number; dang_xu_ly: number; cho_chot_ket_thuc: number; da_ket_thuc: number; huy: number; ton_dong_crm: number;
  }>();

  const { results: theoNhomVanDe } = await c.env.DB.prepare(
    `SELECT nhom_van_de, COUNT(*) as so_luong FROM khieu_nai
     WHERE nhom_van_de IS NOT NULL ${andMine} GROUP BY nhom_van_de ORDER BY so_luong DESC LIMIT 6`,
  ).bind(...mineBind).all<{ nhom_van_de: string; so_luong: number }>();

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
      `SELECT id, ngay_tiep_nhan, trang_thai, nhom_van_de, van_de_dau_vao, thong_tin_ban_dau, nguoi_tao,
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
    // Hien "lich su cham soc" dang timeline (giong phong cach GT ton ben dvbh) thay vi bang phang -
    // can them nguoi_tao (actor) + thong_tin_ban_dau (noi dung tom tat) cho tung phan anh cu.
    const recent = results.map((r) => ({
      id: r.id, ngay_tiep_nhan: r.ngay_tiep_nhan, trang_thai: r.trang_thai,
      nhom_van_de: r.nhom_van_de, van_de_dau_vao: r.van_de_dau_vao,
      thong_tin_ban_dau: r.thong_tin_ban_dau, nguoi_tao: r.nguoi_tao,
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
      put("model", p.san_pham_bao_hanh);
      // Địa chỉ: DVBH chỉ có tỉnh/quận-huyện (không có phường-xã riêng). Ưu tiên khớp địa chính
      // MỚI (sau sáp nhập 2025) theo tỉnh; không khớp thì điền theo địa chính CŨ.
      const tinhVal = typeof p.tinh === "string" ? p.tinh.trim() : "";
      if (tinhVal && (await optionExists(c.env.DB, "tinh_moi", tinhVal))) {
        fill.tinh_moi = tinhVal;
      } else {
        put("tinh", p.tinh);
        put("quan_huyen", p.quan_huyen);
      }
      const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
      return c.json({
        found: true, source: "crm", fill,
        preview: {
          khach_hang: p.khach_hang ?? null,
          ky_thuat_vien: p.ky_thuat_vien ?? null,
          tien_do_hoan_thanh: p.tien_do_hoan_thanh ?? null,
          noi_dung_xu_ly: p.noi_dung_xu_ly ?? null,
          thoi_gian_cskh_tiep_nhan: p.thoi_gian_cskh_tiep_nhan ?? null,
          thoi_gian_hoan_thanh: p.thoi_gian_hoan_thanh ?? null,
          // Thêm để người tạo nắm thông tin ngay khi tra cứu (không phải chờ tạo xong mới thấy).
          mo_ta_loi: str(p.mo_ta_loi),
          khu_vuc: str(p.khu_vuc),
          loai_yeu_cau: str(p.loai_yeu_cau),
          thoi_gian_hen_xu_ly: str(p.thoi_gian_hen_xu_ly),
          ly_do_qua_han: str(p.ly_do_qua_han),
          link_crm: str(p.link_crm),
        },
        giaiTrinh: result.giaiTrinh,
      });
    } catch (e) {
      console.error("DVBH_LOOKUP_FAILED", e);
      return c.json({ found: false, source: "crm", warning: "DVBH_LOOKUP_FAILED" });
    }
  }

  return c.json({ error: "MISSING_QUERY" }, 400);
});

// ── Bao cao (item: SLA + trung lap/tai phat) ──────────────────────────────────────────────
// Dat TRUOC "/:id" (Hono khop route theo thu tu) - xem giai thich o /stats phia tren.

const SLA_BUCKETS = [
  { label: "0-1 ngày", max: 1 },
  { label: "1-3 ngày", max: 3 },
  { label: "3-7 ngày", max: 7 },
  { label: ">7 ngày", max: Infinity },
];
function slaBucketLabel(days: number): string {
  for (const b of SLA_BUCKETS) if (days <= b.max) return b.label;
  return SLA_BUCKETS[SLA_BUCKETS.length - 1].label;
}

// SLA theo so ngay xu ly: khong dat nguong dung/tre han cung, chi phan phoi theo khoang ngay
// (0-1 / 1-3 / 3-7 / >7), tach rieng ca "Da ket thuc" (tinh den ngay_ket_thuc) va ca con "Dang
// xu ly" (tinh den hien tai, de thay ca nao dang keo dai).
app.get("/bao-cao/sla", requireRole("CSKH", "TN CSKH", "QL", "Admin", "Viewer"), async (c) => {
  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const conditions: string[] = ["trang_thai != 'Huy'"];
  const binds: unknown[] = [];
  if (tuNgay) { conditions.push("ngay_tiep_nhan >= ?"); binds.push(`${tuNgay} 00:00:00`); }
  if (denNgay) { conditions.push("ngay_tiep_nhan <= ?"); binds.push(`${denNgay} 23:59:59`); }

  // LIMIT phong ho: du lieu du kien tang 10-20k/thang, khong de 1 lan tra cuu khong loc ngay keo
  // toan bo bang vao Worker (CPU/rows_read) khi so lieu lon dan theo thoi gian.
  const { results } = await c.env.DB.prepare(
    `SELECT trang_thai, nhom_van_de,
            (julianday(COALESCE(ngay_ket_thuc, datetime('now','+7 hours'))) - julianday(ngay_tiep_nhan)) as so_ngay
     FROM khieu_nai WHERE ${conditions.join(" AND ")} ORDER BY ngay_tiep_nhan DESC LIMIT 20000`,
  ).bind(...binds).all<{ trang_thai: string; nhom_van_de: string | null; so_ngay: number }>();

  const buckets = SLA_BUCKETS.map((b) => ({ label: b.label, da_ket_thuc: 0, dang_xu_ly: 0 }));
  const nhomStats = new Map<string, { soCa: number; tongNgay: number }>();
  let tongDaKetThuc = 0, tongDangXuLy = 0, tongNgayDaKetThuc = 0;

  for (const r of results) {
    const days = Math.max(0, r.so_ngay ?? 0);
    const bucket = buckets.find((b) => b.label === slaBucketLabel(days))!;
    const isDone = r.trang_thai === "Da ket thuc";
    if (isDone) {
      bucket.da_ket_thuc++;
      tongDaKetThuc++;
      tongNgayDaKetThuc += days;
      if (r.nhom_van_de) {
        const s = nhomStats.get(r.nhom_van_de) ?? { soCa: 0, tongNgay: 0 };
        s.soCa++;
        s.tongNgay += days;
        nhomStats.set(r.nhom_van_de, s);
      }
    } else {
      bucket.dang_xu_ly++;
      tongDangXuLy++;
    }
  }

  const theoNhomVanDe = [...nhomStats.entries()]
    .map(([nhom_van_de, s]) => ({ nhom_van_de, so_ca: s.soCa, so_ngay_trung_binh: Math.round((s.tongNgay / s.soCa) * 10) / 10 }))
    .sort((a, b) => b.so_ca - a.so_ca)
    .slice(0, 8);

  return c.json({
    buckets,
    tong_da_ket_thuc: tongDaKetThuc,
    tong_dang_xu_ly: tongDangXuLy,
    so_ngay_trung_binh: tongDaKetThuc > 0 ? Math.round((tongNgayDaKetThuc / tongDaKetThuc) * 10) / 10 : 0,
    theo_nhom_van_de: theoNhomVanDe,
  });
});

interface TrungLapRow {
  id: string;
  id_lada: string | null;
  id_lada_phat_sinh: string | null;
  ngay_tiep_nhan: string;
  ten_khach: string | null;
  van_de_dau_vao: string | null;
  trang_thai: string;
}

// Ca trung lap/tai phat sinh: gop nhom theo "hanh trinh" 1 may - coi id_lada (goc) va
// id_lada_phat_sinh (sinh o nhanh doi may) la CUNG 1 danh tinh may khi xuat hien chung trong 1
// dong (Union-Find tren gia tri ID Lada), roi liet ke nhom co >=2 phan anh, danh dau nhom co
// khoang cach giua 2 lan gan nhau <=7 ngay la "tai phat nhanh".
app.get("/bao-cao/trung-lap", requireRole("CSKH", "TN CSKH", "QL", "Admin", "Viewer"), async (c) => {
  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const conditions: string[] = ["(id_lada IS NOT NULL OR id_lada_phat_sinh IS NOT NULL)"];
  const binds: unknown[] = [];
  if (tuNgay) { conditions.push("ngay_tiep_nhan >= ?"); binds.push(`${tuNgay} 00:00:00`); }
  if (denNgay) { conditions.push("ngay_tiep_nhan <= ?"); binds.push(`${denNgay} 23:59:59`); }

  // LIMIT phong ho giong /bao-cao/sla (xem giai thich phia tren) - lay 20k dong gan nhat, du du
  // cho union-find nhom theo ID Lada ma khong quet toan bo bang khi du lieu lon dan.
  const { results } = await c.env.DB.prepare(
    `SELECT id, id_lada, id_lada_phat_sinh, ngay_tiep_nhan, ten_khach, van_de_dau_vao, trang_thai
     FROM khieu_nai WHERE ${conditions.join(" AND ")} ORDER BY ngay_tiep_nhan DESC LIMIT 20000`,
  ).bind(...binds).all<TrungLapRow>();

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const ladaValsOf = (r: TrungLapRow) => [r.id_lada, r.id_lada_phat_sinh].filter((v): v is string => !!v && v.trim() !== "");
  for (const r of results) {
    const ids = ladaValsOf(r);
    for (const v of ids) if (!parent.has(v)) parent.set(v, v);
    if (ids.length === 2) union(ids[0], ids[1]);
  }

  const groups = new Map<string, TrungLapRow[]>();
  for (const r of results) {
    const ids = ladaValsOf(r);
    if (ids.length === 0) continue;
    const root = find(ids[0]);
    const arr = groups.get(root) ?? [];
    arr.push(r);
    groups.set(root, arr);
  }

  const report = [...groups.values()]
    .filter((arr) => arr.length >= 2)
    .map((arr) => {
      const sorted = [...arr].sort((a, b) => a.ngay_tiep_nhan.localeCompare(b.ngay_tiep_nhan));
      let minGapDays = Infinity;
      for (let i = 1; i < sorted.length; i++) {
        const d1 = new Date(sorted[i - 1].ngay_tiep_nhan.replace(" ", "T") + "Z").getTime();
        const d2 = new Date(sorted[i].ngay_tiep_nhan.replace(" ", "T") + "Z").getTime();
        minGapDays = Math.min(minGapDays, (d2 - d1) / 86_400_000);
      }
      const ladaIds = [...new Set(sorted.flatMap(ladaValsOf))];
      return {
        lada_ids: ladaIds,
        so_lan: sorted.length,
        khoang_cach_ngan_nhat: Math.round(minGapDays * 10) / 10,
        tai_phat_trong_7_ngay: minGapDays <= 7,
        items: sorted.map((r) => ({
          id: r.id, ngay_tiep_nhan: r.ngay_tiep_nhan, ten_khach: r.ten_khach,
          van_de_dau_vao: r.van_de_dau_vao, trang_thai: r.trang_thai,
          id_lada: r.id_lada, id_lada_phat_sinh: r.id_lada_phat_sinh,
        })),
      };
    })
    .sort((a, b) =>
      a.tai_phat_trong_7_ngay === b.tai_phat_trong_7_ngay
        ? b.so_lan - a.so_lan
        : a.tai_phat_trong_7_ngay ? -1 : 1,
    );

  return c.json({
    groups: report,
    tong_nhom: report.length,
    tong_tai_phat_7_ngay: report.filter((g) => g.tai_phat_trong_7_ngay).length,
  });
});

interface RelatedSeed {
  id_crm_karofi: string | null;
  id_lada: string | null;
  id_lada_phat_sinh: string | null;
}

// Danh sach don lien quan (item 3): cung ID CRM Karofi, hoac cung "hanh trinh" ID Lada (id_lada /
// id_lada_phat_sinh giao nhau). Ap dung lai gioi han pham vi cho NV Sale/Tong dai vien (isKtvLike)
// giong nhu detail chinh, tranh lo du lieu phan anh cua nguoi khac qua duong nay.
async function getRelatedComplaints(db: D1Database, selfId: string, kn: RelatedSeed, restrictToEmail: string | null) {
  const orParts: string[] = [];
  const orBinds: unknown[] = [];
  if (kn.id_crm_karofi) { orParts.push("id_crm_karofi = ?"); orBinds.push(kn.id_crm_karofi); }
  const ladaVals = [kn.id_lada, kn.id_lada_phat_sinh].filter((v): v is string => !!v && v.trim() !== "");
  if (ladaVals.length > 0) {
    const ph = ladaVals.map(() => "?").join(",");
    orParts.push(`(id_lada IN (${ph}) OR id_lada_phat_sinh IN (${ph}))`);
    orBinds.push(...ladaVals, ...ladaVals);
  }
  if (orParts.length === 0) return [];

  const conditions = ["id != ?", `(${orParts.join(" OR ")})`];
  const binds: unknown[] = [selfId, ...orBinds];
  if (restrictToEmail) { conditions.push("nguoi_tao = ?"); binds.push(restrictToEmail); }

  const { results } = await db.prepare(
    `SELECT id, ngay_tiep_nhan, trang_thai, ten_khach, van_de_dau_vao, nhom_van_de,
            id_crm_karofi, id_lada, id_lada_phat_sinh
     FROM khieu_nai WHERE ${conditions.join(" AND ")} ORDER BY ngay_tiep_nhan DESC LIMIT 20`,
  ).bind(...binds).all();
  return results;
}

app.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [khieuNai, tienTrinh, lichSu] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first<
      { nguoi_tao: string | null } & RelatedSeed
    >(),
    c.env.DB.prepare("SELECT * FROM khieu_nai_tien_trinh WHERE khieu_nai_id = ? ORDER BY ngay_tao DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM khieu_nai_lich_su WHERE khieu_nai_id = ? ORDER BY thoi_diem DESC").bind(id).all(),
  ]);
  if (!khieuNai) return c.json({ error: "NOT_FOUND" }, 404);
  // NV Sale/Tong dai vien (KTV cu) chi xem duoc phan anh do chinh minh tao (item 12), kem chan truy cap thang qua ID.
  if (isKtvLike(user.vai_tro) && khieuNai.nguoi_tao !== user.email) return c.json({ error: "FORBIDDEN" }, 403);
  const giaiTrinhDeadline = await getGiaiTrinhStatus(c.env.DB, id);
  const related = await getRelatedComplaints(c.env.DB, id, khieuNai, isKtvLike(user.vai_tro) ? user.email : null);
  return c.json({ khieuNai, tienTrinh: tienTrinh.results, lichSu: lichSu.results, giaiTrinhDeadline, related });
});

// H1: gan / go nguoi phu trach ca.
app.post("/:id/phu-trach", requireRole("CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const target = body.email === null ? null : typeof body.email === "string" && body.email ? body.email : user.email;

  const row = await c.env.DB.prepare("SELECT trang_thai, nguoi_phu_trach FROM khieu_nai WHERE id = ?")
    .bind(id).first<{ trang_thai: string; nguoi_phu_trach: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai === "Da ket thuc") return c.json({ error: "CASE_CLOSED" }, 409);
  // Phai "Tiep nhan" truoc (qua route /tiep-nhan) roi moi duoc gan lai nguoi phu trach.
  if (row.trang_thai === "Cho tiep nhan") return c.json({ error: "CHUA_TIEP_NHAN" }, 423);

  const ts = nowVN();
  await c.env.DB.prepare("UPDATE khieu_nai SET nguoi_phu_trach = ?, ngay_thay_doi = ? WHERE id = ?")
    .bind(target, ts, id).run();
  await logLichSu(c.env.DB, id!, user.email, "phu_trach", "nguoi_phu_trach", row.nguoi_phu_trach ?? "", target ?? "");

  const updated = await c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first();
  return c.json({ khieuNai: updated });
});

app.post("/", requireRole("CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL", "Admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const id = await generateId(c.env.DB);
  const ts = nowVN();
  // CSKH/Admin tu tao phan anh thi coi nhu da tiep nhan luon; cac vai tro con lai (NV Sale, Tong dai
  // vien, TN CSKH, QL) tao ho khach hang -> phai cho CSKH bam "Tiep nhan" (POST /:id/tiep-nhan) truoc
  // khi phan anh duoc phep sua/cap nhat.
  const autoReceived = user.vai_tro === "CSKH" || user.vai_tro === "Admin";

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
    trang_thai: autoReceived ? "Dang xu ly" : "Cho tiep nhan",
    nguoi_tao: user.email,
    cskh_tiep_nhan: autoReceived ? user.email : null,
    nguoi_phu_trach: autoReceived ? user.email : null,
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

// CSKH bam "Tiep nhan" cho cac phan anh do NV Sale/Tong dai vien/TN CSKH/QL tao ho khach hang - day
// la dieu kien bat buoc de mo khoa sua/cap nhat phan anh (yeu cau nghiep vu 2026-09).
app.post("/:id/tiep-nhan", requireRole("CSKH", "Admin"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT trang_thai FROM khieu_nai WHERE id = ?").bind(id).first<{ trang_thai: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai !== "Cho tiep nhan") return c.json({ error: "INVALID_STATE" }, 400);

  const ts = nowVN();
  await c.env.DB.prepare(
    "UPDATE khieu_nai SET trang_thai = 'Dang xu ly', nguoi_phu_trach = ?, cskh_tiep_nhan = ?, ngay_thay_doi = ? WHERE id = ?",
  ).bind(user.email, user.email, ts, id).run();
  await logLichSu(c.env.DB, id!, user.email, "tiep_nhan", "trang_thai", "Cho tiep nhan", "Dang xu ly");

  const updated = await c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first();
  return c.json({ khieuNai: updated });
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
  // Phai "Tiep nhan" truoc (CSKH bam nut, POST /:id/tiep-nhan) roi moi cho sua/cap nhat.
  if (cur.trang_thai === "Cho tiep nhan") return c.json({ error: "CHUA_TIEP_NHAN" }, 423);

  const giaiTrinhStatus = await getGiaiTrinhStatus(c.env.DB, id!);
  if (giaiTrinhStatus?.overdue) return c.json({ error: "QUA_HAN_GIAI_TRINH", deadline: giaiTrinhStatus.deadline }, 423);

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

  const giaiTrinhStatus = await getGiaiTrinhStatus(c.env.DB, id!);
  if (giaiTrinhStatus?.overdue) return c.json({ error: "QUA_HAN_GIAI_TRINH", deadline: giaiTrinhStatus.deadline }, 423);

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

  const giaiTrinhStatus = await getGiaiTrinhStatus(c.env.DB, id!);
  if (giaiTrinhStatus?.overdue) return c.json({ error: "QUA_HAN_GIAI_TRINH", deadline: giaiTrinhStatus.deadline }, 423);

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

app.post("/:id/dong-bo-crm", requireRole("CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT id_crm_karofi, trang_thai, crm_last_sync_at FROM khieu_nai WHERE id = ?",
  ).bind(id).first<{ id_crm_karofi: string | null; trang_thai: string; crm_last_sync_at: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (!row.id_crm_karofi) return c.json({ error: "NO_CRM_ID" }, 400);
  if (row.trang_thai === "Da ket thuc") return c.json({ error: "CASE_CLOSED" }, 400);
  if (row.trang_thai === "Cho tiep nhan") return c.json({ error: "CHUA_TIEP_NHAN" }, 423);
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
    `UPDATE khieu_nai SET ngay_tiep_nhan_crm = ?, ket_qua_crm = ?, thong_tin_xu_ly_crm = ?, ngay_ktv_hoan_thanh = ?, thong_tin_giai_trinh_dvbh = ?, giai_trinh_dvbh_json = ?, ngay_thay_doi = ? WHERE id = ?`,
  ).bind(
    lookup.fields.ngay_tiep_nhan_crm,
    lookup.fields.ket_qua_crm,
    lookup.fields.thong_tin_xu_ly_crm,
    lookup.fields.ngay_ktv_hoan_thanh,
    lookup.fields.thong_tin_giai_trinh_dvbh,
    lookup.fields.giai_trinh_dvbh_json,
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
        `UPDATE khieu_nai SET ngay_tiep_nhan_crm = ?, ket_qua_crm = ?, thong_tin_xu_ly_crm = ?, ngay_ktv_hoan_thanh = ?, thong_tin_giai_trinh_dvbh = ?, giai_trinh_dvbh_json = ?, ngay_thay_doi = ? WHERE id = ?`,
      ).bind(
        lookup.fields.ngay_tiep_nhan_crm,
        lookup.fields.ket_qua_crm,
        lookup.fields.thong_tin_xu_ly_crm,
        lookup.fields.ngay_ktv_hoan_thanh,
        lookup.fields.thong_tin_giai_trinh_dvbh,
        lookup.fields.giai_trinh_dvbh_json,
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

  const exists = await c.env.DB.prepare("SELECT id, trang_thai FROM khieu_nai WHERE id = ?").bind(id).first<{ id: string; trang_thai: string }>();
  if (!exists) return c.json({ error: "NOT_FOUND" }, 404);
  if (exists.trang_thai === "Cho tiep nhan") return c.json({ error: "CHUA_TIEP_NHAN" }, 423);

  const noiDung = typeof body.noi_dung_ghi_chep === "string" ? body.noi_dung_ghi_chep.trim() : "";
  const lyDo = typeof body.ly_do_xu_ly_cham === "string" ? body.ly_do_xu_ly_cham.trim() : "";

  // Qua han giai trinh 24h: dong nay BAT BUOC phai co ca ly do lan noi dung giai trinh (khong duoc
  // ghi chu suong) - day la hanh dong duy nhat go duoc khoa xu ly cua ca.
  const giaiTrinhStatus = await getGiaiTrinhStatus(c.env.DB, id!);
  if (giaiTrinhStatus?.overdue && (!noiDung || !lyDo)) {
    return c.json({ error: "CAN_LY_DO_VA_GIAI_TRINH", deadline: giaiTrinhStatus.deadline }, 400);
  }

  const tienTrinhId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO khieu_nai_tien_trinh (id, khieu_nai_id, nguoi_tao, noi_dung_ghi_chep, ly_do_xu_ly_cham) VALUES (?, ?, ?, ?, ?)",
  ).bind(tienTrinhId, id, user.email, noiDung || null, lyDo || null).run();

  const created = await c.env.DB.prepare("SELECT * FROM khieu_nai_tien_trinh WHERE id = ?").bind(tienTrinhId).first();
  return c.json({ tienTrinh: created }, 201);
});

export default app;
