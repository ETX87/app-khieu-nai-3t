-- Luu them JSON tho cua mang giai_trinh tu dvbh (case-lookup) de hien thi dang timeline
-- (badge + thoi gian/nguoi + noi dung + khoang cach moc) thay vi text gop 1 khoi nhu
-- thong_tin_giai_trinh_dvbh cu (van giu cot do de tra cuu nhanh/xuat text don gian).
ALTER TABLE khieu_nai ADD COLUMN giai_trinh_dvbh_json TEXT;
