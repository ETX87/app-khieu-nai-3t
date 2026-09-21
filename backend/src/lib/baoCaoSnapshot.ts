import { nowVN } from "./vnTime";

// Chup nhanh ton dong 1 lan/ngay (goi tu cron 20h - backend/src/index.ts). Dung 2 truy van rieng
// tren cot "trang_thai" (co index idx_kn_trang_thai) thay vi 1 aggregate quet ca bang khieu_nai -
// "con ton" luon la tap con bi chan tren (khong phu thuoc tong lich su), nen cach nay re du sau
// nhieu nam du lieu tich luy.
export async function writeDailySnapshot(db: D1Database): Promise<void> {
  const today = nowVN().slice(0, 10);
  const [choTiepNhan, conTon] = await Promise.all([
    db.prepare("SELECT COUNT(*) as n FROM khieu_nai WHERE trang_thai = 'Cho tiep nhan'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) as n FROM khieu_nai WHERE trang_thai NOT IN ('Da ket thuc', 'Huy')").first<{ n: number }>(),
  ]);
  await db
    .prepare(
      `INSERT INTO bao_cao_ngay_snapshot (ngay, cho_tiep_nhan, con_ton) VALUES (?, ?, ?)
       ON CONFLICT(ngay) DO UPDATE SET cho_tiep_nhan = excluded.cho_tiep_nhan, con_ton = excluded.con_ton`,
    )
    .bind(today, choTiepNhan?.n ?? 0, conTon?.n ?? 0)
    .run();
}
