import type { ReactNode } from "react";

// Thẻ KPI pastel theo DESIGN_SYSTEM.md 6.1: nền gradient nhạt + icon tròn nền đậm góc trái +
// watermark mờ góc phải + tên chỉ số + số liệu lớn. Mỗi tone = 1 nhóm nghiệp vụ (bảng 2.4).
export type KpiTone = "brand" | "blue" | "cyan" | "amber" | "green" | "red" | "slate";

const KPI_TONES: Record<KpiTone, { card: string; icon: string; value: string }> = {
  brand: { card: "from-brand-50 to-brand-100", icon: "bg-brand-600", value: "text-brand-800" },
  blue: { card: "from-[#EEF5FE] to-[#DCEBFD]", icon: "bg-blue-500", value: "text-blue-800" },
  cyan: { card: "from-[#E6F9FB] to-[#D2F3F7]", icon: "bg-cyan-500", value: "text-cyan-800" },
  amber: { card: "from-[#FFF9E7] to-[#FEF0C7]", icon: "bg-amber-500", value: "text-amber-800" },
  green: { card: "from-[#EAFBF1] to-[#D4F5E2]", icon: "bg-emerald-500", value: "text-emerald-800" },
  red: { card: "from-[#FEF1F1] to-[#FDE0E0]", icon: "bg-red-500", value: "text-red-700" },
  slate: { card: "from-[#F4F5F8] to-[#E8EAF0]", icon: "bg-slate-500", value: "text-slate-700" },
};

const KPI_ICON_PROPS = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const KPI_ICONS = {
  tong: <svg {...KPI_ICON_PROPS}><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8M8 12.5h5" /></svg>,
  inbox: <svg {...KPI_ICON_PROPS}><path d="M4 13h4l1.5 3h5L16 13h4" /><path d="M5.5 5h13L21 13v6H3v-6l2.5-8Z" /></svg>,
  dangXuLy: <svg {...KPI_ICON_PROPS}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>,
  choChot: <svg {...KPI_ICON_PROPS}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  xong: <svg {...KPI_ICON_PROPS}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>,
  huy: <svg {...KPI_ICON_PROPS}><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></svg>,
  dongBo: <svg {...KPI_ICON_PROPS}><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></svg>,
  canhBao: <svg {...KPI_ICON_PROPS}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></svg>,
  nguoi: <svg {...KPI_ICON_PROPS}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>,
  lap: <svg {...KPI_ICON_PROPS}><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></svg>,
  quaHan: <svg {...KPI_ICON_PROPS}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9 2h6" /></svg>,
};

export interface KpiCardProps {
  label: string;
  value: ReactNode;
  tone: KpiTone;
  sub?: ReactNode; // dong phu chu duoi so lieu (vd "tren 12 ca")
  icon: keyof typeof KPI_ICONS;
  onClick?: () => void;
}

export function KpiCard({ label, value, tone, icon, onClick, sub }: KpiCardProps) {
  const t = KPI_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative h-full w-full overflow-hidden rounded-[14px] border border-white/70 bg-gradient-to-br p-4 text-left shadow-card ${t.card} ${
        onClick ? "transition hover:-translate-y-0.5 hover:shadow-pop" : "cursor-default"
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] lg:h-[38px] lg:w-[38px] ${t.icon}`}>
        {KPI_ICONS[icon]}
      </span>
      <span className={`pointer-events-none absolute -bottom-2 -right-2 opacity-[0.12] [&_svg]:h-[54px] [&_svg]:w-[54px] ${t.value}`}>
        {KPI_ICONS[icon]}
      </span>
      <p className="mt-3 text-sm font-semibold leading-tight text-ink-body lg:text-xs">{label}</p>
      <p className={`mt-1 text-[28px] font-extrabold leading-none ${t.value}`}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-ink-soft">{sub}</p>}
    </button>
  );
}
