-- Ket noi Google Drive (OAuth 1 tai khoan that, upload anh/video cong khai) - copy pattern tu
-- vi-pham-app (xem skill qlbh3t-cf-integrations). Chi 1 dong duy nhat (id luon = 1).
CREATE TABLE google_drive_oauth (
    id                  INTEGER PRIMARY KEY,
    google_email        TEXT NOT NULL,
    refresh_token_enc   TEXT NOT NULL,
    folder_id           TEXT NOT NULL,
    authorized_by       TEXT REFERENCES users(email),
    authorized_at       TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);

-- Anh/video dinh kem khi bao ca (2026-09-21) - toi da 5 anh + 3 video/1 khieu nai (chan o backend),
-- luu link thumbnail cong khai tren Drive (khong luu file that trong D1/R2).
CREATE TABLE khieu_nai_dinh_kem (
    id              TEXT PRIMARY KEY,
    khieu_nai_id    TEXT NOT NULL REFERENCES khieu_nai(id),
    loai            TEXT NOT NULL,   -- 'anh' | 'video'
    url             TEXT NOT NULL,   -- link thumbnail cong khai (drive.google.com/thumbnail?id=...)
    drive_file_id   TEXT NOT NULL,
    ten_file        TEXT,
    nguoi_tao       TEXT NOT NULL REFERENCES users(email),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
CREATE INDEX idx_dinh_kem_khieu_nai ON khieu_nai_dinh_kem (khieu_nai_id, ngay_tao);
