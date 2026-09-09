export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

// Học theo phong cách tab bên hệ dvbh (Tabs.tsx): chỉ hiện badge số khi count > 0 - tab
// rỗng không cần "(0)" gây rối, vừa gọn hàng tab vừa làm nổi bật tab có dữ liệu thật.
export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const isActive = active === t.key;
        const hasCount = !!t.count;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "border-accent text-accent"
                : hasCount
                  ? "border-transparent text-ink hover:text-ink"
                  : "border-transparent text-ink-faint hover:text-ink-soft"
            }`}
          >
            {t.label}
            {hasCount && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {t.count! > 99 ? "99+" : t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
