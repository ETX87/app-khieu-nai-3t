-- Danh sach Phan anh khi KHONG loc gi (view mac dinh "Tat ca") truoc day ORDER BY ngay_tiep_nhan
-- + COUNT(*) khong gioi han deu quet toan bang - cang ve sau (nhieu nam, nhieu du lieu) cang ton
-- rows_read D1 moi lan mo trang. Doi sang: ca "ton" (chua Da ket thuc/Huy) luon len truoc, sap xep
-- theo ngay tiep nhan moi nhat; tong so chi dem "ca ton" (re, bi chan boi so ca dang xu ly - khong
-- phinh to theo lich su) thay vi dem het ca da dong/huy (2026-09-21).
-- Bieu thuc trong index PHAI khop y het bieu thuc dung trong ORDER BY o khieuNai.ts (route GET "/")
-- de SQLite nhan ra va dung index, khong quet toan bang.
CREATE INDEX IF NOT EXISTS idx_kn_ton_uu_tien ON khieu_nai (
  (CASE WHEN trang_thai NOT IN ('Da ket thuc','Huy') THEN 1 ELSE 0 END) DESC,
  ngay_tiep_nhan DESC
);
