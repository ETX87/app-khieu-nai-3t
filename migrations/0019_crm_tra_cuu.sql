-- Ket qua tra cuu ID CRM Karofi lan gan nhat: 'OK' (tim thay case tren CRM) | 'SAI_ID' (CRM tra ve
-- khong tim thay) | NULL (chua tra cuu duoc - chua co ID, hoac loi mang/API). Dung de tach "ca ton
-- dong bo CRM" thanh 2 nhom: "Cho dong bo" (ID dung, dang cho KTV hoan thanh) va "ID CRM sai".
ALTER TABLE khieu_nai ADD COLUMN crm_tra_cuu TEXT;

-- Backfill: giai_trinh_dvbh_json chi duoc ghi khi tra cuu thanh cong (ke ca mang rong "[]").
UPDATE khieu_nai SET crm_tra_cuu = 'OK'
  WHERE id_crm_karofi IS NOT NULL AND giai_trinh_dvbh_json IS NOT NULL;
UPDATE khieu_nai SET crm_tra_cuu = 'SAI_ID'
  WHERE id_crm_karofi IS NOT NULL AND giai_trinh_dvbh_json IS NULL;
