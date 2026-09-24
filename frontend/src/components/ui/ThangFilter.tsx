// Bo chon "thang" dung chung cho Trang chu + Bao cao: mac dinh rong ("") = thang hien tai (server
// tu tinh), chon 1 thang cu the qua <input type="month"> se gioi han so lieu chi con ca da dong/huy
// trong thang do (xem backend/src/lib/thangFilter.ts) - tranh phai quet toan bo lich su khieu nai.
interface ThangFilterProps {
  value: string;
  onChange: (v: string) => void;
}

export function ThangFilter({ value, onChange }: ThangFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("")}
        className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:px-2.5 lg:py-1 lg:text-xs ${
          value === "" ? "bg-accent text-white" : "bg-surface-2 text-ink-soft ring-1 ring-inset ring-line hover:bg-accent-soft hover:text-accent-ink"
        }`}
      >
        Tháng hiện tại
      </button>
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/15 lg:px-2 lg:py-1 lg:text-xs"
      />
    </div>
  );
}
