import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { KhieuNai } from "../api/types";

// Moi loai loi (danh gia "Co") gan 1 icon + mau rieng - trung mau voi bieu do "Co cau loi da chot" o
// Bao cao (--series-1..4) de nguoi xem nhan ra ngay ca bi loi gi, may loi.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const LOI_DEFS: { cot: "loi_nha_san_xuat" | "loi_lap_dat" | "loi_thai_do_ktv" | "loi_quy_trinh_nskx"; nhan: string; mau: string; icon: ReactNode }[] = [
  {
    // Nha san xuat: nha may
    cot: "loi_nha_san_xuat", nhan: "report.errorLabel.nsx", mau: "var(--series-1)",
    icon: <path {...P} d="M3 20V10l5 3V10l5 3V6h4l1 3v11H3ZM3 20h18" />,
  },
  {
    // Lap dat: co le
    cot: "loi_lap_dat", nhan: "report.errorLabel.lapDat", mau: "var(--series-2)",
    icon: <path {...P} d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5Z" />,
  },
  {
    // Thai do KTV: mat buon
    cot: "loi_thai_do_ktv", nhan: "report.errorLabel.thaiDoKtv", mau: "var(--series-3)",
    icon: <><circle {...P} cx="12" cy="12" r="8.5" /><path {...P} d="M8.5 16c1-1.3 2.1-2 3.5-2s2.5.7 3.5 2M9 9.5h.01M15 9.5h.01" /></>,
  },
  {
    // Quy trinh NSKX: bang kiem co dau X
    cot: "loi_quy_trinh_nskx", nhan: "report.errorLabel.quyTrinhNskx", mau: "var(--series-4)",
    icon: <path {...P} d="M9 4h6v3H9zM8 5.5H6v15h12v-15h-2M9.5 12l5 5M14.5 12l-5 5" />,
  },
];

type LoiRow = Pick<KhieuNai, "loi_nha_san_xuat" | "loi_lap_dat" | "loi_thai_do_ktv" | "loi_quy_trinh_nskx">;

export const cacLoi = (r: LoiRow) => LOI_DEFS.filter((d) => r[d.cot] === "Co");

function LoiIcon({ mau, icon, title, size }: { mau: string; icon: ReactNode; title?: string; size: "sm" | "md" }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white shadow-sm ${size === "md" ? "h-6 w-6" : "h-6 w-6 lg:h-5 lg:w-5"}`}
      style={{ background: mau }}
    >
      <svg viewBox="0 0 24 24" className={size === "md" ? "h-4 w-4" : "h-4 w-4 lg:h-3.5 lg:w-3.5"}>{icon}</svg>
    </span>
  );
}

// Day icon cac loi cua 1 ca (khong co loi -> empty, hoac "—" neu truyen dash). So icon = so loi.
export function LoiIcons({ r, dash, size = "sm" }: { r: LoiRow; dash?: boolean; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const ds = cacLoi(r);
  if (ds.length === 0) return dash ? <span className="text-ink-faint">—</span> : null;
  const tong = ds.map((d) => t(d.nhan)).join(", ");
  return (
    <span className="inline-flex items-center gap-0.5" title={t("list.loiIcons.title", { n: ds.length, list: tong })} aria-label={t("list.loiIcons.title", { n: ds.length, list: tong })}>
      {ds.map((d) => <LoiIcon key={d.cot} mau={d.mau} icon={d.icon} title={t(d.nhan)} size={size} />)}
    </span>
  );
}

// Chu thich icon (dat duoi bang danh sach) de nguoi moi nhin biet icon nao la loi gi.
export function LoiIconLegend() {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
      {t("list.loiIcons.legend")}
      {LOI_DEFS.map((d) => (
        <span key={d.cot} className="inline-flex items-center gap-1">
          <LoiIcon mau={d.mau} icon={d.icon} size="sm" />
          {t(d.nhan)}
        </span>
      ))}
    </span>
  );
}
