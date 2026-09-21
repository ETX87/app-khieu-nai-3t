import type { Env } from "../types";
import { fetchEtxNhanSuAll, type EtxNhanSuItem } from "./etxNhanSuClient";
import { nowVN } from "./vnTime";

// Dong bo (PULL, 1 chieu tu ETX ve) danh ba etx_nhan_su - chay 1 lan/ngay luc 3h sang gio VN qua cron
// (xem index.ts scheduled()) hoac bam tay qua routes/etxNhanSuSync.ts. Full-refresh moi lan (doi tac
// khong ho tro tham so "since") nen DIFF tai day - CHI ghi dong nao THUC SU khac, giong tinh than
// gia88Sync.ts/linh-kien-app. Khac linh-kien-app: KHONG co bang trung gian ktv_lien_he/ma_ktv - khop
// tai khoan users TRUC TIEP theo gmail (App Khieu Nai chi co 1 bang users, email = PK).
//
// 2 cascade tu dong sang bang users khi gmail khop (yeu cau nghiep vu 2026-09-21):
//   1. trang_thai_lam_viec doi 'on'->'off' => khoa tai khoan (bi_khoa=1) neu dang hoat dong.
//      'off'->'on' => mo khoa (bi_khoa=0) neu dang bi khoa.
//   2. ho_ten doi => cap nhat luon users.ten (ten hien thi tren app luon lay theo ho so ETX, khong
//      phu thuoc ten Google profile luc dang nhap - xem thêm routes/auth.ts).
// Khong bao gio tu khoa NGUOI ADMIN DANG HOAT DONG CUOI CUNG - dung chung nguyen tac voi
// countActiveAdmins() trong routes/users.ts (chan PATCH thu cong lam mat Admin cuoi), ap dung ca cho
// cascade tu dong nay vi hau qua (khoa het duong vao Admin) giong het nhau du la ai bam nut.

interface EtxNhanSuRow {
  ma_nhan_su: string;
  ho_ten: string;
  chuc_danh: string | null;
  ma_chuc_danh: string | null;
  gmail: string | null;
  trang_thai_lam_viec: string;
  tai_khoan_lada_ma: string | null;
  tai_khoan_lada_ten: string | null;
  quan_ly_truc_tiep: string | null;
}

export interface EtxNhanSuSyncResult {
  changedCount: number;
  insertedCount: number;
  total: number;
}

const CHUNK_SIZE = 500;

function normalFieldsDiffer(existing: EtxNhanSuRow, item: EtxNhanSuItem, maChucDanhJson: string, quanLyTrucTiepJson: string): boolean {
  return (
    existing.ho_ten !== item.hoTen ||
    existing.chuc_danh !== item.chucDanh ||
    existing.ma_chuc_danh !== maChucDanhJson ||
    existing.gmail !== item.gmail ||
    existing.tai_khoan_lada_ma !== (item.taiKhoanLada?.maLada ?? null) ||
    existing.tai_khoan_lada_ten !== (item.taiKhoanLada?.tenLada ?? null) ||
    existing.quan_ly_truc_tiep !== quanLyTrucTiepJson
  );
}

async function runInChunks(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + CHUNK_SIZE));
  }
}

async function countActiveAdmins(db: D1Database): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE vai_tro = 'Admin' AND trang_thai_duyet = 'Da duyet' AND bi_khoa = 0")
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export async function runEtxNhanSuSync(env: Env, db: D1Database): Promise<EtxNhanSuSyncResult> {
  const items = await fetchEtxNhanSuAll(env);

  const { results: existingRows } = await db
    .prepare(
      "SELECT ma_nhan_su, ho_ten, chuc_danh, ma_chuc_danh, gmail, trang_thai_lam_viec, tai_khoan_lada_ma, tai_khoan_lada_ten, quan_ly_truc_tiep FROM etx_nhan_su",
    )
    .all<EtxNhanSuRow>();
  const existingMap = new Map(existingRows.map((r) => [r.ma_nhan_su, r]));

  // Doc san toan bo users (email + ten) 1 lan de doi chieu cascade ten - tranh N+1 truy van rieng cho
  // tung nhan su trong vong lap ben duoi (danh ba nhan su co the vai tram dong).
  const { results: userRows } = await db.prepare("SELECT email, ten FROM users").all<{ email: string; ten: string | null }>();
  const userTenMap = new Map(userRows.map((u) => [u.email.toLowerCase(), u.ten]));

  const now = nowVN();
  const writeStatements: D1PreparedStatement[] = [];
  const nameCascades: D1PreparedStatement[] = [];
  const statusToggles: { gmail: string; biKhoa: 0 | 1 }[] = [];
  let changedCount = 0;
  let insertedCount = 0;

  for (const item of items) {
    const ma = item.maNhanSu?.trim();
    if (!ma) continue;
    const maChucDanhJson = JSON.stringify(item.maChucDanh ?? []);
    const quanLyTrucTiepJson = JSON.stringify(item.quanLyTrucTiep ?? []);
    const existing = existingMap.get(ma);
    const gmail = item.gmail?.trim().toLowerCase() || null;

    if (!existing) {
      writeStatements.push(
        db
          .prepare(
            `INSERT INTO etx_nhan_su (ma_nhan_su, ho_ten, chuc_danh, ma_chuc_danh, gmail, trang_thai_lam_viec, tai_khoan_lada_ma, tai_khoan_lada_ten, quan_ly_truc_tiep, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            ma, item.hoTen, item.chucDanh, maChucDanhJson, item.gmail, item.trangThaiLamViec,
            item.taiKhoanLada?.maLada ?? null, item.taiKhoanLada?.tenLada ?? null, quanLyTrucTiepJson,
            now, now,
          ),
      );
      insertedCount++;
    } else {
      let rowChanged = false;
      if (normalFieldsDiffer(existing, item, maChucDanhJson, quanLyTrucTiepJson) || existing.trang_thai_lam_viec !== item.trangThaiLamViec) {
        writeStatements.push(
          db
            .prepare(
              `UPDATE etx_nhan_su SET ho_ten = ?, chuc_danh = ?, ma_chuc_danh = ?, gmail = ?, trang_thai_lam_viec = ?, tai_khoan_lada_ma = ?, tai_khoan_lada_ten = ?, quan_ly_truc_tiep = ?, updated_at = ? WHERE ma_nhan_su = ?`,
            )
            .bind(
              item.hoTen, item.chucDanh, maChucDanhJson, item.gmail, item.trangThaiLamViec,
              item.taiKhoanLada?.maLada ?? null, item.taiKhoanLada?.tenLada ?? null, quanLyTrucTiepJson,
              now, ma,
            ),
        );
        rowChanged = true;
      }
      if (rowChanged) changedCount++;

      // So sanh voi gia tri DANG LUU TRONG DB (khong phai tin hieu nao khac) - phat hien dung 1 lan
      // chuyen trang thai giua 2 lan dong bo.
      if (existing.trang_thai_lam_viec !== item.trangThaiLamViec && gmail) {
        statusToggles.push({ gmail, biKhoa: item.trangThaiLamViec === "off" ? 1 : 0 });
      }
    }

    if (gmail && userTenMap.has(gmail) && userTenMap.get(gmail) !== item.hoTen) {
      nameCascades.push(
        db.prepare("UPDATE users SET ten = ?, updated_at = ? WHERE LOWER(email) = ?").bind(item.hoTen, now, gmail),
      );
    }
  }

  if (writeStatements.length > 0) await runInChunks(db, writeStatements);
  if (nameCascades.length > 0) await runInChunks(db, nameCascades);

  for (const t of statusToggles) {
    if (t.biKhoa === 1) {
      const target = await db
        .prepare("SELECT vai_tro, trang_thai_duyet, bi_khoa FROM users WHERE LOWER(email) = ?")
        .bind(t.gmail)
        .first<{ vai_tro: string | null; trang_thai_duyet: string; bi_khoa: number }>();
      if (!target || target.bi_khoa) continue; // khong co tai khoan hoac da khoa san
      if (target.vai_tro === "Admin" && target.trang_thai_duyet === "Da duyet" && (await countActiveAdmins(db)) <= 1) {
        continue; // khong duoc khoa Admin dang hoat dong cuoi cung
      }
      await db.prepare("UPDATE users SET bi_khoa = 1, updated_at = ? WHERE LOWER(email) = ?").bind(now, t.gmail).run();
    } else {
      await db.prepare("UPDATE users SET bi_khoa = 0, updated_at = ? WHERE LOWER(email) = ? AND bi_khoa = 1").bind(now, t.gmail).run();
    }
  }

  return { changedCount, insertedCount, total: items.length };
}

// Wrapper dung boi CA cron (scheduled(), 1 lan/ngay) LAN nut "Dong bo ngay" thu cong
// (routes/etxNhanSuSync.ts) - boc try/catch de 1 lan loi (ETX down/sai key) khong lam crash cron, va
// LUON ghi lai etx_nhan_su_sync_state (thanh cong hay loi) de UI biet lan chay gan nhat the nao.
export async function runEtxNhanSuSyncWithState(env: Env, db: D1Database): Promise<void> {
  try {
    const result = await runEtxNhanSuSync(env, db);
    await db
      .prepare("UPDATE etx_nhan_su_sync_state SET last_run_at = ?, last_status = 'ok', changed_count = ?, last_error = NULL WHERE id = 1")
      .bind(nowVN(), result.changedCount + result.insertedCount)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .prepare("UPDATE etx_nhan_su_sync_state SET last_run_at = ?, last_status = 'error', last_error = ? WHERE id = 1")
      .bind(nowVN(), message.slice(0, 500))
      .run();
  }
}
