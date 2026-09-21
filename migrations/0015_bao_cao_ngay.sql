-- Snapshot ton dong hang ngay (2026-09-21) - phuc vu "Bao cao theo ngay": can biet CHINH XAC so ca
-- con ton tai 1 thoi diem qua khu, nhung he thong chi luu trang_thai HIEN TAI (khong co lich su
-- trang thai theo ngay) - neu dung lai tu khieu_nai_lich_su moi lan xem bao cao se rat ton kem khi
-- du lieu lon dan (3 nam, 5k ca/ngay). Ghi 1 dong/ngay qua cron 20h da co san (backend/src/index.ts)
-- thay vi tinh lai moi lan xem - vua re (~365 dong/nam) vua on dinh du du lieu tang bao nhieu.
CREATE TABLE bao_cao_ngay_snapshot (
    ngay            TEXT PRIMARY KEY,  -- 'YYYY-MM-DD', dai dien trang thai luc chup (~20h hang ngay, gio VN)
    cho_tiep_nhan   INTEGER NOT NULL,
    con_ton         INTEGER NOT NULL,  -- NOT IN (Da ket thuc, Huy)
    created_at      TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);

-- "Bao cao theo ngay" can loc khieu_nai_lich_su theo hanh_dong='tiep_nhan' + khoang ngay (tinh "Da
-- tiep nhan trong ngay" + "TB thoi gian tiep nhan") - index hien co (khieu_nai_id, thoi_diem) khong
-- ho tro truy van nay, se buoc quet toan bang log (bang tang nhanh nhat he thong, nhieu dong/1 ca).
CREATE INDEX idx_ls_hanh_dong_thoi_diem ON khieu_nai_lich_su (hanh_dong, thoi_diem);
