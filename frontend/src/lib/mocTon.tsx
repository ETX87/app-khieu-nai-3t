import { useTranslation } from "react-i18next";
import type { KhieuNai } from "../api/types";
import { Badge } from "../components/ui/Badge";

// Moc ton: so ngay tu luc tiep nhan den khi ket thuc/huy (ca chua xong tinh den bay gio), khoang
// [lo, hi). Khop MOC_TON + SO_NGAY_TON_SQL o backend/src/routes/khieuNai.ts (tham so "moc_ton").
export const MOC_TON: { key: string; lo: number; hi: number | null; tone: "green" | "teal" | "amber" | "red" }[] = [
  { key: "0-1", lo: 0, hi: 1, tone: "green" },
  { key: "1-3", lo: 1, hi: 3, tone: "green" },
  { key: "3-5", lo: 3, hi: 5, tone: "teal" },
  { key: "5-7", lo: 5, hi: 7, tone: "teal" },
  { key: "7-10", lo: 7, hi: 10, tone: "amber" },
  { key: "10-14", lo: 10, hi: 14, tone: "amber" },
  { key: "14-21", lo: 14, hi: 21, tone: "red" },
  { key: "21-30", lo: 21, hi: 30, tone: "red" },
  { key: "30+", lo: 30, hi: null, tone: "red" },
];

type MocTonRow = Pick<KhieuNai, "trang_thai" | "ngay_tiep_nhan" | "ngay_ket_thuc" | "ngay_huy">;

function soNgayTon(r: MocTonRow): number {
  const end = r.trang_thai === "Da ket thuc" ? r.ngay_ket_thuc : r.trang_thai === "Huy" ? r.ngay_huy : null;
  const ms = (v: string) => new Date(v.replace(" ", "T") + "Z").getTime();
  return ((end ? ms(end) : Date.now() + 7 * 3_600_000) - ms(r.ngay_tiep_nhan)) / 86_400_000;
}

export function mocTonCua(r: MocTonRow) {
  const d = soNgayTon(r);
  return MOC_TON.find((m) => d >= m.lo && (m.hi == null || d < m.hi)) ?? MOC_TON[0];
}

export function MocTonBadge({ r }: { r: MocTonRow }) {
  const { t } = useTranslation();
  const m = mocTonCua(r);
  return <span className="whitespace-nowrap"><Badge tone={m.tone}>{t(`list.mocTon.${m.key}`)}</Badge></span>;
}

// Bo loc chon 1 hoac nhieu moc ton (giu thu tu MOC_TON de tham so query on dinh).
export function MocTonChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <span className="text-sm text-ink-soft lg:text-xs">{t("list.mocTonFilter")}</span>
      {MOC_TON.map((m) => {
        const on = value.includes(m.key);
        return (
          <button
            key={m.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((k) => k !== m.key) : MOC_TON.map((x) => x.key).filter((k) => k === m.key || value.includes(k)))}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors lg:px-2.5 lg:py-0.5 lg:text-xs ${
              on ? "bg-accent text-white shadow-brand ring-accent" : "bg-surface text-ink-soft ring-line-strong hover:bg-accent-soft hover:text-accent-ink"
            }`}
          >
            {t(`list.mocTon.${m.key}`)}
          </button>
        );
      })}
      {value.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="text-sm font-medium text-accent hover:underline lg:text-xs">
          {t("list.mocTonClear")}
        </button>
      )}
    </div>
  );
}
