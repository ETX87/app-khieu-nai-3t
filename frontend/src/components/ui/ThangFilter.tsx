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
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
          value === "" ? "bg-accent text-white" : "border border-line bg-white text-ink-soft hover:bg-gray-50"
        }`}
      >
        Tháng hiện tại
      </button>
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
      />
    </div>
  );
}
