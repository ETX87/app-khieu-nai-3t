-- "ID Truy van" (2026-09-21) - luc dau chi dung de tra cuu (khong luu), nhung theo yeu cau ra soat
-- can hanh xu GIONG HET "ID Lada" (xem KhieuNaiForm.tsx NGUON_OPTIONS/FILLABLE) nen luu lai nhu 1
-- cot thong thuong, hien/sua duoc o trang chi tiet giong ID Lada.
ALTER TABLE khieu_nai ADD COLUMN id_truy_van TEXT;
