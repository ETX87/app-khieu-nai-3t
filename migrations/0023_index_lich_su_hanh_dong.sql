-- Toi uu D1 rows_read (ra soat 2026-10-15, wrangler d1 insights 7 ngay):
-- GET /bao-cao/toc-do-xu-ly co 3 correlated subquery
--   SELECT MIN/MAX(thoi_diem) FROM khieu_nai_lich_su WHERE khieu_nai_id = ? AND hanh_dong = ?
-- EXPLAIN QUERY PLAN production cho thay planner chon idx_ls_hanh_dong_thoi_diem (hanh_dong=?)
-- -> moi phieu quet het moi dong cung hanh_dong cua toan bang (~10,3M rows_read/lan, 972M/tuan).
-- Index ghep dung ca 2 dieu kien bang + thoi_diem -> MIN/MAX la 1 lan seek.
CREATE INDEX IF NOT EXISTS idx_ls_kn_hanh_dong_thoi_diem ON khieu_nai_lich_su (khieu_nai_id, hanh_dong, thoi_diem);

-- settings_option: WHERE nhom = ? AND active = 1 AND parent = ? (4.4k lan/tuan, ~1,2k dong/lan) -
-- autoindex UNIQUE(nhom, gia_tri, parent) chi seek duoc theo nhom.
CREATE INDEX IF NOT EXISTS idx_so_nhom_parent ON settings_option (nhom, parent, active);
