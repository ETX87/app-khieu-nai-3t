-- ID Truy xuat gio da tra cuu duoc rieng (GET /tra-cuu?id_truy_van=..., WHERE id_truy_van = ?)
-- - can index rieng, tranh full-table-scan khi data lon dan (giong idx_kn_id_lada da co).
CREATE INDEX IF NOT EXISTS idx_kn_id_truy_van ON khieu_nai (id_truy_van);
