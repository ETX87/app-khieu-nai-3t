// Phân loại "Mức độ" thành tông màu dùng chung cho card danh sách và nền UI chi tiết.
export type SeverityTone = "red" | "amber" | "blue" | "gray";

export function mucDoTone(v: string | null | undefined): SeverityTone {
  if (!v) return "gray";
  if (/nghiêm trọng|gấp/i.test(v)) return "red";
  if (/trung bình|trung binh/i.test(v)) return "amber";
  if (/quà tặng|qua tang/i.test(v)) return "blue";
  return "gray";
}

export const MUC_DO_BG: Record<SeverityTone, string> = {
  red: "bg-red-50",
  amber: "bg-amber-50",
  blue: "bg-blue-50",
  gray: "bg-bg",
};

export const MUC_DO_CARD_BG: Record<SeverityTone, string> = {
  red: "bg-red-50",
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
