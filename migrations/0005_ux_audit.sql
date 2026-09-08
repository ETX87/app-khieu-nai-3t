-- Rà soát UX 09/2026: các cột & bảng bổ sung.

-- C4: số điện thoại khách (không bắt buộc, theo quyết định chủ dự án - "để chờ").
ALTER TABLE khieu_nai ADD COLUMN sdt_khach TEXT;

-- H1: người phụ trách ca (assignment).
ALTER TABLE khieu_nai ADD COLUMN nguoi_phu_trach TEXT REFERENCES users(email);

-- D8: hủy có lý do.
ALTER TABLE khieu_nai ADD COLUMN ly_do_huy TEXT;
ALTER TABLE khieu_nai ADD COLUMN nguoi_huy TEXT REFERENCES users(email);
ALTER TABLE khieu_nai ADD COLUMN ngay_huy TEXT;

-- D4: giờ xử lý do hệ thống tính, chốt lại tại thời điểm "Chốt".
ALTER TABLE khieu_nai ADD COLUMN ql_gio_xu_ly_he_thong NUMERIC;

CREATE INDEX IF NOT EXISTS idx_kn_nguoi_phu_trach ON khieu_nai (nguoi_phu_trach);

-- D9: nhật ký hồ sơ khiếu nại (audit tối thiểu - chỉ mốc quan trọng).
CREATE TABLE khieu_nai_lich_su (
    id              TEXT PRIMARY KEY,
    khieu_nai_id    TEXT NOT NULL REFERENCES khieu_nai(id),
    nguoi           TEXT NOT NULL REFERENCES users(email),
    thoi_diem       TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    hanh_dong       TEXT NOT NULL,   -- 'chuyen_trang_thai' | 'danh_gia_loi' | 'danh_gia_ql' | 'huy' | 'mo_lai' | 'phu_trach'
    truong          TEXT,
    gia_tri_cu      TEXT,
    gia_tri_moi     TEXT
);
CREATE INDEX idx_ls_khieu_nai ON khieu_nai_lich_su (khieu_nai_id, thoi_diem DESC);
