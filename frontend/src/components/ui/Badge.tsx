import type { ReactNode } from "react";

type Tone = "gray" | "blue" | "amber" | "green" | "red" | "teal" | "violet";

const TONE_CLASSES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  violet: "bg-brand-50 text-brand-700 ring-brand-200",
};

// dot: chấm tròn phía trước cho trạng thái "đang chờ người xử lý" (DESIGN_SYSTEM.md 6.2).
export function Badge({ tone = "gray", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASSES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  "Cho tiep nhan": "red",
  "Dang xu ly": "blue",
  "Cho chot ket thuc": "amber",
  "Da ket thuc": "green",
  Huy: "gray",
};

export const STATUS_LABEL: Record<string, string> = {
  "Cho tiep nhan": "Chờ tiếp nhận",
  "Dang xu ly": "Đang xử lý",
  "Cho chot ket thuc": "Chờ chốt kết thúc",
  "Da ket thuc": "Đã kết thúc",
  Huy: "Hủy",
};

export function StatusBadge({ trangThai }: { trangThai: string }) {
  return <Badge tone={STATUS_TONE[trangThai] ?? "gray"} dot={trangThai === "Cho tiep nhan" || trangThai === "Cho chot ket thuc"}>{STATUS_LABEL[trangThai] ?? trangThai}</Badge>;
}
