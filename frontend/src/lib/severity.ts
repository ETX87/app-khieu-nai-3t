// Phân loại "Mức độ" thành tông màu dùng chung cho card danh sách và nền UI chi tiết.
// "Gấp" và "Nghiêm trọng" là 2 mức khác nhau -> phai khac mau (truoc day gop chung "red" nen
// nhin giong het nhau, item: tach rieng "Nghiem trong" sang tim nhat).
export type SeverityTone = "red" | "violet" | "green" | "blue" | "gray";

// Thu tu hien thi mong muon cho dropdown "Muc do" (khong phai thu tu chen trong DB) - item: sap
// lai Trung binh -> Gap -> Nghiem trong -> Can xoa diu. Gia tri la (con) thieu trong danh sach nay
// (vd nguoi dung tu them qua Settings sau nay) se xep o CUOI, theo dung thu tu tra ve tu server.
const MUC_DO_DISPLAY_ORDER = ["Trung bình", "Gấp", "Nghiêm trọng", "Cần quà tặng xoa dịu"];

export function sortMucDoOptions<T extends { gia_tri: string }>(opts: T[]): T[] {
  return [...opts].sort((a, b) => {
    const ia = MUC_DO_DISPLAY_ORDER.indexOf(a.gia_tri);
    const ib = MUC_DO_DISPLAY_ORDER.indexOf(b.gia_tri);
    return (ia === -1 ? MUC_DO_DISPLAY_ORDER.length : ia) - (ib === -1 ? MUC_DO_DISPLAY_ORDER.length : ib);
  });
}

export function mucDoTone(v: string | null | undefined): SeverityTone {
  if (!v) return "gray";
  if (/nghiêm trọng|nghiem trong/i.test(v)) return "violet";
  if (/gấp|gap/i.test(v)) return "red";
  if (/trung bình|trung binh/i.test(v)) return "green";
  if (/quà tặng|qua tang/i.test(v)) return "blue";
  return "gray";
}

export const MUC_DO_BG: Record<SeverityTone, string> = {
  red: "bg-red-50",
  violet: "bg-violet-50",
  green: "bg-green-50",
  blue: "bg-blue-50",
  gray: "bg-bg",
};

// Dung cho bang/card (nhieu dong lien tiep) - dam hon MUC_DO_BG mot bac de 4 muc do de phan biet
// bang mat thuong (truoc day dung chung -50 qua nhat, "Trung binh"/"Gap" nhin gan nhu giong nhau).
export const MUC_DO_CARD_BG: Record<SeverityTone, string> = {
  red: "bg-red-100",
  violet: "bg-violet-100",
  green: "bg-green-100",
  blue: "bg-blue-100",
  gray: "bg-white",
};

// Mau khi di chuot vao dong (hover) - dam hon 1 bac so voi MUC_DO_CARD_BG de van phan biet duoc
// muc do trong luc hover, thay vi de mau xam mac dinh cua Table lam mat mau (item: hover che mat
// mau xanh/do cua dong, kho xac dinh muc do khi ri chuot vao).
export const MUC_DO_CARD_HOVER_BG: Record<SeverityTone, string> = {
  red: "hover:bg-red-200",
  violet: "hover:bg-violet-200",
  green: "hover:bg-green-200",
  blue: "hover:bg-blue-200",
  gray: "hover:bg-gray-100",
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
