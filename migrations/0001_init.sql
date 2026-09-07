CREATE TABLE users (
    email               TEXT PRIMARY KEY,
    ten                 TEXT,
    vai_tro             TEXT,
    trang_thai_duyet    TEXT NOT NULL DEFAULT 'Cho duyet',
    bi_khoa             INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);

CREATE TABLE login_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    thoi_gian TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    ip TEXT,
    user_agent TEXT
);

CREATE TABLE khieu_nai (
    id                          TEXT PRIMARY KEY,
    ngay_tiep_nhan              TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    ten_khach                   TEXT,
    id_lada                     TEXT,
    sale_khu_vuc                TEXT,
    tinh                        TEXT,
    quan_huyen                  TEXT,
    phuong_xa                   TEXT,
    model                       TEXT,
    hang                        TEXT,
    thong_tin_ban_dau           TEXT,
    nguoi_bao                   TEXT,
    trang_thai                  TEXT NOT NULL DEFAULT 'Cho tiep nhan',
    id_crm_karofi               TEXT,
    ngay_tiep_nhan_crm          TEXT,
    ket_luan_khieu_nai          TEXT DEFAULT 'Chua danh gia',
    ngay_ket_thuc               TEXT,
    nguoi_ket_thuc              TEXT REFERENCES users(email),
    loi_nha_san_xuat            TEXT NOT NULL DEFAULT 'Chua danh gia',
    loi_lap_dat                 TEXT NOT NULL DEFAULT 'Chua danh gia',
    loi_thai_do_ktv             TEXT NOT NULL DEFAULT 'Chua danh gia',
    loi_quy_trinh_nskx          TEXT NOT NULL DEFAULT 'Chua danh gia',
    ghi_chu_nguoi_tao           TEXT,
    ngay_thay_doi               TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    nguoi_tao                   TEXT REFERENCES users(email),
    muc_do                      TEXT,
    nhom_yeu_cau                TEXT,
    nhom_van_de                 TEXT,
    van_de_dau_vao              TEXT,
    ket_qua_crm                 TEXT,
    thong_tin_xu_ly_crm         TEXT,
    ngay_ktv_hoan_thanh         TEXT,
    ngay_ghi_nhan_doi_may       TEXT,
    ngay_dong_doi_may           TEXT,
    giai_trinh_cham_doi_may     TEXT,
    ket_qua_doi_may             TEXT,
    nguoi_xac_nhan_doi_may      TEXT REFERENCES users(email),
    cam_co                      TEXT NOT NULL DEFAULT 'Khong co',
    phan_loai_kh                TEXT,
    cskh_tiep_nhan               TEXT REFERENCES users(email),
    ghi_chu_ly_do_cham          TEXT,
    id_lada_phat_sinh           TEXT,
    bo_phan_ban_giao             TEXT,
    ma_duyet_doi_linh_kien      TEXT,
    thong_tin_giai_trinh_dvbh   TEXT,
    danh_gia_ql                 TEXT,
    ql_gio_xu_ly                NUMERIC,
    ql_chon_ngay_hen            TEXT,
    ql_chon_ly_do                TEXT,
    ql_nguoi_danh_gia            TEXT REFERENCES users(email),
    ngay_ql_danh_gia             TEXT,
    created_at                   TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    updated_at                   TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
CREATE INDEX idx_kn_trang_thai ON khieu_nai (trang_thai);
CREATE INDEX idx_kn_id_crm ON khieu_nai (id_crm_karofi);
CREATE INDEX idx_kn_cho_dong_bo ON khieu_nai (id_crm_karofi) WHERE ngay_ktv_hoan_thanh IS NULL;
CREATE INDEX idx_kn_ngay_tiep_nhan ON khieu_nai (ngay_tiep_nhan DESC);

CREATE TABLE khieu_nai_tien_trinh (
    id                  TEXT PRIMARY KEY,
    khieu_nai_id        TEXT NOT NULL REFERENCES khieu_nai(id),
    nguoi_tao           TEXT NOT NULL REFERENCES users(email),
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    noi_dung_ghi_chep    TEXT,
    ly_do_xu_ly_cham     TEXT
);
CREATE INDEX idx_tt_khieu_nai ON khieu_nai_tien_trinh (khieu_nai_id, ngay_tao DESC);

CREATE TABLE settings_option (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nhom        TEXT NOT NULL,
    gia_tri     TEXT NOT NULL,
    parent      TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),
    created_by  TEXT REFERENCES users(email),
    UNIQUE(nhom, gia_tri, parent)
);
