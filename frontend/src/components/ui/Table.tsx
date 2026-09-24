import type { ReactNode } from "react";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  sortKey?: string; // co gia tri -> header bam duoc de sap xep (item: sort theo cot)
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
}

export function Table<T>({
  columns, rows, rowKey, onRowClick, emptyText = "Không có dữ liệu", sort, onSort, rowClassName,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-xs font-semibold text-ink-soft">
            {columns.map((col) => {
              const active = onSort && col.sortKey && sort?.field === col.sortKey;
              return (
                <th key={col.key} className={`whitespace-nowrap px-3 py-2.5 ${col.className ?? ""}`}>
                  {onSort && col.sortKey ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.sortKey!)}
                      className={`flex items-center gap-1 hover:text-accent ${active ? "text-accent" : ""}`}
                    >
                      {col.header}
                      <span className="text-[10px]">{active ? (sort!.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </button>
                  ) : (
                    col.header
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
                <td key={col.key} className={`px-3 py-2 align-middle text-ink-body ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
