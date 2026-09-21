-- Danh ba "ETX nhan su" - dong bo (PULL, 1 chieu) tu he ETX ngoai cong ty
-- (asia-southeast1-etx-nhan-su.cloudfunctions.net/hrApi, khoa cap rieng cho doi tac "Thai 3T", xem
-- file KHOA-API-Thai3T-*.txt o goc repo, KHONG commit). Chay 1 lan/ngay luc 3h sang gio VN qua cron
-- (xem index.ts scheduled(), lib/etxNhanSuSync.ts). Khac linh-kien-app: KHONG co bang trung gian
-- "ktv_lien_he"/ma_ktv - App Khieu Nai chi co 1 bang users (email = PK), nen khop tai khoan TRUC TIEP
-- theo gmail (LOWER(gmail) = LOWER(users.email)), khong can cot lien ket rieng.
CREATE TABLE etx_nhan_su (
  ma_nhan_su          TEXT PRIMARY KEY,
  ho_ten              TEXT NOT NULL,
  chuc_danh           TEXT,
  ma_chuc_danh        TEXT,        -- JSON array (string[])
  gmail               TEXT,
  trang_thai_lam_viec TEXT NOT NULL, -- 'on' = dang lam viec | 'off' = da nghi
  tai_khoan_lada_ma   TEXT,
  tai_khoan_lada_ten  TEXT,
  quan_ly_truc_tiep   TEXT,        -- JSON array cua {maNhanSu,hoTen,gmail,chucDanhCuaToi}
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX idx_etx_nhan_su_gmail ON etx_nhan_su(gmail);

-- Trang thai lan dong bo PULL gan nhat - seed san dong id=1 (bang kieu con tro/trang thai phai tu
-- seed, khong tu sinh dong dau qua UPDATE).
CREATE TABLE etx_nhan_su_sync_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  last_run_at   TEXT,
  last_status   TEXT,   -- 'ok' | 'error'
  changed_count INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT
);
INSERT INTO etx_nhan_su_sync_state (id) VALUES (1);
