import type { ReactNode } from "react";

type Tone = "gray" | "blue" | "amber" | "green" | "red" | "teal" | "violet";

const TONE_CLASSES: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-600 ring-gray-300",
  blue: "bg-blue-50 text-blue-700 ring-blue-300",
  amber: "bg-amber-50 text-amber-700 ring-amber-300",
  green: "bg-green-50 text-green-700 ring-green-300",
  red: "bg-red-50 text-red-700 ring-red-300",
  teal: "bg-teal-50 text-teal-700 ring-teal-300",
  violet: "bg-violet-50 text-violet-700 ring-violet-300",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}>
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
  return <Badge tone={STATUS_TONE[trangThai] ?? "gray"}>{STATUS_LABEL[trangThai] ?? trangThai}</Badge>;
}
