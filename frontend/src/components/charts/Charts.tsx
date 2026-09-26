import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Bo bieu do SVG tu viet (khong them thu vien ~100KB gzip cho vai dang bieu do don gian).
// Quy tac (DESIGN_SYSTEM.md §8): net 2px, cot <= 28px bo 4px dau du lieu, khe 2px mau nen giua
// cac manh ghep, luoi 1px mo, chu KHONG mang mau series (chi dau mau canh chu), luon co chu giai
// khi >= 2 series, hover/cham hien tooltip. Mau series lay tu --series-1..4 (da kiem tra phan biet
// duoc voi nguoi mu mau), mau trang thai tot/canh bao dung --status-good/--status-warn.

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"] as const;
export const STATUS_GOOD = "var(--status-good)";
export const STATUS_WARN = "var(--status-warn)";

const GRID = "var(--line)";
const AXIS_TEXT = "var(--ink-faint)";
const fmtSo = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// Moc truc Y "tron" (1-2-5) de nhan truc de doc. Du lieu dem (so ca) -> buoc la so nguyen.
function yTicks(max: number, integer: boolean): number[] {
  for (const parts of [4, 2, 1]) {
    const step = max / parts;
    if (!integer || Number.isInteger(step)) return Array.from({ length: parts + 1 }, (_, i) => i * step);
  }
  return [0, max];
}

function niceMax(v: number): number {
  if (v <= 0) return 4;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

export function Legend({ items }: { items: { label: string; color: string; value?: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-body lg:text-xs">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
          {it.label}
          {it.value != null && <b className="font-semibold text-ink">{it.value}</b>}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, containerW, children }: { x: number; containerW: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), containerW - 70);
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-xs text-ink-body shadow-pop backdrop-blur"
      style={{ left }}
    >
      {children}
    </div>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  area?: boolean;
}

// Bieu do duong nhieu series (xu huong theo thoi gian). compact = sparkline: an truc/luoi.
export function LineChart({
  labels, series, height = 220, fmt = fmtSo, compact = false, tipLabels, integer = true,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  fmt?: (v: number) => string;
  compact?: boolean;
  tipLabels?: string[];
  integer?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const pad = compact ? { l: 4, r: 4, t: 6, b: 4 } : { l: 34, r: 10, t: 10, b: 24 };
  const pw = Math.max(10, w - pad.l - pad.r);
  const ph = Math.max(10, height - pad.t - pad.b);
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const x = (i: number) => pad.l + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = (v: number) => pad.t + ph - (v / max) * ph;
  const ticks = yTicks(max, integer);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 56))));
  const lastShown = Math.floor((n - 1) / labelEvery) * labelEvery;
  const showLabel = (i: number) => i % labelEvery === 0 || (i === n - 1 && n - 1 - lastShown >= labelEvery * 0.7);

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(n <= 1 ? 0 : Math.round(Math.min(Math.max((px / r.width) * (n - 1), 0), n - 1)));
  };

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg width={w} height={height} className="block overflow-visible">
        {!compact && ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT} style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {!compact && labels.map((l, i) =>
          showLabel(i) ? <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>{l}</text> : null,
        )}
        {series.map((s) =>
          s.area ? (
            <path
              key={`${s.key}-a`}
              d={`${path(s.values)}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`}
              fill={s.color}
              opacity={0.1}
            />
          ) : null,
        )}
        {series.map((s) => (
          <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {n === 1 && series.map((s) => s.values[0] != null && (
          <circle key={`${s.key}-one`} cx={x(0)} cy={y(s.values[0]!)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
        ))}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ph} stroke="var(--line-strong)" strokeWidth={1} />
            {series.map((s) => s.values[hover] != null && (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </>
        )}
        <rect
          x={pad.l} y={0} width={pw} height={height} fill="transparent"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover != null && (
        <Tooltip x={x(hover)} containerW={w}>
          <div className="mb-0.5 font-semibold text-ink">{(tipLabels ?? labels)[hover]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span>{s.label}</span>
              <b className="ml-auto pl-3 font-semibold text-ink">{s.values[hover] == null ? "—" : fmt(s.values[hover]!)}</b>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// Cot chong (vd SLA: da ket thuc + dang xu ly theo khoang so ngay). Tong gia tri hien tren dau cot.
export function StackedColumns({
  categories, series, height = 220,
}: {
  categories: string[];
  series: { key: string; label: string; color: string; values: number[] }[];
  height?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 34, r: 8, t: 22, b: 26 };
  const pw = Math.max(10, w - pad.l - pad.r);
  const ph = Math.max(10, height - pad.t - pad.b);
  const totals = categories.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 0));
  const band = pw / Math.max(1, categories.length);
  const colW = Math.min(28, band * 0.55);
  const y = (v: number) => pad.t + ph - (v / max) * ph;
  const ticks = yTicks(max, true).filter((_, i, a) => a.length <= 3 || i % 2 === 0);

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg width={w} height={height} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>{fmtSo(t)}</text>
          </g>
        ))}
        {categories.map((c, i) => {
          const cx = pad.l + band * i + band / 2;
          let acc = 0;
          const segs = series.map((s) => ({ s, v: s.values[i] ?? 0 })).filter((x) => x.v > 0);
          return (
            <g key={c} opacity={hover == null || hover === i ? 1 : 0.55}>
              {segs.map(({ s, v }, k) => {
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const top = k === segs.length - 1;
                // khe 2px mau nen giua cac manh: manh duoi chua lai 2px o dinh; manh tren cung bo 4px.
                const yTop = top ? y1 : Math.min(y0, y1 + 2);
                const x0 = cx - colW / 2;
                const r = top ? Math.min(4, (y0 - yTop) / 2) : 0;
                const d = `M${x0},${y0}V${yTop + r}${r ? `Q${x0},${yTop} ${x0 + r},${yTop}` : ""}H${x0 + colW - r}${r ? `Q${x0 + colW},${yTop} ${x0 + colW},${yTop + r}` : ""}V${y0}Z`;
                return <path key={s.key} d={d} fill={s.color} />;
              })}
              <text x={cx} y={y(totals[i]) - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ink)">{totals[i]}</text>
              <text x={cx} y={height - 7} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">{c}</text>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={ph} fill="transparent"
                onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onPointerLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <Tooltip x={pad.l + band * hover + band / 2} containerW={w}>
          <div className="mb-0.5 font-semibold text-ink">{categories[hover]} · {totals[hover]} ca</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span>{s.label}</span>
              <b className="ml-auto pl-3 font-semibold text-ink">{s.values[hover] ?? 0}</b>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// Bieu do vanh khuyen (co cau). Khe 2px giua cac manh; o giua hien tong hoac manh dang tro.
export function Donut({
  items, size = 176, thickness = 24, centerLabel, centerValue,
}: {
  items: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel: string;
  centerValue: ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const visible = items.filter((it) => it.value > 0).length;
  const gap = visible > 1 ? 3 : 0;
  let offset = 0;
  const h = hover != null ? items[hover] : null;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {total > 0 && items.map((it, i) => {
          const len = (it.value / total) * circ;
          const seg = (
            it.value > 0 && (
              <circle
                key={it.label}
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={it.color}
                strokeWidth={hover === i ? thickness + 4 : thickness}
                strokeDasharray={`${Math.max(0, len - gap)} ${circ - Math.max(0, len - gap)}`}
                strokeDashoffset={-offset}
                opacity={hover == null || hover === i ? 1 : 0.45}
                className="cursor-pointer transition-[stroke-width,opacity] duration-150"
                onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onPointerLeave={() => setHover(null)}
              />
            )
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[26px] font-extrabold leading-none text-ink">
          {h ? h.value : centerValue}
        </span>
        <span className="mt-1 max-w-[70%] text-xs leading-tight text-ink-soft">
          {h ? `${h.label} · ${total ? Math.round((h.value / total) * 100) : 0}%` : centerLabel}
        </span>
      </div>
    </div>
  );
}

// Thanh chong nam ngang nho dat trong dong bang/the (so sanh nhanh giua cac dong).
export function InlineStackedBar({
  parts, max, className = "",
}: {
  parts: { label: string; value: number; color: string }[];
  max: number;
  className?: string;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className={`flex h-2.5 w-full items-stretch gap-[2px] ${className}`} title={parts.map((p) => `${p.label}: ${p.value}`).join(" · ")}>
      {parts.filter((p) => p.value > 0).map((p, i, arr) => (
        <div
          key={p.label}
          className={`${i === 0 ? "rounded-l-full" : ""} ${i === arr.length - 1 ? "rounded-r-full" : ""}`}
          style={{ width: `${max > 0 ? (p.value / max) * 100 : 0}%`, background: p.color }}
        />
      ))}
      {total === 0 && <div className="w-full rounded-full bg-surface-2" />}
    </div>
  );
}
