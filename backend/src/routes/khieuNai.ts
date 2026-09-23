import { Hono } from "hono";
import type { AppUser, Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN, currentMonthVN } from "../lib/vnTime";
import { buildThangCondition, isValidThang } from "../lib/thangFilter";
import { lookupDvbhCase, formatGiaiTrinhHistory } from "../lib/dvbhClient";
import { uploadPublicFile, deletePublicFile } from "../lib/googleDrive";
import { lookupOrderByIdLada } from "../lib/center3tClient";
import { chuanHoaTinh, timTinhChuan } from "../lib/tinhChuan";
import { notifyRoles } from "../lib/notify";

const app = new Hono<{ Bindings: Env }>();
app.use("*", verifySessionMiddleware, loadUser);

const DANH_GIA_VALUES = new Set(["Khong", "Co", "Chua danh gia"]);

// "KTV" cu tach thanh 2 vai tro hien thi khac nhau (NV Sale / Tong dai vien) nhung CUNG luong quy
// trinh/quyen han - dung chung 1 danh sach de khong lap lai logic o nhieu noi.
const KTV_LIKE_ROLES = ["NV Sale", "Tổng đài viên"] as const;
const isKtvLike = (vaiTro: string | null | undefined) => (KTV_LIKE_ROLES as readonly string[]).includes(vaiTro ?? "");
// Pham vi XEM: NV Sale/Tong dai vien chi thay ca minh tao, tru khi Admin bat quyen "Xem tat ca ca".
const chiThayCaCuaMinh = (u: AppUser) => isKtvLike(u.vai_tro) && !u.xem_tat_ca;
// Quyen SUA: NV Sale/Tong dai vien chi thao tac tren ca minh tao - ca nguoi khac (thay duoc nho quyen
// "Xem tat ca ca") chi xem. Dung cho cac route mo cho 2 vai tro nay (dinh kem, phu trach, dong bo CRM).
const chiXemCaNguoiKhac = (u: AppUser, nguoiTao: string | null) => isKtvLike(u.vai_tro) && nguoiTao !== u.email;

// Thong tin khach hang + CRM - chi CSKH/Admin sua
const CSKH_FIELDS = [
  "ten_khach", "sdt_khach", "id_lada", "id_truy_van", "sale_khu_vuc",
  "tinh", "quan_huyen", "phuong_xa", "tinh_moi", "phuong_xa_moi", "model", "hang",
  "thong_tin_ban_dau", "nguoi_bao", "muc_do", "nhom_yeu_cau", "nhom_van_de", "van_de_dau_vao",
  "phan_loai_kh", "ghi_chu_nguoi_tao", "id_crm_karofi", "nguon",
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
  ten_khach: "Tên khách hàng", sdt_khach: "Số điện thoại", id_lada: "ID Lada", id_truy_van: "ID Truy xuất",
  sale_khu_vuc: "Sale khu vực", tinh: "Tỉnh (cũ)", quan_huyen: "Quận/Huyện (cũ)",
  phuong_xa: "Phường/Xã (cũ)", tinh_moi: "Tỉnh (mới)", phuong_xa_moi: "Phường/Xã (mới)",
  model: "Model", hang: "Hãng", thong_tin_ban_dau: "Thông tin ban đầu", nguoi_bao: "Người báo",
  muc_do: "Mức độ", nhom_yeu_cau: "Nhóm yêu cầu", nhom_van_de: "Nhóm vấn đề",
  van_de_dau_vao: "Vấn đề đầu vào", phan_loai_kh: "Phân loại KH", ghi_chu_nguoi_tao: "Ghi chú người tạo",
  id_crm_karofi: "ID CRM Karofi", nguon: "Nguồn",
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
  return giaiTrinhStatusFrom(lastMoc?.ngay_tao ?? kn.ngay_tiep_nhan);
}

// mocAt = lan giai trinh gan nhat (hoac ngay tiep nhan neu chua giai trinh lan nao).
function giaiTrinhStatusFrom(mocAt: string): GiaiTrinhStatus {
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

// Ket qua tra cuu -> cot crm_tra_cuu: 'OK' | 'SAI_ID' (CRM bao khong co case) | null (loi mang/API -
// khong ket luan duoc ID dung hay sai).
function crmTraCuuFrom(lookup: { fields: CrmFields | null; warning?: string }): "OK" | "SAI_ID" | null {
  if (lookup.fields) return "OK";
  return lookup.warning === "DVBH_NOT_FOUND" ? "SAI_ID" : null;
}

function crmUpdateStmt(db: D1Database, id: string, f: CrmFields, ts: string): D1PreparedStatement {
  return db.prepare(
    `UPDATE khieu_nai SET ngay_tiep_nhan_crm = ?, ket_qua_crm = ?, thong_tin_xu_ly_crm = ?, ngay_ktv_hoan_thanh = ?,
       thong_tin_giai_trinh_dvbh = ?, giai_trinh_dvbh_json = ?, crm_tra_cuu = 'OK', ngay_thay_doi = ? WHERE id = ?`,
  ).bind(f.ngay_tiep_nhan_crm, f.ket_qua_crm, f.thong_tin_xu_ly_crm, f.ngay_ktv_hoan_thanh,
    f.thong_tin_giai_trinh_dvbh, f.giai_trinh_dvbh_json, ts, id);
}

// Dieu kien "ca ton dong bo CRM": co ID CRM, KTV chua hoan thanh, ca chua dong/huy. Tach tiep theo
// crm_tra_cuu: 'SAI_ID' = "ID CRM sai", con lai (OK / chua tra cuu duoc) = "Cho dong bo".
const TON_CRM_SQL = "id_crm_karofi IS NOT NULL AND ngay_ktv_hoan_thanh IS NULL AND trang_thai NOT IN ('Da ket thuc', 'Huy')";
const CRM_SAI_SQL = "crm_tra_cuu = 'SAI_ID'";
const CRM_CHO_SQL = "COALESCE(crm_tra_cuu, '') != 'SAI_ID'";

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
  const nguon = c.req.query("nguon");
  const nhomVanDe = c.req.query("nhom_van_de");
  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const chuaDongBo = c.req.query("chua_dong_bo");
  const chuaDong = c.req.query("chua_dong"); // "Tat ca ton" (item): chua Da ket thuc, chua Huy.
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
  else if (chuaDong === "1") { conditions.push("trang_thai NOT IN ('Da ket thuc', 'Huy')"); }
  if (idCrmKarofi) { conditions.push("id_crm_karofi = ?"); binds.push(idCrmKarofi); }
  if (mucDo) { conditions.push("muc_do = ?"); binds.push(mucDo); }
  if (nguon) { conditions.push("nguon = ?"); binds.push(nguon); }
  if (nhomVanDe) { conditions.push("nhom_van_de = ?"); binds.push(nhomVanDe); }
  if (nguoiPhuTrach) { conditions.push("nguoi_phu_trach = ?"); binds.push(nguoiPhuTrach); }
  if (tuNgay) { conditions.push("ngay_tiep_nhan >= ?"); binds.push(`${tuNgay} 00:00:00`); }
  if (denNgay) { conditions.push("ngay_tiep_nhan <= ?"); binds.push(`${denNgay} 23:59:59`); }
  // chua_dong_bo: "1" = tat ca ca ton dong bo CRM | "cho" = Cho dong bo (ID dung) | "sai" = ID CRM sai.
  if (chuaDongBo === "1") conditions.push(TON_CRM_SQL);
  else if (chuaDongBo === "cho") conditions.push(`${TON_CRM_SQL} AND ${CRM_CHO_SQL}`);
  else if (chuaDongBo === "sai") conditions.push(`${TON_CRM_SQL} AND ${CRM_SAI_SQL}`);
  const choTnCskh = c.req.query("cho_tn_cskh");
  if (choTnCskh === "1") {
    conditions.push(
      `trang_thai = 'Dang xu ly' AND loi_nha_san_xuat != 'Chua danh gia' AND loi_lap_dat != 'Chua danh gia'
       AND loi_thai_do_ktv != 'Chua danh gia' AND loi_quy_trinh_nskx != 'Chua danh gia'
       AND COALESCE(ket_luan_khieu_nai, 'Chua danh gia') != 'Chua danh gia'`,
    );
  }
  const quaHanGiaiTrinh = c.req.query("qua_han_giai_trinh");
  if (quaHanGiaiTrinh === "1") {
    conditions.push(
      `trang_thai NOT IN ('Da ket thuc', 'Huy') AND datetime('now', '+7 hours') > datetime(
         COALESCE(
           (SELECT MAX(t.ngay_tao) FROM khieu_nai_tien_trinh t
            WHERE t.khieu_nai_id = khieu_nai.id AND t.ly_do_xu_ly_cham IS NOT NULL),
           ngay_tiep_nhan
         ), '+24 hours')`,
    );
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
  const thangDong = c.req.query("thang_dong"); // "YYYY-MM" - loc theo thang dong/huy (item: du lieu tang manh, can loc theo thang de bao cao/tra cuu khong phai quet toan bo).
  if (thangDong && /^\d{4}-\d{2}$/.test(thangDong)) {
    // Ca "Da ket thuc" dung ngay_ket_thuc, ca "Huy" dung ngay_huy rieng (khong ghi ngay_ket_thuc) -
    // truoc day chi loc ngay_ket_thuc nen bo sot het cac ca da huy trong thang.
    conditions.push(
      "((ngay_ket_thuc >= ? AND ngay_ket_thuc < datetime(?, '+1 month')) OR (ngay_huy >= ? AND ngay_huy < datetime(?, '+1 month')))",
    );
    binds.push(`${thangDong}-01 00:00:00`, `${thangDong}-01 00:00:00`, `${thangDong}-01 00:00:00`, `${thangDong}-01 00:00:00`);
  }
  if (q) {
    const cols = ["ten_khach", "id_lada", "id", "id_crm_karofi", "sdt_khach", "id_truy_van"];
    conditions.push(`(${cols.map((col) => `${col} LIKE ?`).join(" OR ")})`);
    binds.push(...cols.map(() => `%${q.trim()}%`));
  }
  const nguoiTaoVaiTro = c.req.query("nguoi_tao_vai_tro");
  if (nguoiTaoVaiTro) {
    conditions.push("nguoi_tao IN (SELECT email FROM users WHERE vai_tro = ?)");
    binds.push(nguoiTaoVaiTro);
  }
  // NV Sale/Tong dai vien (KTV cu) chi tao phan anh de bao gia ho hien truong, khong tham gia xu ly
  // toan bo hang doi -> chi nhin thay dun minh tao (item 12).
  if (chiThayCaCuaMinh(user)) { conditions.push("nguoi_tao = ?"); binds.push(user.email); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  // View mac dinh "Tat ca" (khong loc gi + sap xep tiep nhan moi nhat, dung MOI khi mo module): ca
  // "ton" (chua Da ket thuc/Huy) luon len truoc, sap theo ngay tiep nhan moi nhat, tong chi dem so
  // ca ton (bi chan boi luong cong viec dang xu ly - khong phinh to theo lich su nam nay qua nam
  // khac). Ca 2 truy van deu dung index idx_kn_ton_uu_tien/idx_kn_trang_thai (SEARCH, khong SCAN) -
  // rows_read chi ti le voi so ca ton, khong ti le voi tong so ban ghi tu truoc den nay (2026-09-21).
  const TON_ORDER_EXPR = "(CASE WHEN trang_thai NOT IN ('Da ket thuc','Huy') THEN 1 ELSE 0 END) DESC, ngay_tiep_nhan DESC";
  const useTonPriority = conditions.length === 0 && sort === "ngay_tiep_nhan" && dir === "DESC";

  if (useTonPriority) {
    const [list, tonCount] = await Promise.all([
      c.env.DB.prepare(`SELECT * FROM khieu_nai ORDER BY ${TON_ORDER_EXPR} LIMIT ? OFFSET ?`)
        .bind(pageSize, offset)
        .all(),
      c.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM khieu_nai WHERE trang_thai IN ('Cho tiep nhan','Dang xu ly','Cho chot ket thuc')",
      ).first<{ cnt: number }>(),
    ]);
    return c.json({
      items: list.results,
      total: tonCount?.cnt ?? 0,
      totalIsApprox: true, // dem so ca ton, chua tinh ca da dong/huy - luon "chi it nhat bay nhieu".
      page,
      pageSize,
    });
  }

  // Dem so dong: KHONG COUNT(*) truc tiep tren "where" rong (khi khong loc gi ca) - se buoc D1 quet
  // toan bo bang (rows_read = tong so ban ghi, tang mai theo thoi gian). Bao boc trong subquery co
  // LIMIT de rows_read toi da bang COUNT_CAP du bang co bao nhieu trieu dong - tu "~du du de biet
  // con nhieu trang" chu khong can dem chinh xac tuyet doi khi khong loc.
  const COUNT_CAP = 50000;
  const [list, count] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM khieu_nai ${where} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`)
      .bind(...binds, pageSize, offset)
      .all(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM (SELECT 1 FROM khieu_nai ${where} LIMIT ?)`,
    ).bind(...binds, COUNT_CAP + 1).first<{ cnt: number }>(),
  ]);
  const totalRaw = count?.cnt ?? 0;
  const totalIsApprox = totalRaw > COUNT_CAP;

  return c.json({
    items: list.results,
    total: totalIsApprox ? COUNT_CAP : totalRaw,
    totalIsApprox,
    page,
    pageSize,
  });
});

// GET /api/khieu-nai/stats - so lieu that cho Trang chu (khong phai du lieu mau/gia lap) - dat
// TRUOC "/:id" vi Hono khop route theo thu tu, dat sau se bi "/:id" nuot mat "stats" lam id.
app.get("/stats", async (c) => {
  const user = c.get("user");
  // NV Sale/Tong dai vien (KTV cu) chi thay so lieu cua chinh minh (item 12), giong pham vi danh sach.
  const onlyMine = chiThayCaCuaMinh(user);

  // Bo loc "thang" (item: tranh quet toan bo lich su khi du lieu tang qua 2 nam) - mac dinh thang
  // hien tai, van hien DU ca dang "ton" (khong phu thuoc thang), chi gioi han phan da dong/huy.
  const currentMonth = currentMonthVN();
  const thangParam = c.req.query("thang");
  const thang = isValidThang(thangParam) ? thangParam : currentMonth;
  const { sql: thangSql, binds: thangBinds } = buildThangCondition(thang, currentMonth);

  const conditions = [thangSql];
  const binds: unknown[] = [...thangBinds];
  if (onlyMine) { conditions.push("nguoi_tao = ?"); binds.push(user.email); }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const row = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as tong,
       SUM(CASE WHEN trang_thai = 'Cho tiep nhan' THEN 1 ELSE 0 END) as cho_tiep_nhan,
       SUM(CASE WHEN trang_thai = 'Dang xu ly' THEN 1 ELSE 0 END) as dang_xu_ly,
       SUM(CASE WHEN trang_thai = 'Cho chot ket thuc' THEN 1 ELSE 0 END) as cho_chot_ket_thuc,
       SUM(CASE WHEN trang_thai = 'Da ket thuc' THEN 1 ELSE 0 END) as da_ket_thuc,
       SUM(CASE WHEN trang_thai = 'Huy' THEN 1 ELSE 0 END) as huy,
       -- Ca da ket thuc/huy khong con "ton" nua du chua dong bo CRM (yeu cau ra soat 2026-09).
       SUM(CASE WHEN ${TON_CRM_SQL} THEN 1 ELSE 0 END) as ton_dong_crm,
       SUM(CASE WHEN ${TON_CRM_SQL} AND ${CRM_CHO_SQL} THEN 1 ELSE 0 END) as ton_cho_dong_bo,
       SUM(CASE WHEN ${TON_CRM_SQL} AND ${CRM_SAI_SQL} THEN 1 ELSE 0 END) as ton_crm_sai,
       -- Da danh gia du 4 loi + ket luan (san sang "Dong ca") nhung con "Dang xu ly" cho TN CSKH bam.
       SUM(CASE WHEN trang_thai = 'Dang xu ly'
                  AND loi_nha_san_xuat != 'Chua danh gia' AND loi_lap_dat != 'Chua danh gia'
                  AND loi_thai_do_ktv != 'Chua danh gia' AND loi_quy_trinh_nskx != 'Chua danh gia'
                  AND COALESCE(ket_luan_khieu_nai, 'Chua danh gia') != 'Chua danh gia'
             THEN 1 ELSE 0 END) as cho_tn_cskh,
       -- Qua han 24h giai trinh ly do cham (tinh tu lan giai trinh gan nhat hoac luc tiep nhan neu
       -- chua giai trinh lan nao) - cung dieu kien voi getGiaiTrinhStatus() dung khi khoa sua ca.
       SUM(CASE WHEN trang_thai NOT IN ('Da ket thuc', 'Huy')
                  AND datetime('now', '+7 hours') > datetime(
                    COALESCE(
                      (SELECT MAX(t.ngay_tao) FROM khieu_nai_tien_trinh t
                       WHERE t.khieu_nai_id = khieu_nai.id AND t.ly_do_xu_ly_cham IS NOT NULL),
                      ngay_tiep_nhan
                    ), '+24 hours')
             THEN 1 ELSE 0 END) as qua_han_giai_trinh
     FROM khieu_nai ${where}`,
  ).bind(...binds).first<{
    tong: number; cho_tiep_nhan: number; dang_xu_ly: number; cho_chot_ket_thuc: number; da_ket_thuc: number; huy: number;
    ton_dong_crm: number; ton_cho_dong_bo: number; ton_crm_sai: number; cho_tn_cskh: number; qua_han_giai_trinh: number;
  }>();

  const { results: theoNhomVanDe } = await c.env.DB.prepare(
    `SELECT nhom_van_de, COUNT(*) as so_luong FROM khieu_nai
     WHERE nhom_van_de IS NOT NULL AND ${conditions.join(" AND ")} GROUP BY nhom_van_de ORDER BY so_luong DESC LIMIT 6`,
  ).bind(...binds).all<{ nhom_van_de: string; so_luong: number }>();

  return c.json({ ...row, theoNhomVanDe, thang });
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

// Chi hien thi de so sanh (khong dung de tu dien) trong danh sach "phan anh cu cung ID Lada" -
// giup nguoi tao thay ngay lich su loi/ket luan cua may nay ma khong can mo tung don.
const LADA_COMPARE_COLUMNS = [
  "loi_nha_san_xuat", "loi_lap_dat", "loi_thai_do_ktv", "loi_quy_trinh_nskx", "ket_luan_khieu_nai",
];

// Dung chung cho ca 2 nhanh tra cuu noi bo (id_lada VA id_truy_van) - cung 1 kieu du lieu can lay:
// dien nhanh tu ban ghi cu gan nhat + liet ke lich su "tien trinh" de doi chieu ngay khong can mo
// tung don. KHONG goi API ngoai o day (xem ghi chu rieng o tung nhanh trong "/tra-cuu").
async function localIdentityLookup(db: D1Database, column: "id_lada" | "id_truy_van", value: string) {
  const { results } = await db.prepare(
    `SELECT id, ngay_tiep_nhan, trang_thai, nhom_van_de, van_de_dau_vao, thong_tin_ban_dau, nguoi_tao,
            ${LADA_FILL_COLUMNS.join(", ")}, ${LADA_COMPARE_COLUMNS.join(", ")}
     FROM khieu_nai WHERE ${column} = ? ORDER BY ngay_tiep_nhan DESC LIMIT 20`,
  ).bind(value).all<Record<string, string | null>>();

  const fill: Record<string, string> = {};
  if (results.length > 0) {
    const latest = results[0];
    for (const col of LADA_FILL_COLUMNS) {
      const v = latest[col];
      if (v != null && v !== "") fill[col] = v;
    }
  }

  const ids = results.map((r) => r.id as string);
  const ph = ids.map(() => "?").join(",");
  const { results: ttRows } = ids.length > 0
    ? await db.prepare(
        `SELECT khieu_nai_id, nguoi_tao, ngay_tao, noi_dung_ghi_chep, ly_do_xu_ly_cham
         FROM khieu_nai_tien_trinh WHERE khieu_nai_id IN (${ph}) ORDER BY ngay_tao DESC`,
      ).bind(...ids).all<{
        khieu_nai_id: string; nguoi_tao: string; ngay_tao: string;
        noi_dung_ghi_chep: string | null; ly_do_xu_ly_cham: string | null;
      }>()
    : { results: [] };
  const tienTrinhByKn = new Map<string, typeof ttRows>();
  for (const row of ttRows) {
    const arr = tienTrinhByKn.get(row.khieu_nai_id) ?? [];
    arr.push(row);
    tienTrinhByKn.set(row.khieu_nai_id, arr);
  }

  const recent = results.map((r) => ({
    id: r.id, ngay_tiep_nhan: r.ngay_tiep_nhan, trang_thai: r.trang_thai,
    nhom_van_de: r.nhom_van_de, van_de_dau_vao: r.van_de_dau_vao,
    thong_tin_ban_dau: r.thong_tin_ban_dau, nguoi_tao: r.nguoi_tao,
    ten_khach: r.ten_khach, tinh: r.tinh, quan_huyen: r.quan_huyen, phuong_xa: r.phuong_xa,
    tinh_moi: r.tinh_moi, phuong_xa_moi: r.phuong_xa_moi, hang: r.hang, model: r.model,
    ket_luan_khieu_nai: r.ket_luan_khieu_nai,
    loi_nha_san_xuat: r.loi_nha_san_xuat, loi_lap_dat: r.loi_lap_dat,
    loi_thai_do_ktv: r.loi_thai_do_ktv, loi_quy_trinh_nskx: r.loi_quy_trinh_nskx,
    tien_trinh: tienTrinhByKn.get(r.id as string) ?? [],
  }));

  return { results, fill, recent };
}

app.get("/tra-cuu", async (c) => {
  const idLada = c.req.query("id_lada")?.trim();
  const idCrm = c.req.query("id_crm")?.trim();
  const idTruyVan = c.req.query("id_truy_van")?.trim();

  // ID Truy xuat la he dinh danh KHAC id_lada (da xac nhan qua goi API Ecolada that, xem ghi chu o
  // nhanh id_lada ben duoi) - API ngoai chi nhan ma dang "ID LADA" (tham so "codes", xem
  // api_document_staff.md) nen KHONG the tra cuu he thong ngoai bang gia tri nay. Chi tra cuu noi
  // bo (2026-09-21) - truoc day nhanh nay bi dung nham lai API id_lada nen luon tra ve "khong tim
  // thay" voi gia tri ID Truy xuat that.
  if (idTruyVan) {
    const { results, fill, recent } = await localIdentityLookup(c.env.DB, "id_truy_van", idTruyVan);
    return c.json({ found: results.length > 0, source: "truy_van", fill, recent });
  }

  if (idLada) {
    const { results, fill, recent } = await localIdentityLookup(c.env.DB, "id_lada", idLada);

    // Tra cuu them he thong ngoai "center.dichvu3t.com" (API 3 - tai chi dinh Ecolada theo ID LADA,
    // xem lib/center3tClient.ts) - luon thu bat ke noi bo da co lich su hay chua, giong het tinh than
    // tra cuu ID CRM (luon goi CRM song, khong chi dua vao du lieu cu). Uu tien du lieu ngoai cho
    // model/hang (thong tin thiet bi thuc te tu he thong don hang, xem cung logic o nhanh CRM ben
    // duoi); cac truong con lai chi dien khi noi bo CHUA co (uu tien lich su da duoc CSKH xac nhan).
    let preview: Record<string, string | null> | undefined;
    let externalWarning: string | undefined;
    try {
      const ext = await lookupOrderByIdLada(c.env, idLada);
      if (ext.found && ext.row) {
        const r = ext.row;
        const put = (key: string, label: string) => {
          const v = r[label]?.trim();
          if (v && !fill[key]) fill[key] = v;
        };
        if (r["Model máy"]?.trim()) fill.model = r["Model máy"].trim();
        if (r["Nhãn hiệu máy"]?.trim()) fill.hang = r["Nhãn hiệu máy"].trim();
        put("ten_khach", "Tên KH");
        put("id_truy_van", "ID Truy xuất");
        // Nguon Ecolada (center.dichvu3t.com, API export-excel-order-get-data) chi tra ve dia chinh
        // CU 3 cap (Tinh/Huyen/Xa) - da xac nhan bang 2 lan goi API that (ID Lada B1391729): "Địa chỉ
        // mới 2 cấp" hien tren giao dien Lada KHONG xuat hien o bat ky cot nao trong 122 cot cua
        // response nay (kiem tra ca byte-tho tren XML, khong chi qua parser). Truoc day co logic
        // doan dia chinh moi bang cach kiem tra ten tinh/Quan-Huyen rong hay khong - da bo vi khong
        // co bang chung, chi gay mat du lieu cu that su ton tai (2026-09-21).
        put("tinh", "Tỉnh/Thành");
        put("quan_huyen", "Quận/Huyện");
        put("phuong_xa", "Phường/Xã");
        const str = (v?: string) => (v && v.trim() !== "" ? v.trim() : null);
        preview = {
          khach_hang: str(r["Tên KH"]),
          ky_thuat_vien: str(r["Kỹ Thuật Viên"]),
          tien_do_hoan_thanh: str(r["Trạng thái"]),
          noi_dung_xu_ly: str(r["Ghi chú lắp đặt"]) ?? str(r["Ghi chú Bán hàng"]),
          thoi_gian_cskh_tiep_nhan: str(r["Ngày khởi tạo"]),
          thoi_gian_hoan_thanh: str(r["Ngày Chốt Đơn"]),
          mo_ta_loi: null,
          khu_vuc: str(r["Tỉnh/Thành"]),
          loai_yeu_cau: null,
          thoi_gian_hen_xu_ly: str(r["Ngày hẹn"]),
          ly_do_qua_han: null,
          link_crm: null,
        };
      } else {
        externalWarning = ext.warning;
      }
    } catch (e) {
      console.error("CENTER3T_LOOKUP_FAILED", e);
      externalWarning = "CENTER3T_LOOKUP_FAILED";
    }

    if (fill.tinh) fill.tinh = String(await chuanHoaTinh(c.env.DB, "tinh", fill.tinh));
    const found = results.length > 0 || !!preview;
    return c.json({ found, source: "lada", fill, recent, preview, warning: found ? undefined : externalWarning });
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
      const tinhMoiChuan = tinhVal ? await timTinhChuan(c.env.DB, "tinh_moi", tinhVal) : undefined;
      if (tinhMoiChuan) {
        fill.tinh_moi = tinhMoiChuan;
      } else {
        put("tinh", tinhVal ? await chuanHoaTinh(c.env.DB, "tinh", tinhVal) : p.tinh);
        put("quan_huyen", p.quan_huyen);
      }
      const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
      const num = (v: unknown): number | null => {
        if (typeof v === "number") return Number.isFinite(v) ? v : null;
        if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
        return null;
      };
      // Tra ve DU toan bo cot dvbh co (khong chi tap con dung tu dien form) - man chi tiet phan anh
      // (KhieuNaiDetail.tsx, modal "Xem chi tiet DVBH") can day du thong tin xu ly cua KTV (cach
      // thuc xu ly, dinh gia, nganh hang...) chu khong chi vai truong nhu truoc (2026-09-22).
      return c.json({
        found: true, source: "crm", fill,
        preview: {
          khach_hang: str(p.khach_hang), ky_thuat_vien: str(p.ky_thuat_vien), seri_san_pham: str(p.seri_san_pham),
          khu_vuc: str(p.khu_vuc), tinh: str(p.tinh), quan_huyen: str(p.quan_huyen), hang: str(p.hang),
          san_pham_bao_hanh: str(p.san_pham_bao_hanh), tien_do_hoan_thanh: str(p.tien_do_hoan_thanh),
          mo_ta_loi: str(p.mo_ta_loi), nhom_san_pham: str(p.nhom_san_pham), nhom_yeu_cau: str(p.nhom_yeu_cau),
          loai_yeu_cau: str(p.loai_yeu_cau), hinh_thuc_bao_hanh: str(p.hinh_thuc_bao_hanh), ngay_mua: str(p.ngay_mua),
          thoi_gian_cskh_tiep_nhan: str(p.thoi_gian_cskh_tiep_nhan), thoi_gian_hen_xu_ly: str(p.thoi_gian_hen_xu_ly),
          thoi_gian_hoan_thanh: str(p.thoi_gian_hoan_thanh), doi_tac: str(p.doi_tac), link_crm: str(p.link_crm),
          noi_dung_xu_ly: str(p.noi_dung_xu_ly), luu_y_loi_linh_kien: str(p.luu_y_loi_linh_kien),
          cach_thuc_xu_ly: str(p.cach_thuc_xu_ly), nganh: str(p.nganh), loai_nganh: str(p.loai_nganh),
          nhom_kh: str(p.nhom_kh), dt_san_pham: num(p.dt_san_pham), dt_linh_kien: num(p.dt_linh_kien),
          dt_dich_vu: num(p.dt_dich_vu), ly_do_qua_han: str(p.ly_do_qua_han), ngay_import: str(p.ngay_import),
          ngay_cap_nhat_gan_nhat: str(p.ngay_cap_nhat_gan_nhat), dung_han: str(p.dung_han),
          xu_ly_24h_bucket: str(p.xu_ly_24h_bucket), ly_do_huy: str(p.ly_do_huy),
          link_hinh_anh: Array.isArray(p.link_hinh_anh) ? p.link_hinh_anh : null,
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
  const currentMonth = currentMonthVN();
  const thangParam = c.req.query("thang");
  const thang = isValidThang(thangParam) ? thangParam : currentMonth;
  const { sql: thangSql, binds: thangBinds } = buildThangCondition(thang, currentMonth);
  const conditions: string[] = ["trang_thai != 'Huy'", thangSql];
  const binds: unknown[] = [...thangBinds];

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
    thang,
  });
});

interface TrungLapRow {
  id: string;
  id_lada: string | null;
  id_lada_phat_sinh: string | null;
  id_truy_van: string | null;
  ngay_tiep_nhan: string;
  ten_khach: string | null;
  van_de_dau_vao: string | null;
  trang_thai: string;
}

// Ca trung lap/tai phat sinh: gop nhom theo "hanh trinh" 1 may - coi id_lada (goc), id_lada_phat_sinh
// (sinh o nhanh doi may) VA id_truy_van la CUNG 1 danh tinh khi xuat hien chung tren 1 dong
// (Union-Find). Uu tien so sanh theo id_truy_van (ma tra cuu rieng cho tung lan dich vu, dang tin
// cay hon vi ID Lada la ma theo MAY VAT LY nen co the bi dung lai qua nhieu lan dich vu khac nhau
// khong lien quan) - id_lada chi la tin hieu du phong khi id_truy_van khong co/khong khop
// (2026-09-21). Ca 2 tin hieu deu nam CHUNG 1 union-find graph nen van bat duoc truong hop bac cau
// (vd doi may: id_truy_van cu noi voi id_lada cu, id_lada moi lai xuat hien o don khac).
app.get("/bao-cao/trung-lap", requireRole("CSKH", "TN CSKH", "QL", "Admin", "Viewer"), async (c) => {
  // Truoc day quet "xuyen suot" (chi cham LIMIT 20000 dong gan nhat) de bat tai phat cach nhau
  // nhieu thang - nhung LIMIT do ngam dinh 1 "cua so thoi gian" seo lai dan khi luong ca/ngay tang
  // (vd 5k ca/ngay, 50% co ID Lada => 20000 dong chi con ~8 ngay), nen tai phat cu hon se bi bo sot
  // ma khong bao loi gi (item 2026-09-21). Doi sang loc theo thang (giong SLA/Chot loi, dung chung
  // ThangFilter tren giao dien) - chi phi bi chan chac chan theo khoi luong 1 thang, khong phu
  // thuoc tong lich su; danh doi: tai phat cach nhau qua 1 thang se khong con duoc gop nhom.
  const currentMonth = currentMonthVN();
  const thangParam = c.req.query("thang");
  const thang = isValidThang(thangParam) ? thangParam : currentMonth;
  const start = `${thang}-01 00:00:00`;

  // Ca da Huy khong tinh la "tai phat" (khong phai 1 lan phan anh that su can xem xet).
  const conditions: string[] = [
    "(id_lada IS NOT NULL OR id_lada_phat_sinh IS NOT NULL OR id_truy_van IS NOT NULL)",
    "trang_thai != 'Huy'",
    "ngay_tiep_nhan >= ? AND ngay_tiep_nhan < datetime(?, '+1 month')",
  ];
  const binds: unknown[] = [start, start];

  const { results } = await c.env.DB.prepare(
    `SELECT id, id_lada, id_lada_phat_sinh, id_truy_van, ngay_tiep_nhan, ten_khach, van_de_dau_vao, trang_thai
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
  // Namespace tien to de tranh 1 chuoi ID truy xuat trung ngau nhien voi 1 chuoi ID Lada (2 he thong
  // ma khac nhau). ID truy xuat dung lam khoa CHINH (dang tin cay hon), ID Lada la khoa DU PHONG.
  const identityKeysOf = (r: TrungLapRow) => {
    const keys: string[] = [];
    if (r.id_truy_van && r.id_truy_van.trim() !== "") keys.push(`TV:${r.id_truy_van.trim()}`);
    if (r.id_lada && r.id_lada.trim() !== "") keys.push(`LD:${r.id_lada.trim()}`);
    if (r.id_lada_phat_sinh && r.id_lada_phat_sinh.trim() !== "") keys.push(`LD:${r.id_lada_phat_sinh.trim()}`);
    return keys;
  };
  for (const r of results) {
    const keys = identityKeysOf(r);
    for (const k of keys) if (!parent.has(k)) parent.set(k, k);
    for (let i = 1; i < keys.length; i++) union(keys[0], keys[i]);
  }

  const groups = new Map<string, TrungLapRow[]>();
  for (const r of results) {
    const keys = identityKeysOf(r);
    if (keys.length === 0) continue;
    const root = find(keys[0]);
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
      const idTruyVanVals = [...new Set(sorted.map((r) => r.id_truy_van).filter((v): v is string => !!v && v.trim() !== ""))];
      const idLadaVals = [...new Set(sorted.flatMap((r) => [r.id_lada, r.id_lada_phat_sinh]).filter((v): v is string => !!v && v.trim() !== ""))];
      return {
        id_truy_van_ids: idTruyVanVals,
        lada_ids: idLadaVals,
        so_lan: sorted.length,
        khoang_cach_ngan_nhat: Math.round(minGapDays * 10) / 10,
        tai_phat_trong_7_ngay: minGapDays <= 7,
        // "sorted" (tang dan) chi dung de tinh khoang cach giua cac lan - hien thi cho nguoi dung
        // thi dao lai, ca moi nhat len tren cung (item: mac dinh moi nhat tren cung).
        items: [...sorted].reverse().map((r) => ({
          id: r.id, ngay_tiep_nhan: r.ngay_tiep_nhan, ten_khach: r.ten_khach,
          van_de_dau_vao: r.van_de_dau_vao, trang_thai: r.trang_thai,
          id_lada: r.id_lada, id_lada_phat_sinh: r.id_lada_phat_sinh, id_truy_van: r.id_truy_van,
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
    thang,
  });
});

interface ChotLoiRow {
  ngay_ket_thuc: string | null;
  tinh: string | null;
  tinh_moi: string | null;
  nhom_yeu_cau: string | null;
  nhom_van_de: string | null;
  nguoi_tao: string | null;
  loi_nha_san_xuat: string;
  loi_lap_dat: string;
  loi_thai_do_ktv: string;
  loi_quy_trinh_nskx: string;
}
interface ChotLoiAgg {
  key: string;
  so_ca: number;
  so_loi_nsx: number;
  so_loi_lap_dat: number;
  so_loi_thai_do_ktv: number;
  so_loi_quy_trinh_nskx: number;
  ca_co_loi: number;
}
function newChotLoiAgg(key: string): ChotLoiAgg {
  return { key, so_ca: 0, so_loi_nsx: 0, so_loi_lap_dat: 0, so_loi_thai_do_ktv: 0, so_loi_quy_trinh_nskx: 0, ca_co_loi: 0 };
}
function applyChotLoiRow(g: ChotLoiAgg, r: ChotLoiRow) {
  g.so_ca++;
  const isNsx = r.loi_nha_san_xuat === "Co";
  const isLapDat = r.loi_lap_dat === "Co";
  const isThaiDo = r.loi_thai_do_ktv === "Co";
  const isQuyTrinh = r.loi_quy_trinh_nskx === "Co";
  if (isNsx) g.so_loi_nsx++;
  if (isLapDat) g.so_loi_lap_dat++;
  if (isThaiDo) g.so_loi_thai_do_ktv++;
  if (isQuyTrinh) g.so_loi_quy_trinh_nskx++;
  if (isNsx || isLapDat || isThaiDo || isQuyTrinh) g.ca_co_loi++;
}
function bumpChotLoi(map: Map<string, ChotLoiAgg>, key: string, r: ChotLoiRow) {
  const g = map.get(key) ?? newChotLoiAgg(key);
  applyChotLoiRow(g, r);
  map.set(key, g);
}
function finalizeChotLoi(g: ChotLoiAgg) {
  return { ...g, ty_le_loi: g.so_ca > 0 ? Math.round((g.ca_co_loi / g.so_ca) * 1000) / 10 : 0 };
}

// Bao cao "chot loi": tren tap ca DA CO KET LUAN (ket_luan_khieu_nai != 'Chua danh gia') trong
// khoang tu_ngay/den_ngay (loc theo ngay_ket_thuc - ngay dong ca). "So ca" khac "so loi" vi 1 ca
// co the dinh dong thoi nhieu trong 4 loai loi. "Ty le loi" = ca co it nhat 1 trong 4 co = "Co" /
// tong so ca da chot (theo xac nhan cua nguoi dung, khong tinh ca "Chua danh gia").
app.get("/bao-cao/chot-loi", requireRole("CSKH", "TN CSKH", "QL", "Admin", "Viewer"), async (c) => {
  const currentMonth = currentMonthVN();
  const thangParam = c.req.query("thang");
  const conditions: string[] = ["ket_luan_khieu_nai IS NOT NULL", "ket_luan_khieu_nai != 'Chua danh gia'"];
  const binds: unknown[] = [];
  let thang: string | null = null;
  if (isValidThang(thangParam)) {
    // Chon 1 thang cu the: dung chung dieu kien voi Trang chu/SLA (dong/huy trong thang do).
    thang = thangParam;
    const { sql, binds: b } = buildThangCondition(thang, currentMonth);
    conditions.push(sql);
    binds.push(...b);
  } else {
    // Khong chon thang cu the: bang "Theo thang" can nhieu thang de xem xu huong -> mac dinh gioi
    // han 12 thang gan nhat (thay vi quet toan bo lich su) - van giu lai cac ca chua ro ngay dong
    // (vd bi huy sau khi da danh gia, ngay_ket_thuc rong) de khong lam mat du lieu so voi truoc day.
    conditions.push("(ngay_ket_thuc IS NULL OR ngay_ket_thuc >= datetime(?, '-11 months'))");
    binds.push(`${currentMonth}-01 00:00:00`);
  }

  // LIMIT phong ho giong cac bao cao khac (xem giai thich o /bao-cao/sla).
  const [{ results }, { results: userRows }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ngay_ket_thuc, tinh, tinh_moi, nhom_yeu_cau, nhom_van_de, nguoi_tao,
              loi_nha_san_xuat, loi_lap_dat, loi_thai_do_ktv, loi_quy_trinh_nskx
       FROM khieu_nai WHERE ${conditions.join(" AND ")} LIMIT 20000`,
    ).bind(...binds).all<ChotLoiRow>(),
    c.env.DB.prepare("SELECT email, ten, vai_tro FROM users").all<{ email: string; ten: string | null; vai_tro: string | null }>(),
  ]);
  const userMap = new Map(userRows.map((u) => [u.email, u]));

  const tong = newChotLoiAgg("Tổng");
  const theoThang = new Map<string, ChotLoiAgg>();
  const theoTinh = new Map<string, ChotLoiAgg>();
  const theoNhomYeuCau = new Map<string, ChotLoiAgg>();
  const theoNhomVanDe = new Map<string, ChotLoiAgg>();
  const theoNguonTao = new Map<string, ChotLoiAgg>();
  const theoNguoiTao = new Map<string, ChotLoiAgg>();

  for (const r of results) {
    applyChotLoiRow(tong, r);
    const thangKey = r.ngay_ket_thuc ? r.ngay_ket_thuc.slice(0, 7) : "Không rõ";
    bumpChotLoi(theoThang, thangKey, r);
    bumpChotLoi(theoTinh, r.tinh_moi || r.tinh || "Không rõ", r);
    bumpChotLoi(theoNhomYeuCau, r.nhom_yeu_cau || "Không rõ", r);
    bumpChotLoi(theoNhomVanDe, r.nhom_van_de || "Không rõ", r);
    const u = r.nguoi_tao ? userMap.get(r.nguoi_tao) : undefined;
    bumpChotLoi(theoNguonTao, u?.vai_tro || "Không rõ", r);
    bumpChotLoi(theoNguoiTao, r.nguoi_tao ? (u?.ten || r.nguoi_tao) : "Không rõ", r);
  }

  const sortDesc = (a: ChotLoiAgg, b: ChotLoiAgg) => b.so_ca - a.so_ca;
  return c.json({
    tong: finalizeChotLoi(tong),
    theo_thang: [...theoThang.values()].sort((a, b) => b.key.localeCompare(a.key)).map(finalizeChotLoi),
    theo_tinh: [...theoTinh.values()].sort(sortDesc).map(finalizeChotLoi),
    theo_nhom_yeu_cau: [...theoNhomYeuCau.values()].sort(sortDesc).map(finalizeChotLoi),
    theo_nhom_van_de: [...theoNhomVanDe.values()].sort(sortDesc).map(finalizeChotLoi),
    theo_nguon_tao: [...theoNguonTao.values()].sort(sortDesc).map(finalizeChotLoi),
    theo_nguoi_tao: [...theoNguoiTao.values()].sort(sortDesc).slice(0, 20).map(finalizeChotLoi),
    thang,
  });
});

// Danh sach nguoi dung gon (chi email+ten, khong du lieu quan tri) de dung cho bo loc "Nguoi tiep
// nhan"/"Nguoi tao" o Bao cao - KHONG dung /api/users (chi Admin duoc goi) vi Bao cao mo cho ca
// CSKH/TN CSKH/QL/Viewer. Bang users nho (~100-120 dong, khong phu thuoc quy mo khieu_nai).
app.get("/bao-cao/nguoi-dung", requireRole("CSKH", "TN CSKH", "QL", "Admin", "Viewer"), async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT email, ten FROM users WHERE trang_thai_duyet = 'Da duyet' AND bi_khoa = 0 ORDER BY ten",
  ).all<{ email: string; ten: string | null }>();
  return c.json({ items: results });
});

const BAO_CAO_NGAY_MAX_DAYS = 92; // ~3 thang, tranh yeu cau 1 khoang qua rong.

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface TheoNgaySlRow { ngay: string; sl: number; tb_ngay: number | null }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Tham so chung cua khoi "Bao cao theo ngay" (bang theo ngay + bang theo nguoi tiep nhan): khoang
// ngay (mac dinh hom nay, toi da BAO_CAO_NGAY_MAX_DAYS) + 6 bo loc. fEmpty/fK = dieu kien loc tren
// bang khieu_nai khong/co alias "k.".
function parseNgayVaLoc(q: (k: string) => string | undefined) {
  const todayVN = nowVN().slice(0, 10);
  let tuNgay = q("tu_ngay");
  let denNgay = q("den_ngay");
  if (!tuNgay || !DATE_RE.test(tuNgay)) tuNgay = todayVN;
  if (!denNgay || !DATE_RE.test(denNgay)) denNgay = tuNgay;
  if (denNgay < tuNgay) { const t = tuNgay; tuNgay = denNgay; denNgay = t; }
  if (addDaysISO(tuNgay, BAO_CAO_NGAY_MAX_DAYS - 1) < denNgay) denNgay = addDaysISO(tuNgay, BAO_CAO_NGAY_MAX_DAYS - 1);

  const nguoiTiepNhan = q("nguoi_tiep_nhan");
  const nguoiTao = q("nguoi_tao");
  const nguon = q("nguon");
  const nhomYeuCau = q("nhom_yeu_cau");
  const mucDo = q("muc_do");
  const phanLoaiKh = q("phan_loai_kh");
  const hasFilter = !!(nguoiTiepNhan || nguoiTao || nguon || nhomYeuCau || mucDo || phanLoaiKh);

  const buildFilterConds = (prefix: string) => {
    const conds: string[] = [];
    const binds: unknown[] = [];
    if (nguoiTiepNhan) { conds.push(`${prefix}cskh_tiep_nhan = ?`); binds.push(nguoiTiepNhan); }
    if (nguoiTao) { conds.push(`${prefix}nguoi_tao = ?`); binds.push(nguoiTao); }
    if (nguon) { conds.push(`${prefix}nguon = ?`); binds.push(nguon); }
    if (nhomYeuCau) { conds.push(`${prefix}nhom_yeu_cau = ?`); binds.push(nhomYeuCau); }
    if (mucDo) { conds.push(`${prefix}muc_do = ?`); binds.push(mucDo); }
    if (phanLoaiKh) { conds.push(`${prefix}phan_loai_kh = ?`); binds.push(phanLoaiKh); }
    return { sql: conds.length ? ` AND ${conds.join(" AND ")}` : "", binds };
  };
  return { todayVN, tuNgay, denNgay, hasFilter, fEmpty: buildFilterConds(""), fK: buildFilterConds("k.") };
}

const gio1 = (days: number | null | undefined) => (days == null ? null : Math.round(days * 24 * 10) / 10);
const tyLe1 = (tu: number, mau: number) => (mau > 0 ? Math.round((tu / mau) * 1000) / 10 : null);

// "Bao cao theo ngay": 1 dong/ngay trong khoang [tu_ngay, den_ngay], cac chi so "phat sinh trong
// ngay" (1,4,5,6,7) tinh tu khieu_nai (+ khieu_nai_lich_su cho rieng "tiep nhan") - re va dung cho
// BAT KY ngay nao (qua khu/hien tai) vi chi doc phan du lieu cua dung khoang ngay duoc chon, khong
// phu thuoc tong lich su. Rieng cac chi so "ton dong" (2,3,9,10) la SO LIEU TAI 1 THOI DIEM, chi
// lay duoc CHINH XAC cho qua khu khi KHONG loc gi (dung bao_cao_ngay_snapshot, chup 1 lan/ngay -
// snapshot khong tach duoc theo bo loc) - khi co loc, 4 chi so nay tra ve null cho ngay qua khu (rieng
// "hom nay" luon tinh song, kem theo loc, vi chi la 1 truy van dem theo trang_thai hien tai).
app.get("/bao-cao/theo-ngay", requireRole("CSKH", "TN CSKH", "QL", "Admin", "Viewer"), async (c) => {
  const { todayVN, tuNgay, denNgay, hasFilter, fEmpty, fK } = parseNgayVaLoc((k) => c.req.query(k));

  const rangeStart = `${tuNgay} 00:00:00`;
  const rangeEndBind = `${denNgay} 00:00:00`; // dung datetime(?, '+1 day') lam moc tren (loai tru)

  const [moiQ, dongQ, tiepNhanQ, tuTiepNhanQ, snapshotQ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT substr(ngay_tiep_nhan,1,10) as ngay, COUNT(*) as sl, NULL as tb_ngay
       FROM khieu_nai WHERE ngay_tiep_nhan >= ? AND ngay_tiep_nhan < datetime(?, '+1 day')${fEmpty.sql}
       GROUP BY ngay`,
    ).bind(rangeStart, rangeEndBind, ...fEmpty.binds).all<TheoNgaySlRow>(),
    c.env.DB.prepare(
      `SELECT substr(ngay_ket_thuc,1,10) as ngay, COUNT(*) as sl,
              AVG(julianday(ngay_ket_thuc) - julianday(ngay_tiep_nhan)) as tb_ngay
       FROM khieu_nai
       WHERE trang_thai = 'Da ket thuc' AND ngay_ket_thuc >= ? AND ngay_ket_thuc < datetime(?, '+1 day')${fEmpty.sql}
       GROUP BY ngay`,
    ).bind(rangeStart, rangeEndBind, ...fEmpty.binds).all<TheoNgaySlRow>(),
    c.env.DB.prepare(
      `SELECT substr(l.thoi_diem,1,10) as ngay, COUNT(*) as sl,
              AVG(julianday(l.thoi_diem) - julianday(k.ngay_tiep_nhan)) as tb_ngay
       FROM khieu_nai_lich_su l JOIN khieu_nai k ON k.id = l.khieu_nai_id
       WHERE l.hanh_dong = 'tiep_nhan' AND l.thoi_diem >= ? AND l.thoi_diem < datetime(?, '+1 day')${fK.sql}
       GROUP BY ngay`,
    ).bind(rangeStart, rangeEndBind, ...fK.binds).all<TheoNgaySlRow>(),
    // Ca "tu tiep nhan" (CSKH/TN CSKH/QL/Admin tu tao va nhan luon, xem autoReceived o route POST /)
    // khong di qua route /tiep-nhan nen KHONG co dong lich su hanh_dong='tiep_nhan' - phai dem rieng
    // tu bang khieu_nai (da nhan = cskh_tiep_nhan khong rong) va loai tru cac id da dem o tiepNhanQ.
    c.env.DB.prepare(
      `SELECT substr(ngay_tiep_nhan,1,10) as ngay, COUNT(*) as sl, 0 as tb_ngay
       FROM khieu_nai
       WHERE trang_thai != 'Cho tiep nhan' AND cskh_tiep_nhan IS NOT NULL
         AND id NOT IN (SELECT khieu_nai_id FROM khieu_nai_lich_su WHERE hanh_dong = 'tiep_nhan')
         AND ngay_tiep_nhan >= ? AND ngay_tiep_nhan < datetime(?, '+1 day')${fEmpty.sql}
       GROUP BY ngay`,
    ).bind(rangeStart, rangeEndBind, ...fEmpty.binds).all<TheoNgaySlRow>(),
    c.env.DB.prepare(
      "SELECT ngay, cho_tiep_nhan, con_ton FROM bao_cao_ngay_snapshot WHERE ngay >= ? AND ngay <= ?",
    ).bind(addDaysISO(tuNgay, -1), denNgay).all<{ ngay: string; cho_tiep_nhan: number; con_ton: number }>(),
  ]);

  const toMap = (rows: TheoNgaySlRow[]) => new Map(rows.map((r) => [r.ngay, r]));
  const moiMap = toMap(moiQ.results);
  const dongMap = toMap(dongQ.results);
  const tuTiepNhanMap = toMap(tuTiepNhanQ.results);
  // Gop "tiep nhan qua route" + "tu tiep nhan luc tao" thanh 1 map, cong dồn so luong + tinh lai
  // trung binh gio tiep nhan theo trong so (tu tiep nhan luon co tb_ngay = 0 vi nhan ngay luc tao).
  const tiepNhanMap = new Map<string, TheoNgaySlRow>();
  for (const r of tiepNhanQ.results) tiepNhanMap.set(r.ngay, { ...r });
  for (const r of tuTiepNhanMap.values()) {
    const cur = tiepNhanMap.get(r.ngay);
    if (!cur) { tiepNhanMap.set(r.ngay, { ...r }); continue; }
    const slTong = cur.sl + r.sl;
    const tbTong =
      cur.tb_ngay != null && r.tb_ngay != null
        ? (cur.tb_ngay * cur.sl + r.tb_ngay * r.sl) / slTong
        : (cur.tb_ngay ?? r.tb_ngay);
    tiepNhanMap.set(r.ngay, { ngay: r.ngay, sl: slTong, tb_ngay: tbTong });
  }
  const snapshotMap = new Map(snapshotQ.results.map((r) => [r.ngay, r]));

  // "Hom nay" chua chac co snapshot (cron chay 20h) - tinh song lam du phong, van ap bo loc neu co.
  let liveToday: { cho_tiep_nhan: number; con_ton: number } | null = null;
  if (denNgay >= todayVN && tuNgay <= todayVN) {
    const conds = fEmpty.sql;
    const [ct, ct2] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM khieu_nai WHERE trang_thai = 'Cho tiep nhan'${conds}`)
        .bind(...fEmpty.binds).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM khieu_nai WHERE trang_thai NOT IN ('Da ket thuc','Huy')${conds}`)
        .bind(...fEmpty.binds).first<{ n: number }>(),
    ]);
    liveToday = { cho_tiep_nhan: ct?.n ?? 0, con_ton: ct2?.n ?? 0 };
  }

  const rows: Record<string, unknown>[] = [];
  for (let d = tuNgay; d <= denNgay; d = addDaysISO(d, 1)) {
    const moi = moiMap.get(d)?.sl ?? 0;
    const dong = dongMap.get(d)?.sl ?? 0;
    const tbXuLyGio = dongMap.get(d)?.tb_ngay != null ? Math.round((dongMap.get(d)!.tb_ngay as number) * 24 * 10) / 10 : null;
    const tiepNhan = tiepNhanMap.get(d)?.sl ?? 0;
    const tbTiepNhanGio = tiepNhanMap.get(d)?.tb_ngay != null ? Math.round((tiepNhanMap.get(d)!.tb_ngay as number) * 24 * 10) / 10 : null;

    const hom_qua = snapshotMap.get(addDaysISO(d, -1));
    const tonCuChuaTiepNhan = !hasFilter && hom_qua ? hom_qua.cho_tiep_nhan : null;
    const tonCuDaTiepNhan = !hasFilter && hom_qua ? hom_qua.con_ton - hom_qua.cho_tiep_nhan : null;

    const isToday = d === todayVN;
    const closing = isToday ? liveToday : (!hasFilter ? snapshotMap.get(d) : undefined);
    const choTiepNhan = closing ? closing.cho_tiep_nhan : null;
    const conTon = closing ? closing.con_ton : null;

    const mauSo = moi + (tonCuChuaTiepNhan ?? 0);
    const tyLeTiepNhan = mauSo > 0 ? Math.round((tiepNhan / mauSo) * 1000) / 10 : null;

    rows.push({
      ngay: d,
      ca_moi: moi,
      ton_cu_chua_tiep_nhan: tonCuChuaTiepNhan,
      ton_cu_da_tiep_nhan: tonCuDaTiepNhan,
      da_tiep_nhan: tiepNhan,
      da_dong: dong,
      tb_gio_tiep_nhan: tbTiepNhanGio,
      tb_gio_xu_ly: tbXuLyGio,
      ty_le_tiep_nhan: tyLeTiepNhan,
      cho_tiep_nhan: choTiepNhan,
      con_ton: conTon,
    });
  }

  return c.json({ tu_ngay: tuNgay, den_ngay: denNgay, co_loc: hasFilter, rows });
});

// Bao cao theo NGUOI TIEP NHAN trong khoang ngay (cung bo loc voi bang theo ngay). Chi hien nguoi
// thuc su co tiep nhan ca trong khoang + 1 dong tong toan he thong. Ca tiep nhan tach 3 nhom:
//   tu_mo         = ca MO TRONG KHOANG, nguoi do tu tao va nhan luon (khong qua nut Tiep nhan)
//   tu_nguon_khac = ca MO TRONG KHOANG do nguoi khac (NV Sale/Tong dai vien) tao, bam "Tiep nhan"
//   ton_cu        = ca MO TRUOC KHOANG, duoc bam "Tiep nhan" trong khoang
// Ty le = (tu_mo + tu_nguon_khac) / tong ca mo moi trong khoang (moi nguon) - tu so va mau so cung la
// ca mo trong khoang, moi ca chi nhan 1 lan nen khong vuot 100%. Ton cu hien rieng, khong vao ty le.
// TB gio tiep nhan = moi ca bam "Tiep nhan" (nguon khac + ton cu); ca tu mo = 0 gio nen khong tinh.
app.get("/bao-cao/theo-nguoi-tiep-nhan", requireRole("CSKH", "TN CSKH", "QL", "Admin", "Viewer"), async (c) => {
  const { tuNgay, denNgay, hasFilter, fEmpty, fK } = parseNgayVaLoc((k) => c.req.query(k));
  const rangeStart = `${tuNgay} 00:00:00`;
  const rangeEndBind = `${denNgay} 00:00:00`;

  const [moiQ, bamNhanQ, tuMoQ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM khieu_nai WHERE ngay_tiep_nhan >= ? AND ngay_tiep_nhan < datetime(?, '+1 day')${fEmpty.sql}`,
    ).bind(rangeStart, rangeEndBind, ...fEmpty.binds).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT l.nguoi as email, u.ten as ten,
              SUM(CASE WHEN k.ngay_tiep_nhan >= ?1 THEN 1 ELSE 0 END) as moi,
              SUM(CASE WHEN k.ngay_tiep_nhan < ?1 THEN 1 ELSE 0 END) as ton_cu,
              COUNT(*) as sl,
              AVG(julianday(l.thoi_diem) - julianday(k.ngay_tiep_nhan)) as tb_ngay
       FROM khieu_nai_lich_su l JOIN khieu_nai k ON k.id = l.khieu_nai_id LEFT JOIN users u ON u.email = l.nguoi
       WHERE l.hanh_dong = 'tiep_nhan' AND l.thoi_diem >= ?1 AND l.thoi_diem < datetime(?2, '+1 day')${fK.sql}
       GROUP BY l.nguoi`,
    ).bind(rangeStart, rangeEndBind, ...fK.binds)
      .all<{ email: string; ten: string | null; moi: number; ton_cu: number; sl: number; tb_ngay: number | null }>(),
    c.env.DB.prepare(
      `SELECT k.cskh_tiep_nhan as email, u.ten as ten, COUNT(*) as sl
       FROM khieu_nai k LEFT JOIN users u ON u.email = k.cskh_tiep_nhan
       WHERE k.trang_thai != 'Cho tiep nhan' AND k.cskh_tiep_nhan IS NOT NULL
         AND k.id NOT IN (SELECT khieu_nai_id FROM khieu_nai_lich_su WHERE hanh_dong = 'tiep_nhan')
         AND k.ngay_tiep_nhan >= ? AND k.ngay_tiep_nhan < datetime(?, '+1 day')${fK.sql}
       GROUP BY k.cskh_tiep_nhan`,
    ).bind(rangeStart, rangeEndBind, ...fK.binds).all<{ email: string; ten: string | null; sl: number }>(),
  ]);

  const tongCaMoi = moiQ?.n ?? 0;
  type Acc = { tu_mo: number; tu_nguon_khac: number; ton_cu: number; sl_bam: number; tb_ngay: number | null };
  const byEmail = new Map<string, Acc & { email: string; ten: string | null }>();
  const get = (email: string, ten: string | null) => {
    let r = byEmail.get(email);
    if (!r) { r = { email, ten, tu_mo: 0, tu_nguon_khac: 0, ton_cu: 0, sl_bam: 0, tb_ngay: null }; byEmail.set(email, r); }
    return r;
  };
  for (const r of tuMoQ.results) get(r.email, r.ten).tu_mo = r.sl;
  for (const r of bamNhanQ.results) {
    const x = get(r.email, r.ten);
    x.tu_nguon_khac = r.moi; x.ton_cu = r.ton_cu; x.sl_bam = r.sl; x.tb_ngay = r.tb_ngay;
  }

  const shape = (x: Acc) => ({
    tu_mo: x.tu_mo,
    tu_nguon_khac: x.tu_nguon_khac,
    ton_cu: x.ton_cu,
    tong_tiep_nhan: x.tu_mo + x.tu_nguon_khac + x.ton_cu,
    ty_le: tyLe1(x.tu_mo + x.tu_nguon_khac, tongCaMoi),
    tb_gio_tiep_nhan: gio1(x.tb_ngay),
  });
  const rows = [...byEmail.values()]
    .map((x) => ({ email: x.email, ten: x.ten, ...shape(x) }))
    .sort((a, b) => b.tong_tiep_nhan - a.tong_tiep_nhan || (a.ten ?? a.email).localeCompare(b.ten ?? b.email, "vi"));

  // Dong tong: TB gio = trung binh co trong so theo so ca bam "Tiep nhan" cua tung nguoi.
  let slBam = 0, tongNgay = 0;
  for (const x of byEmail.values()) if (x.tb_ngay != null) { slBam += x.sl_bam; tongNgay += x.tb_ngay * x.sl_bam; }
  const sum = (k: "tu_mo" | "tu_nguon_khac" | "ton_cu") => rows.reduce((s, r) => s + r[k], 0);
  const tong = shape({
    tu_mo: sum("tu_mo"), tu_nguon_khac: sum("tu_nguon_khac"), ton_cu: sum("ton_cu"),
    sl_bam: slBam, tb_ngay: slBam > 0 ? tongNgay / slBam : null,
  });

  return c.json({ tu_ngay: tuNgay, den_ngay: denNgay, co_loc: hasFilter, tong_ca_moi: tongCaMoi, tong, rows });
});

// Toc do xu ly toan he thong theo ky (ngay/tuan/thang) x 4 moc, tuy chon phan loai theo nguoi tiep
// nhan / nguon / tinh. Moi moc tinh tu luc MO CA (ngay_tiep_nhan) toi luc moc do xay ra, va xep vao ky
// theo NGAY XAY RA moc do (giong cot "TB gio XL" cua bang theo ngay):
//   tn = Tiep nhan (lich su 'tiep_nhan'; bo qua ca tu mo vi = 0 gio)
//   vp = Chot vi pham (lan danh gia loi cuoi cung, chi ca da danh gia du 4 loi + ket luan)
//   ql = Danh gia QL (lan dau nhap danh gia QL; ca cu truoc khi co nhat ky -> ngay_ql_danh_gia)
//   kt = Chot ket thuc (ngay_ket_thuc)
// Ca Huy khong tinh.
const TOC_DO_KY = { ngay: 92, tuan: 371, thang: 731 } as const; // so ngay toi da cua khoang theo tung ky
type TocDoKy = keyof typeof TOC_DO_KY;
const TOC_DO_PHAN_LOAI: Record<string, string> = {
  nguoi_tiep_nhan: "COALESCE(k.cskh_tiep_nhan, '')",
  nguon: "COALESCE(k.nguon, '')",
  tinh: "COALESCE(NULLIF(k.tinh_moi, ''), NULLIF(k.tinh, ''), '')",
};
const TOC_DO_MOC = ["tn", "vp", "ql", "kt"] as const;
type TocDoMoc = (typeof TOC_DO_MOC)[number];

app.get("/bao-cao/toc-do-xu-ly", requireRole("CSKH", "TN CSKH", "QL", "Admin", "Viewer"), async (c) => {
  const todayVN = nowVN().slice(0, 10);
  const kyRaw = c.req.query("ky") ?? "thang";
  const ky: TocDoKy = kyRaw === "ngay" || kyRaw === "tuan" ? kyRaw : "thang";
  const phanLoaiRaw = c.req.query("phan_loai") ?? "";
  const phanLoai = phanLoaiRaw in TOC_DO_PHAN_LOAI ? phanLoaiRaw : "";
  let tuNgay = c.req.query("tu_ngay");
  let denNgay = c.req.query("den_ngay");
  if (!denNgay || !DATE_RE.test(denNgay)) denNgay = todayVN;
  if (!tuNgay || !DATE_RE.test(tuNgay)) tuNgay = addDaysISO(denNgay, -(TOC_DO_KY[ky] - 1));
  if (denNgay < tuNgay) { const t = tuNgay; tuNgay = denNgay; denNgay = t; }
  if (addDaysISO(tuNgay, TOC_DO_KY[ky] - 1) < denNgay) tuNgay = addDaysISO(denNgay, -(TOC_DO_KY[ky] - 1));

  const kyExpr = (col: string) =>
    ky === "ngay" ? `substr(${col}, 1, 10)` : ky === "tuan" ? `date(${col}, '-6 days', 'weekday 1')` : `substr(${col}, 1, 7)`;
  const grpExpr = phanLoai ? TOC_DO_PHAN_LOAI[phanLoai] : "''";
  const rangeStart = `${tuNgay} 00:00:00`;
  const rangeEndBind = `${denNgay} 00:00:00`;
  const trongKhoang = (col: string) => `${col} >= ?1 AND ${col} < datetime(?2, '+1 day')`;
  const mocSql = (moc: TocDoMoc, col: string) =>
    `SELECT '${moc}' as moc, ${kyExpr(col)} as ky, grp, COUNT(*) as sl, AVG(julianday(${col}) - julianday(t0)) as tb_ngay
     FROM m WHERE ${trongKhoang(col)} GROUP BY 2, 3`;

  const sql = `
    WITH m AS (
      SELECT k.ngay_tiep_nhan as t0, ${grpExpr} as grp,
        (SELECT MIN(l.thoi_diem) FROM khieu_nai_lich_su l WHERE l.khieu_nai_id = k.id AND l.hanh_dong = 'tiep_nhan') as t_tn,
        CASE WHEN k.loi_nha_san_xuat != 'Chua danh gia' AND k.loi_lap_dat != 'Chua danh gia'
               AND k.loi_thai_do_ktv != 'Chua danh gia' AND k.loi_quy_trinh_nskx != 'Chua danh gia'
               AND COALESCE(k.ket_luan_khieu_nai, 'Chua danh gia') != 'Chua danh gia'
             THEN (SELECT MAX(l.thoi_diem) FROM khieu_nai_lich_su l WHERE l.khieu_nai_id = k.id AND l.hanh_dong = 'danh_gia_loi')
        END as t_vp,
        COALESCE((SELECT MIN(l.thoi_diem) FROM khieu_nai_lich_su l WHERE l.khieu_nai_id = k.id AND l.hanh_dong = 'danh_gia_ql'),
                 k.ngay_ql_danh_gia) as t_ql,
        CASE WHEN k.trang_thai = 'Da ket thuc' THEN k.ngay_ket_thuc END as t_kt
      FROM khieu_nai k
      WHERE k.trang_thai != 'Huy' AND k.ngay_tiep_nhan < datetime(?2, '+1 day')
        AND (k.trang_thai != 'Da ket thuc' OR k.ngay_ket_thuc >= ?1)
    )
    ${mocSql("tn", "t_tn")}
    UNION ALL ${mocSql("vp", "t_vp")}
    UNION ALL ${mocSql("ql", "t_ql")}
    UNION ALL ${mocSql("kt", "t_kt")}`;

  const [aggQ, usersQ] = await Promise.all([
    c.env.DB.prepare(sql).bind(rangeStart, rangeEndBind)
      .all<{ moc: TocDoMoc; ky: string; grp: string; sl: number; tb_ngay: number | null }>(),
    phanLoai === "nguoi_tiep_nhan"
      ? c.env.DB.prepare("SELECT email, ten FROM users").all<{ email: string; ten: string | null }>()
      : Promise.resolve({ results: [] as { email: string; ten: string | null }[] }),
  ]);
  const tenMap = new Map(usersQ.results.map((u) => [u.email, u.ten]));

  type Cell = { sl: number; tb_gio: number | null };
  type Acc = Record<TocDoMoc, { sl: number; tong: number }>;
  const newAcc = (): Acc => ({ tn: { sl: 0, tong: 0 }, vp: { sl: 0, tong: 0 }, ql: { sl: 0, tong: 0 }, kt: { sl: 0, tong: 0 } });
  const add = (a: Acc, moc: TocDoMoc, sl: number, tbNgay: number | null) => {
    if (tbNgay == null) return;
    a[moc].sl += sl; a[moc].tong += tbNgay * sl;
  };
  const out = (a: Acc): Record<TocDoMoc, Cell> => {
    const r = {} as Record<TocDoMoc, Cell>;
    for (const m of TOC_DO_MOC) r[m] = { sl: a[m].sl, tb_gio: a[m].sl > 0 ? gio1(a[m].tong / a[m].sl) : null };
    return r;
  };

  const kyMap = new Map<string, { tong: Acc; nhom: Map<string, Acc> }>();
  const toanKy = newAcc();
  for (const r of aggQ.results) {
    let k = kyMap.get(r.ky);
    if (!k) { k = { tong: newAcc(), nhom: new Map() }; kyMap.set(r.ky, k); }
    add(k.tong, r.moc, r.sl, r.tb_ngay);
    add(toanKy, r.moc, r.sl, r.tb_ngay);
    if (phanLoai) {
      let g = k.nhom.get(r.grp);
      if (!g) { g = newAcc(); k.nhom.set(r.grp, g); }
      add(g, r.moc, r.sl, r.tb_ngay);
    }
  }

  const nhan = (grp: string) => (phanLoai === "nguoi_tiep_nhan" ? (grp ? tenMap.get(grp) || grp : "(Chưa có người tiếp nhận)") : grp || "(Chưa có)");
  const rows = [...kyMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([kyKey, v]) => ({
      ky: kyKey,
      ...out(v.tong),
      nhom: [...v.nhom.entries()]
        .map(([grp, acc]) => ({ key: grp, nhan: nhan(grp), ...out(acc) }))
        .sort((a, b) => (b.kt.sl + b.tn.sl) - (a.kt.sl + a.tn.sl) || a.nhan.localeCompare(b.nhan, "vi")),
    }));

  return c.json({ tu_ngay: tuNgay, den_ngay: denNgay, ky, phan_loai: phanLoai, tong: out(toanKy), rows });
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
  const [khieuNai, tienTrinh, lichSu, dinhKem] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first<
      { nguoi_tao: string | null } & RelatedSeed
    >(),
    c.env.DB.prepare("SELECT * FROM khieu_nai_tien_trinh WHERE khieu_nai_id = ? ORDER BY ngay_tao DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM khieu_nai_lich_su WHERE khieu_nai_id = ? ORDER BY thoi_diem DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM khieu_nai_dinh_kem WHERE khieu_nai_id = ? ORDER BY ngay_tao").bind(id).all(),
  ]);
  if (!khieuNai) return c.json({ error: "NOT_FOUND" }, 404);
  // NV Sale/Tong dai vien (KTV cu) chi xem duoc phan anh do chinh minh tao (item 12), kem chan truy cap thang qua ID.
  if (chiThayCaCuaMinh(user) && khieuNai.nguoi_tao !== user.email) return c.json({ error: "FORBIDDEN" }, 403);
  const giaiTrinhDeadline = await getGiaiTrinhStatus(c.env.DB, id);
  const related = await getRelatedComplaints(c.env.DB, id, khieuNai, chiThayCaCuaMinh(user) ? user.email : null);
  return c.json({
    khieuNai, tienTrinh: tienTrinh.results, lichSu: lichSu.results, dinhKem: dinhKem.results, giaiTrinhDeadline, related,
  });
});

// ---------- Anh/video dinh kem (2026-09) ----------
// Toi da 5 anh + 3 video/1 khieu nai (chan lai server-side, khong chi tin client). Anh da duoc nen
// o client (canvas resize + JPEG quality) nen cap nho; video KHONG nen that o client (chi gioi han
// dung luong/thoi luong) nen cap lon hon nhieu.
const DINH_KEM_MAX_ANH = 5;
const DINH_KEM_MAX_VIDEO = 3;
const DINH_KEM_MAX_BYTES: Record<string, number> = { anh: 8 * 1024 * 1024, video: 80 * 1024 * 1024 };
const DINH_KEM_ROLES = ["NV Sale", "Tổng đài viên", "CSKH", "TN CSKH", "QL", "Admin"] as const;

app.post("/:id/dinh-kem", requireRole(...DINH_KEM_ROLES), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT nguoi_tao FROM khieu_nai WHERE id = ?").bind(id).first<{ nguoi_tao: string | null }>();
  if (!exists) return c.json({ error: "NOT_FOUND" }, 404);
  if (chiXemCaNguoiKhac(user, exists.nguoi_tao)) return c.json({ error: "FORBIDDEN" }, 403);

  const form = await c.req.formData();
  const fileRaw = form.get("file");
  const loai = form.get("loai");
  if (!fileRaw || typeof fileRaw === "string" || (loai !== "anh" && loai !== "video")) {
    return c.json({ error: "INVALID_INPUT" }, 400);
  }
  const file = fileRaw as unknown as { size: number; type: string; name: string; arrayBuffer(): Promise<ArrayBuffer> };
  if (file.size > DINH_KEM_MAX_BYTES[loai]) return c.json({ error: "FILE_TOO_LARGE" }, 413);

  const { count } = (await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM khieu_nai_dinh_kem WHERE khieu_nai_id = ? AND loai = ?",
  ).bind(id, loai).first<{ count: number }>()) ?? { count: 0 };
  const max = loai === "anh" ? DINH_KEM_MAX_ANH : DINH_KEM_MAX_VIDEO;
  if (count >= max) return c.json({ error: "LIMIT_REACHED", max }, 409);

  let uploaded: { driveFileId: string; url: string };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    uploaded = await uploadPublicFile(c.env, c.env.DB, bytes, file.type || "application/octet-stream", file.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("DRIVE_NOT_CONNECTED")) return c.json({ error: "DRIVE_NOT_CONNECTED" }, 503);
    console.error("Loi upload Google Drive:", msg);
    return c.json({ error: "DRIVE_UPLOAD_FAILED" }, 502);
  }

  const dinhKemId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO khieu_nai_dinh_kem (id, khieu_nai_id, loai, url, drive_file_id, ten_file, nguoi_tao) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(dinhKemId, id, loai, uploaded.url, uploaded.driveFileId, file.name, user.email).run();

  const created = await c.env.DB.prepare("SELECT * FROM khieu_nai_dinh_kem WHERE id = ?").bind(dinhKemId).first();
  return c.json({ dinhKem: created }, 201);
});

app.delete("/:id/dinh-kem/:dinhKemId", requireRole(...DINH_KEM_ROLES), async (c) => {
  const id = c.req.param("id");
  const dinhKemId = c.req.param("dinhKemId");
  const row = await c.env.DB.prepare(
    `SELECT d.drive_file_id, k.nguoi_tao FROM khieu_nai_dinh_kem d JOIN khieu_nai k ON k.id = d.khieu_nai_id
     WHERE d.id = ? AND d.khieu_nai_id = ?`,
  ).bind(dinhKemId, id).first<{ drive_file_id: string; nguoi_tao: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (chiXemCaNguoiKhac(c.get("user"), row.nguoi_tao)) return c.json({ error: "FORBIDDEN" }, 403);

  try {
    await deletePublicFile(c.env, c.env.DB, row.drive_file_id);
  } catch (err) {
    console.error("Loi xoa file Google Drive:", err instanceof Error ? err.message : String(err));
    // Khong chan xoa dong DB neu Drive loi (vd token het han) - tranh ket dinh kem "ma" mai khong xoa duoc.
  }
  await c.env.DB.prepare("DELETE FROM khieu_nai_dinh_kem WHERE id = ?").bind(dinhKemId).run();
  return c.json({ ok: true });
});

// H1: gan / go nguoi phu trach ca.
app.post("/:id/phu-trach", requireRole("CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const target = body.email === null ? null : typeof body.email === "string" && body.email ? body.email : user.email;

  const row = await c.env.DB.prepare("SELECT trang_thai, nguoi_phu_trach, nguoi_tao FROM khieu_nai WHERE id = ?")
    .bind(id).first<{ trang_thai: string; nguoi_phu_trach: string | null; nguoi_tao: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (chiXemCaNguoiKhac(user, row.nguoi_tao)) return c.json({ error: "FORBIDDEN" }, 403);
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
  // Ten tinh viet sai dau ("Dak nông") -> ten chuan trong danh muc ("Đắk Nông").
  if (body.tinh) body.tinh = await chuanHoaTinh(c.env.DB, "tinh", body.tinh);
  if (body.tinh_moi) body.tinh_moi = await chuanHoaTinh(c.env.DB, "tinh_moi", body.tinh_moi);
  const ts = nowVN();
  // CSKH/TN CSKH/QL/Admin tu tao phan anh thi coi nhu da tiep nhan luon (ca 3 vai tro nay deu co
  // quyen tu tiep nhan tu 2026-09); rieng NV Sale/Tong dai vien tao ho khach hang -> phai cho
  // CSKH/TN CSKH/QL bam "Tiep nhan" (POST /:id/tiep-nhan) truoc khi phan anh duoc phep sua/cap nhat.
  const autoReceived =
    user.vai_tro === "CSKH" || user.vai_tro === "TN CSKH" || user.vai_tro === "QL" || user.vai_tro === "Admin";

  let crmFields: CrmFields | null = null;
  let crm_sync_warning: string | undefined;
  let crmTraCuu: "OK" | "SAI_ID" | null = null;
  if (body.id_crm_karofi) {
    const lookup = await tryLookupCrm(c.env, body.id_crm_karofi);
    crmFields = lookup.fields;
    crm_sync_warning = lookup.warning;
    crmTraCuu = crmTraCuuFrom(lookup);
  }

  // Ngay tiep nhan: mac dinh bay gio; neu nguoi tao chon ngay (yyyy-mm-dd) thi giu gio hien tai.
  const ngayTiepNhan =
    typeof body.ngay_tiep_nhan === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.ngay_tiep_nhan)
      ? `${body.ngay_tiep_nhan}${ts.slice(10)}`
      : ts;

  const columnsBase: Record<string, unknown> = {
    ten_khach: body.ten_khach ?? null,
    sdt_khach: body.sdt_khach ?? null,
    id_lada: body.id_lada ?? null,
    id_truy_van: body.id_truy_van ?? null,
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
    nguon: body.nguon ?? null,
    trang_thai: autoReceived ? "Dang xu ly" : "Cho tiep nhan",
    nguoi_tao: user.email,
    cskh_tiep_nhan: autoReceived ? user.email : null,
    nguoi_phu_trach: autoReceived ? user.email : null,
    ngay_tiep_nhan: ngayTiepNhan,
    ngay_thay_doi: ts,
    crm_tra_cuu: crmTraCuu,
    ...(crmFields ?? {}),
  };

  // Sinh id kem retry: id dua tren dem-theo-ngay (khong atomic voi INSERT) nen 2 request tao
  // don gan nhu dong thoi co the sinh trung id - thu lai vai lan khi INSERT bao loi UNIQUE.
  let id = "";
  const MAX_ID_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ID_ATTEMPTS; attempt++) {
    id = await generateId(c.env.DB);
    const columns: Record<string, unknown> = { id, ...columnsBase };
    const cols = Object.keys(columns);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map((k) => columns[k]);
    try {
      await c.env.DB.prepare(`INSERT INTO khieu_nai (${cols.join(", ")}) VALUES (${placeholders})`).bind(...values).run();
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_ID_ATTEMPTS || !/UNIQUE/i.test(msg)) throw err;
    }
  }
  await logLichSu(c.env.DB, id, user.email, "tao_moi", null, null, null);

  if (!autoReceived) {
    const ten = typeof body.ten_khach === "string" && body.ten_khach ? body.ten_khach : "Khách hàng";
    c.executionCtx.waitUntil(
      notifyRoles(c.env, "cho_tiep_nhan", `${id} — ${ten} cần tiếp nhận`, id, ["CSKH", "TN CSKH", "QL"]),
    );
  }

  const created = await c.env.DB.prepare("SELECT * FROM khieu_nai WHERE id = ?").bind(id).first();
  return c.json({ khieuNai: created, crm_sync_warning }, 201);
});

// CSKH/TN CSKH/QL bam "Tiep nhan" cho cac phan anh do NV Sale/Tong dai vien tao ho khach hang - day
// la dieu kien bat buoc de mo khoa sua/cap nhat phan anh (yeu cau nghiep vu 2026-09). TN CSKH/QL duoc
// mo rong tu tiep nhan duoc ca cua chinh minh tu 2026-09 (full quyen nhu CSKH).
app.post("/:id/tiep-nhan", requireRole("CSKH", "TN CSKH", "QL", "Admin"), async (c) => {
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
    // TN CSKH: full quyen nhu CSKH + danh gia loi/dong ca (yeu cau ra soat vai tro 2026-09).
    if (user.vai_tro === "TN CSKH") [...CSKH_FIELDS, ...TN_CSKH_FIELDS, ...DOI_MAY_FIELDS].forEach((f) => allowed.add(f));
    // QL: full quyen nhu TN CSKH + rieng QL_FIELDS (danh gia QL / chot cuoi).
    if (user.vai_tro === "QL") [...CSKH_FIELDS, ...TN_CSKH_FIELDS, ...DOI_MAY_FIELDS, ...QL_FIELDS].forEach((f) => allowed.add(f));
  }

  const bodyKeys = Object.keys(body);
  if (body.tinh) body.tinh = await chuanHoaTinh(c.env.DB, "tinh", body.tinh);
  if (body.tinh_moi) body.tinh_moi = await chuanHoaTinh(c.env.DB, "tinh_moi", body.tinh_moi);
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

  // Khoa "qua han giai trinh" CHI ap dung khi sua truong danh gia loi/QL (TN_CSKH_FIELDS/QL_FIELDS) -
  // day la muc dich that su cua khoa nay (bat giai trinh ly do cham TRUOC KHI danh gia/chot tiep).
  // Sua thong tin don goc (CSKH_FIELDS, vd sua so dien thoai go nham) khong lien quan toi tien do xu
  // ly nen KHONG bi chan boi khoa nay - cho phep CSKH/TN CSKH sua truoc khi don duoc chot ket thuc
  // (yeu cau ra soat 2026-09-21), van ghi log nhu binh thuong o duoi.
  const touchesEvaluation = bodyKeys.some((k) => (TN_CSKH_FIELDS as readonly string[]).includes(k) || (QL_FIELDS as readonly string[]).includes(k));
  if (touchesEvaluation) {
    const giaiTrinhStatus = await getGiaiTrinhStatus(c.env.DB, id!);
    if (giaiTrinhStatus?.overdue) return c.json({ error: "QUA_HAN_GIAI_TRINH", deadline: giaiTrinhStatus.deadline }, 423);
  }

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
      if (!body.id_crm_karofi) {
        sets.push("crm_tra_cuu = NULL");
      } else if (body.id_crm_karofi !== cur.id_crm_karofi) {
        const lookup = await tryLookupCrm(c.env, body.id_crm_karofi);
        crm_sync_warning = lookup.warning;
        sets.push("crm_tra_cuu = ?");
        binds.push(crmTraCuuFrom(lookup));
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

app.post("/:id/dong-ca", requireRole("TN CSKH", "QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT trang_thai, ten_khach, loi_nha_san_xuat, loi_lap_dat, loi_thai_do_ktv, loi_quy_trinh_nskx, ket_luan_khieu_nai FROM khieu_nai WHERE id = ?",
  ).bind(id).first<{
    trang_thai: string; ten_khach: string | null; loi_nha_san_xuat: string; loi_lap_dat: string; loi_thai_do_ktv: string;
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

  c.executionCtx.waitUntil(
    notifyRoles(c.env, "cho_chot", `${id} — ${row.ten_khach ?? "Khách hàng"} chờ chốt kết thúc`, id!, ["QL"]),
  );

  return c.json({ ok: true });
});

// QL/Admin duoc chot thang tu "Dang xu ly" (bo qua buoc "Dong ca" cua TN CSKH - yeu cau ra soat
// 2026-09): khi do phai tu kiem tra du 4 loi + ket luan (dieu kien von do "Dong ca" dam nhan) va
// tu dat ngay_ket_thuc/nguoi_ket_thuc luon (vi khong con di qua route "Dong ca" de dat cac truong nay).
app.post("/:id/chot", requireRole("QL", "Admin"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT trang_thai, danh_gia_ql, ngay_tiep_nhan, ngay_ket_thuc,
            loi_nha_san_xuat, loi_lap_dat, loi_thai_do_ktv, loi_quy_trinh_nskx, ket_luan_khieu_nai
     FROM khieu_nai WHERE id = ?`,
  ).bind(id).first<{
    trang_thai: string; danh_gia_ql: string | null; ngay_tiep_nhan: string; ngay_ket_thuc: string | null;
    loi_nha_san_xuat: string; loi_lap_dat: string; loi_thai_do_ktv: string; loi_quy_trinh_nskx: string;
    ket_luan_khieu_nai: string | null;
  }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const direct = row.trang_thai === "Dang xu ly";
  if (!direct && row.trang_thai !== "Cho chot ket thuc") return c.json({ error: "INVALID_STATE" }, 400);

  const giaiTrinhStatus = await getGiaiTrinhStatus(c.env.DB, id!);
  if (giaiTrinhStatus?.overdue) return c.json({ error: "QUA_HAN_GIAI_TRINH", deadline: giaiTrinhStatus.deadline }, 423);

  if (direct) {
    const fields = [row.loi_nha_san_xuat, row.loi_lap_dat, row.loi_thai_do_ktv, row.loi_quy_trinh_nskx, row.ket_luan_khieu_nai];
    if (fields.some((f) => f === "Chua danh gia" || f === null || f === undefined)) {
      return c.json({ error: "CAN_DANH_GIA_DAY_DU" }, 400);
    }
  }

  // Tien dieu kien: phai co Danh gia QL truoc khi chot (doi xung voi "Dong ca" doi du 4 loi).
  if (!row.danh_gia_ql || row.danh_gia_ql.trim() === "") return c.json({ error: "CAN_DANH_GIA_QL" }, 400);

  const user = c.get("user");
  const ts = nowVN();
  const ngayKetThuc = direct ? ts : row.ngay_ket_thuc;
  const gio = gioXuLyHeThong(row.ngay_tiep_nhan, ngayKetThuc);
  await c.env.DB.prepare(
    direct
      ? "UPDATE khieu_nai SET trang_thai = 'Da ket thuc', ngay_ket_thuc = ?, nguoi_ket_thuc = ?, ql_nguoi_danh_gia = ?, ngay_ql_danh_gia = ?, ql_gio_xu_ly_he_thong = ?, ngay_thay_doi = ? WHERE id = ?"
      : "UPDATE khieu_nai SET trang_thai = 'Da ket thuc', ql_nguoi_danh_gia = ?, ngay_ql_danh_gia = ?, ql_gio_xu_ly_he_thong = ?, ngay_thay_doi = ? WHERE id = ?",
  ).bind(
    ...(direct ? [ts, user.email, user.email, ts, gio, ts, id] : [user.email, ts, gio, ts, id]),
  ).run();
  await logLichSu(c.env.DB, id!, user.email, "chuyen_trang_thai", "trang_thai", row.trang_thai, "Da ket thuc");

  return c.json({ ok: true });
});

const DANH_GIA_QL_MAC_DINH = "Đã hoàn thành";
const DONG_CA_HANG_LOAT_MAX = 100; // = pageSize toi da; D1 gioi han 100 tham so/cau lenh (IN (...))

// Dong ca hang loat (QL/Admin, yeu cau 2026-09-23 - thay "chot hang loat" cu):
//  - "San sang dong ca" (Dang xu ly + du 4 loi + ket luan): Danh gia QL = "Da hoan thanh" (giu nguyen
//    neu QL da tu chon 1 danh gia khac truoc do) -> "Da ket thuc" thang, nhu "/:id/chot" di thang.
//  - "Cho chot ket thuc" DA co Danh gia QL: chot nhu cu.
// Doc gop 2 truy van + ghi gop 1 batch (khong lap tung id -> khong vuot gioi han so truy van D1/lan goi).
// Loi 1 id khong lam hong cac id con lai (tra ket qua tung id).
app.post("/dong-ca-hang-loat", requireRole("QL", "Admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const ids: string[] = Array.isArray(body.ids)
    ? [...new Set<string>(body.ids.filter((x: unknown): x is string => typeof x === "string"))]
    : [];
  if (ids.length === 0) return c.json({ error: "CAN_DANH_SACH_ID" }, 400);
  if (ids.length > DONG_CA_HANG_LOAT_MAX) return c.json({ error: "QUA_NHIEU_ID", max: DONG_CA_HANG_LOAT_MAX }, 400);

  const ph = ids.map(() => "?").join(",");
  const [rowsRes, mocRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, trang_thai, danh_gia_ql, ngay_tiep_nhan, ngay_ket_thuc,
              loi_nha_san_xuat, loi_lap_dat, loi_thai_do_ktv, loi_quy_trinh_nskx, ket_luan_khieu_nai
       FROM khieu_nai WHERE id IN (${ph})`,
    ).bind(...ids).all<{
      id: string; trang_thai: string; danh_gia_ql: string | null; ngay_tiep_nhan: string; ngay_ket_thuc: string | null;
      loi_nha_san_xuat: string; loi_lap_dat: string; loi_thai_do_ktv: string; loi_quy_trinh_nskx: string;
      ket_luan_khieu_nai: string | null;
    }>(),
    c.env.DB.prepare(
      `SELECT khieu_nai_id, MAX(ngay_tao) AS moc FROM khieu_nai_tien_trinh
       WHERE ly_do_xu_ly_cham IS NOT NULL AND khieu_nai_id IN (${ph}) GROUP BY khieu_nai_id`,
    ).bind(...ids).all<{ khieu_nai_id: string; moc: string }>(),
  ]);
  const rowById = new Map(rowsRes.results.map((r) => [r.id, r]));
  const mocById = new Map(mocRes.results.map((m) => [m.khieu_nai_id, m.moc]));

  const user = c.get("user");
  const ts = nowVN();
  const results: { id: string; ok: boolean; error?: string }[] = [];
  const stmts: D1PreparedStatement[] = [];
  const updateIdx: { id: string; stmt: number }[] = [];
  // Log chi ghi khi cau lenh NGAY TRUOC thuc su doi 1 dong (changes() = 1) - neu ca vua bi nguoi khac
  // doi trang thai giua luc doc va ghi thi UPDATE (co dieu kien trang_thai) khong doi gi, khong log sai.
  const logStmt = (id: string, hanhDong: string, truong: string, cu: string | null, moi: string) =>
    c.env.DB.prepare(
      `INSERT INTO khieu_nai_lich_su (id, khieu_nai_id, nguoi, hanh_dong, truong, gia_tri_cu, gia_tri_moi)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(crypto.randomUUID(), id, user.email, hanhDong, truong, cu, moi);

  for (const id of ids) {
    const row = rowById.get(id);
    if (!row) { results.push({ id, ok: false, error: "NOT_FOUND" }); continue; }
    const direct = row.trang_thai === "Dang xu ly";
    if (!direct && row.trang_thai !== "Cho chot ket thuc") { results.push({ id, ok: false, error: "INVALID_STATE" }); continue; }
    if (giaiTrinhStatusFrom(mocById.get(id) ?? row.ngay_tiep_nhan).overdue) {
      results.push({ id, ok: false, error: "QUA_HAN_GIAI_TRINH" });
      continue;
    }
    const danhGiaCu = row.danh_gia_ql?.trim() || null;

    if (direct) {
      const fields = [row.loi_nha_san_xuat, row.loi_lap_dat, row.loi_thai_do_ktv, row.loi_quy_trinh_nskx, row.ket_luan_khieu_nai];
      if (fields.some((f) => f === "Chua danh gia" || f == null)) { results.push({ id, ok: false, error: "CAN_DANH_GIA_DAY_DU" }); continue; }
      const danhGia = danhGiaCu ?? DANH_GIA_QL_MAC_DINH;
      updateIdx.push({ id, stmt: stmts.length });
      stmts.push(
        c.env.DB.prepare(
          `UPDATE khieu_nai SET trang_thai = 'Da ket thuc', danh_gia_ql = ?, ngay_ket_thuc = ?, nguoi_ket_thuc = ?,
                  ql_nguoi_danh_gia = ?, ngay_ql_danh_gia = ?, ql_gio_xu_ly_he_thong = ?, ngay_thay_doi = ?
           WHERE id = ? AND trang_thai = 'Dang xu ly'`,
        ).bind(danhGia, ts, user.email, user.email, ts, gioXuLyHeThong(row.ngay_tiep_nhan, ts), ts, id),
      );
      if (!danhGiaCu) stmts.push(logStmt(id, "danh_gia_ql", "danh_gia_ql", null, danhGia));
      stmts.push(logStmt(id, "chuyen_trang_thai", "trang_thai", "Dang xu ly", "Da ket thuc"));
    } else {
      if (!danhGiaCu) { results.push({ id, ok: false, error: "CAN_DANH_GIA_QL" }); continue; }
      updateIdx.push({ id, stmt: stmts.length });
      stmts.push(
        c.env.DB.prepare(
          `UPDATE khieu_nai SET trang_thai = 'Da ket thuc', ql_nguoi_danh_gia = ?, ngay_ql_danh_gia = ?,
                  ql_gio_xu_ly_he_thong = ?, ngay_thay_doi = ?
           WHERE id = ? AND trang_thai = 'Cho chot ket thuc'`,
        ).bind(user.email, ts, gioXuLyHeThong(row.ngay_tiep_nhan, row.ngay_ket_thuc), ts, id),
      );
      stmts.push(logStmt(id, "chuyen_trang_thai", "trang_thai", "Cho chot ket thuc", "Da ket thuc"));
    }
  }

  if (stmts.length > 0) {
    const out = await c.env.DB.batch(stmts);
    for (const u of updateIdx) {
      const changed = (out[u.stmt]?.meta.changes ?? 0) === 1;
      results.push(changed ? { id: u.id, ok: true } : { id: u.id, ok: false, error: "INVALID_STATE" });
    }
  }

  return c.json({ results });
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
  if (row.trang_thai === "Da ket thuc" || row.trang_thai === "Huy") return c.json({ error: "INVALID_STATE" }, 400);

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
    "SELECT id_crm_karofi, trang_thai, crm_last_sync_at, nguoi_tao FROM khieu_nai WHERE id = ?",
  ).bind(id).first<{ id_crm_karofi: string | null; trang_thai: string; crm_last_sync_at: string | null; nguoi_tao: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (chiXemCaNguoiKhac(c.get("user"), row.nguoi_tao)) return c.json({ error: "FORBIDDEN" }, 403);
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
  if (!lookup.fields) {
    if (crmTraCuuFrom(lookup) === "SAI_ID") {
      await c.env.DB.prepare("UPDATE khieu_nai SET crm_tra_cuu = 'SAI_ID' WHERE id = ?").bind(id).run();
    }
    return c.json({ error: lookup.warning ?? "DVBH_LOOKUP_FAILED" }, 502);
  }

  await crmUpdateStmt(c.env.DB, id!, lookup.fields, ts).run();

  return c.json({ ok: true });
});

// Moi lan bam dong bo toi da 40 ca: uu tien ca chua tra cuu lan nao / dong bo lau nhat, ca "ID CRM
// sai" xep sau cung - bam nhieu lan se lan luot quet het, khong bi ket mai 1 nhom ca dau danh sach.
const DONG_BO_TON_MAX = 40;

app.post("/dong-bo-cac-ca-ton", requireRole("QL", "Admin"), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, id_crm_karofi FROM khieu_nai WHERE ${TON_CRM_SQL}
     ORDER BY (crm_tra_cuu = 'SAI_ID'), crm_last_sync_at IS NOT NULL, crm_last_sync_at ASC LIMIT ?`,
  ).bind(DONG_BO_TON_MAX).all<{ id: string; id_crm_karofi: string }>();

  const results: { id: string; ok: boolean; error?: string }[] = [];
  const stmts: D1PreparedStatement[] = [];
  const ts = nowVN();

  for (const row of rows.results) {
    const lookup = await tryLookupCrm(c.env, row.id_crm_karofi);
    const traCuu = crmTraCuuFrom(lookup);
    // Loi mang/API (traCuu null) -> giu nguyen crm_tra_cuu cu, chi ghi moc da thu dong bo.
    stmts.push(
      c.env.DB.prepare("UPDATE khieu_nai SET crm_last_sync_at = ?, crm_tra_cuu = COALESCE(?, crm_tra_cuu) WHERE id = ?")
        .bind(ts, traCuu, row.id),
    );
    if (lookup.fields) {
      stmts.push(crmUpdateStmt(c.env.DB, row.id, lookup.fields, ts));
      results.push({ id: row.id, ok: true });
    } else {
      results.push({ id: row.id, ok: false, error: lookup.warning ?? "DVBH_LOOKUP_FAILED" });
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  // Ghi 1 lan (1 subrequest D1) thay vi 2 cau UPDATE moi ca.
  if (stmts.length > 0) await c.env.DB.batch(stmts);

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
