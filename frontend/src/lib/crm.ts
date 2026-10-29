import type { KhieuNai } from "../api/types";

// CRM Karofi co the chua co case ngay luc tao phan anh (dong bo cham) - tra cuu "khong tim thay" trong
// CRM_SAI_SAU_GIO gio dau chi coi la "Dang cho dong bo", qua moc do moi bao "ID CRM sai".
// Phai khop voi CRM_SAI_SQL o backend/src/routes/khieuNai.ts.
export const CRM_SAI_SAU_GIO = 4;

// created_at luu gio VN dang "yyyy-mm-dd hh:mm:ss" (khong co mui gio).
function tuoiGio(createdAt: string): number {
  const t = Date.parse(`${createdAt.replace(" ", "T")}+07:00`);
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 3_600_000;
}

export function laIdCrmSai(kn: Pick<KhieuNai, "crm_tra_cuu" | "created_at">): boolean {
  return kn.crm_tra_cuu === "SAI_ID" && tuoiGio(kn.created_at) > CRM_SAI_SAU_GIO;
}

// Tra cuu da bao khong tim thay nhung ca con moi (< CRM_SAI_SAU_GIO gio) -> van dang cho CRM dong bo.
export function laChoCrmMoi(kn: Pick<KhieuNai, "crm_tra_cuu" | "created_at">): boolean {
  return kn.crm_tra_cuu === "SAI_ID" && !laIdCrmSai(kn);
}

// Da keo duoc thong tin ve tu CRM (hoac Lada phat sinh), chi con cho KTV hoan thanh - khong hien
// "Cho dong bo CRM" nua. Khop DA_DONG_BO_SQL o backend/src/routes/khieuNai.ts.
export function daDongBo(
  kn: Pick<KhieuNai, "crm_tra_cuu" | "ngay_tiep_nhan_crm" | "ket_qua_crm" | "lada_ps_trang_thai">,
): boolean {
  return (
    kn.crm_tra_cuu === "OK" ||
    (kn.crm_tra_cuu !== "SAI_ID" && (!!kn.ngay_tiep_nhan_crm || !!kn.ket_qua_crm)) ||
    !!kn.lada_ps_trang_thai
  );
}

// ID CRM Karofi: ma so cu (vd "1311618") hoac ma moi tu 2026-10 dang SC + yymmdd + so thu tu
// (vd "SC261007210"). CRM tra cuu khop chinh xac, moi ma deu viet HOA khong khoang trang -> bo khoang
// trang + viet hoa ngay khi go. Khop chuanHoaIdCrm o backend/src/routes/khieuNai.ts.
export function chuanHoaIdCrm(v: string): string {
  return v.replace(/\s+/g, "").toUpperCase();
}
