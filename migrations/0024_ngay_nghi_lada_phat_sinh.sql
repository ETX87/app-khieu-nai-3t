-- GD1 ke hoach "Quan ly ca ton & Loi vi pham" (BAO-CAO-KE-HOACH-TON-VI-PHAM-DOI-MAY.md muc 0b, chot 28/10/2026).

-- Ngay nghi le Viet Nam: moc "48h" cua cac loi L1a/L1b/L2 tinh 48 GIO BO Chu nhat va ngay le (Chu nhat
-- tu tinh trong code, KHONG nhap vao day). Admin quan ly o man Cau hinh; le am lich (Tet, Gio To) va
-- ngay nghi bu nhap dau moi nam theo thong bao cua Nha nuoc. Nap san le duong lich co dinh 2026-2027.
CREATE TABLE IF NOT EXISTS ngay_nghi (
    ngay        TEXT PRIMARY KEY,           -- 'YYYY-MM-DD'
    ten         TEXT NOT NULL,
    created_by  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
INSERT OR IGNORE INTO ngay_nghi (ngay, ten, created_by) VALUES
    ('2026-01-01', 'Tết Dương lịch', 'system'),
    ('2026-04-30', 'Ngày Giải phóng miền Nam', 'system'),
    ('2026-05-01', 'Quốc tế Lao động', 'system'),
    ('2026-09-02', 'Quốc khánh', 'system'),
    ('2027-01-01', 'Tết Dương lịch', 'system'),
    ('2027-04-30', 'Ngày Giải phóng miền Nam', 'system'),
    ('2027-05-01', 'Quốc tế Lao động', 'system'),
    ('2027-09-02', 'Quốc khánh', 'system');

-- Moc "dong case tren Lada" cho loi L2 (Cham dong ca) = "Ngay Chot Don" cua ID LADA PHAT SINH (don Lada
-- tao ra de xu ly khieu nai) - KHONG dung ID Lada goc (la don ban/lap, chot TRUOC khi nhan khieu nai).
-- Dong bo tu dong boi cron (lib/dongBoTuDong.ts) + ngay khi luu id_lada_phat_sinh.
ALTER TABLE khieu_nai ADD COLUMN lada_ps_ngay_chot TEXT;     -- 'YYYY-MM-DD HH:MM:SS' gio VN, NULL = chua chot
ALTER TABLE khieu_nai ADD COLUMN lada_ps_trang_thai TEXT;    -- cot "Trang thai" cua don Lada phat sinh
ALTER TABLE khieu_nai ADD COLUMN lada_ps_sync_at TEXT;       -- lan tra cuu Lada gan nhat (gio VN)
