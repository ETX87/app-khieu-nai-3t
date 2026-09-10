-- Chuong thong bao (yeu cau 2026-09): bao "Don moi can tiep nhan" va "Don cho QL chot" + Web Push
-- day thong bao ngay ca khi khong mo tab app (tham khao co che linh-kien-app).

CREATE TABLE thong_bao (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_nhan   TEXT NOT NULL REFERENCES users(email),
    -- "cho_tiep_nhan" | "cho_chot" - dung de to mau/nhan rieng tung loai o frontend.
    loai         TEXT NOT NULL,
    noi_dung     TEXT NOT NULL,
    khieu_nai_id TEXT REFERENCES khieu_nai(id),
    da_doc       INTEGER NOT NULL DEFAULT 0,
    ngay_tao     TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
CREATE INDEX idx_thong_bao_nguoi_nhan ON thong_bao(nguoi_nhan, ngay_tao DESC);
CREATE INDEX idx_thong_bao_chua_doc ON thong_bao(nguoi_nhan, da_doc);

-- Web Push subscription cua tung thiet bi/trinh duyet - 1 nguoi dung co the co nhieu dong (nhieu
-- thiet bi dang bat thong bao cung luc). endpoint la khoa tu nhien (UNIQUE, browser tu sinh).
CREATE TABLE push_subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nguoi_dung  TEXT NOT NULL REFERENCES users(email),
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    ngay_tao    TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
CREATE INDEX idx_push_subscriptions_nguoi_dung ON push_subscriptions(nguoi_dung);
