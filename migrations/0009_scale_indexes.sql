-- Du lieu du kien tang 10-20k dong/thang (item: chuan bi tu bay gio truoc khi so luong lon) -
-- bo sung index cho cac cot dang duoc loc/sap xep thuong xuyen nhung chua co index rieng
-- (list filters, sort theo cot, bao cao SLA/trung lap, filter "thang dong" moi, related-complaints).
CREATE INDEX IF NOT EXISTS idx_kn_nguoi_tao ON khieu_nai (nguoi_tao);
CREATE INDEX IF NOT EXISTS idx_kn_id_lada ON khieu_nai (id_lada);
CREATE INDEX IF NOT EXISTS idx_kn_id_lada_phat_sinh ON khieu_nai (id_lada_phat_sinh);
CREATE INDEX IF NOT EXISTS idx_kn_ngay_ket_thuc ON khieu_nai (ngay_ket_thuc);
CREATE INDEX IF NOT EXISTS idx_kn_muc_do ON khieu_nai (muc_do);
CREATE INDEX IF NOT EXISTS idx_kn_nhom_van_de ON khieu_nai (nhom_van_de);
CREATE INDEX IF NOT EXISTS idx_kn_ngay_thay_doi ON khieu_nai (ngay_thay_doi DESC);
