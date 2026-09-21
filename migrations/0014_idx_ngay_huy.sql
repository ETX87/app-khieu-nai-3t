-- Bo loc "thang" cho Trang chu/Bao cao (2026-09-21) can quet nhanh ca HUY trong 1 thang cu the
-- (ngay_huy), giong nhu idx_kn_ngay_ket_thuc da co san cho ca "Da ket thuc" - thieu index nay se
-- buoc SQLite quet toan bang moi khi loc theo ngay_huy.
CREATE INDEX IF NOT EXISTS idx_kn_ngay_huy ON khieu_nai (ngay_huy);
