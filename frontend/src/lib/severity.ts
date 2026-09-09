// Phân loại "Mức độ" thành tông màu dùng chung cho card danh sách và nền UI chi tiết.
// "Gấp" và "Nghiêm trọng" là 2 mức khác nhau -> phai khac mau (truoc day gop chung "red" nen
// nhin giong het nhau, item: tach rieng "Nghiem trong" sang tim nhat).
export type SeverityTone = "red" | "violet" | "amber" | "blue" | "gray";

export function mucDoTone(v: string | null | undefined): SeverityTone {
  if (!v) return "gray";
  if (/nghiêm trọng|nghiem trong/i.test(v)) return "violet";
  if (/gấp|gap/i.test(v)) return "red";
  if (/trung bình|trung binh/i.test(v)) return "amber";
  if (/quà tặng|qua tang/i.test(v)) return "blue";
  return "gray";
}

export const MUC_DO_BG: Record<SeverityTone, string> = {
  red: "bg-red-50",
  violet: "bg-violet-50",
  amber: "bg-amber-50",
  blue: "bg-blue-50",
  gray: "bg-bg",
};

export const MUC_DO_CARD_BG: Record<SeverityTone, string> = {
  red: "bg-red-50",
  violet: "bg-violet-50",
  amber: "bg-amber-50",
  blue: "bg-blue-50",
  gray: "bg-white",
};

// "Cắm cờ" (cam_co): viền dày + toả sáng nhấp nháy đều đặn theo màu cờ; không có cờ dùng viền mảnh mặc định.
export function camCoBorderClass(v: string | null | undefined): string {
  if (v === "Co do") return "border-[3px] border-red-600 flag-glow-red";
  if (v === "Co vang") return "border-[3px] border-amber-500 flag-glow-amber";
  return "border border-line";
}

// Khach VIP: "Phan loai KH" (settings_option nhom=phan_loai_kh) co gia tri "S.VIP".
export function isVipKh(phanLoaiKh: string | null | undefined): boolean {
  return !!phanLoaiKh && /vip/i.test(phanLoaiKh);
}

// Ap dung cho <tr>/<div> bao ngoai 1 dong danh sach: vien vang sang ruc ro (item: KH VIP), dung
// class ".vip-glow" khai bao trong index.css (box-shadow inset + toa sang, khong doi border-collapse).
export function vipGlowClass(phanLoaiKh: string | null | undefined): string {
  return isVipKh(phanLoaiKh) ? "vip-glow" : "";
}
