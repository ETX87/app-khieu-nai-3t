-- Quyen "Xem tat ca ca" (mac dinh tat): Admin bat cho tung tai khoan NV Sale / Tong dai vien - 2 vai
-- tro nay mac dinh chi thay ca do chinh minh tao. Bat len -> thay moi ca tren he thong, nhung ca cua
-- nguoi khac CHI XEM (khong dinh kem / nhan phu trach / dong bo CRM). Cac vai tro khac da thay tat ca.
ALTER TABLE users ADD COLUMN xem_tat_ca INTEGER NOT NULL DEFAULT 0;
