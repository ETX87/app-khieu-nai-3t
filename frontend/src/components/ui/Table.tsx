import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  sortKey?: string; // co gia tri -> header bam duoc de sap xep (item: sort theo cot)
  noResize?: boolean; // cot co dinh (vd o tich chon) - khong cho keo do rong
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  sort?: { field: string; dir: "asc" | "desc" };
  onSort?: (field: string) => void;
  rowClassName?: (row: T) => string; // vd nen mau theo muc do, vien vang KH VIP...
  nowrap?: boolean; // moi dong chi 1 dong chu (khong xuong dong) - o dai dung <Clip> de cat "..."
  // Co gia tri -> nguoi dung keo mep phai tieu de cot de doi do rong; luu localStorage theo khoa nay
  // (chi tren may nay, khong gui len server). Nhay dup mep cot = tra ve do rong mac dinh.
  resizeKey?: string;
}

// Cat chu qua dai thanh "..." trong 1 dong, re chuot xem day du (title). max = class max-w-* (do rong
// mac dinh) - khi nguoi dung da tu keo do rong cot thi bo gioi han nay, chu tran theo do rong cot.
export function Clip({ max, title, children, className = "" }: { max: string; title?: string; children: ReactNode; className?: string }) {
  return <span className={`tbl-clip block truncate ${max} ${className}`} title={title}>{children}</span>;
}

const MIN_W = 48;
const STORAGE_PREFIX = "tbl_col_w:";

function loadWidths(key?: string): Record<string, number> {
  if (!key) return {};
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function Table<T>({
  columns, rows, rowKey, onRowClick, emptyText = "Không có dữ liệu", sort, onSort, rowClassName, nowrap, resizeKey,
}: TableProps<T>) {
  const { t } = useTranslation();
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(resizeKey));
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);
  // Chan click "sap xep" ngay sau khi tha chuot keo cot (su kien click noi bot len nut tieu de).
  const vuaKeo = useRef(false);

  useEffect(() => {
    if (!resizeKey) return;
    try {
      if (Object.keys(widths).length) localStorage.setItem(STORAGE_PREFIX + resizeKey, JSON.stringify(widths));
      else localStorage.removeItem(STORAGE_PREFIX + resizeKey);
    } catch { /* ignore */ }
  }, [widths, resizeKey]);

  const batDauKeo = (e: ReactPointerEvent<HTMLSpanElement>, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.parentElement as HTMLElement;
    drag.current = { key, startX: e.clientX, startW: th.getBoundingClientRect().width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dangKeo = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    const w = Math.max(MIN_W, Math.round(d.startW + e.clientX - d.startX));
    setWidths((p) => (p[d.key] === w ? p : { ...p, [d.key]: w }));
  };
  const thaKeo = () => {
    if (drag.current) { vuaKeo.current = true; setTimeout(() => { vuaKeo.current = false; }, 0); }
    drag.current = null;
  };
  const datLai = (key: string) => setWidths((p) => { const n = { ...p }; delete n[key]; return n; });

  const styleOf = (key: string): CSSProperties | undefined => {
    const w = widths[key];
    return w ? { width: w, minWidth: w, maxWidth: w } : undefined;
  };
  // Cot da tu chinh do rong: noi dung cat "..." theo dung do rong do (bo max-w mac dinh cua Clip).
  const fitCls = (key: string) => (widths[key] ? "overflow-hidden text-ellipsis [&_.tbl-clip]:max-w-none" : "");

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-xs font-semibold text-ink-soft">
            {columns.map((col) => {
              const active = onSort && col.sortKey && sort?.field === col.sortKey;
              const resizable = !!resizeKey && !col.noResize;
              return (
                <th
                  key={col.key}
                  style={styleOf(col.key)}
                  className={`whitespace-nowrap px-3 py-2.5 ${resizable ? "group/th relative" : ""} ${fitCls(col.key)} ${col.className ?? ""}`}
                >
                  {onSort && col.sortKey ? (
                    <button
                      type="button"
                      onClick={() => { if (!vuaKeo.current) onSort(col.sortKey!); }}
                      className={`flex items-center gap-1 hover:text-accent ${active ? "text-accent" : ""}`}
                    >
                      {col.header}
                      <span className="text-[10px]">{active ? (sort!.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </button>
                  ) : (
                    col.header
                  )}
                  {resizable && (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      title={t("common.resizeColumn")}
                      onPointerDown={(e) => batDauKeo(e, col.key)}
                      onPointerMove={dangKeo}
                      onPointerUp={thaKeo}
                      onPointerCancel={thaKeo}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => { e.stopPropagation(); datLai(col.key); }}
                      className="absolute inset-y-0 -right-1.5 z-10 flex w-3 cursor-col-resize touch-none select-none justify-center"
                    >
                      <span className="my-1.5 w-0.5 rounded-full bg-line-strong transition-colors group-hover/th:bg-accent/50 hover:!bg-accent" />
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-ink-soft">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-line last:border-0 ${onRowClick ? "cursor-pointer" : ""} ${rowClassName ? rowClassName(row) : onRowClick ? "hover:bg-accent-soft/60" : ""}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={styleOf(col.key)}
                  className={`px-3 py-2 align-middle text-ink-body ${nowrap ? "whitespace-nowrap" : ""} ${fitCls(col.key)} ${col.className ?? ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {resizeKey && Object.keys(widths).length > 0 && (
        <div className="mt-1.5 text-right">
          <button type="button" onClick={() => setWidths({})} className="text-xs font-medium text-accent hover:underline">
            {t("common.resetColumnWidths")}
          </button>
        </div>
      )}
    </div>
  );
}
