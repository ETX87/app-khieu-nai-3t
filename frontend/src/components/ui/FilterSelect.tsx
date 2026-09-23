import { Combobox } from "./Combobox";
import type { SelectOption } from "./Select";

// Nguong: bo loc co NHIEU HON 5 lua chon (tinh ca dong "Moi ...") tu dong chuyen sang o go-de-tim
// (Combobox, tim khong dau) - danh sach dai nhu nguoi tiep nhan / nhom van de khong phai cuon tim.
const SEARCH_THRESHOLD = 5;

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  // Nhan cua lua chon rong "" (vd "Mọi người tiếp nhận"). Bo trong = bo loc luon co gia tri (vd sap xep).
  allLabel?: string;
  // Class cua <select> goc tren thanh loc - dung chung cho o tim de 2 kieu nhin dong bo.
  className: string;
}

export function FilterSelect({ value, onChange, options, allLabel, className }: FilterSelectProps) {
  // Dem ca dong "Moi ..." vi nguoi dung nhin thay no nhu 1 lua chon trong danh sach.
  if (options.length + (allLabel !== undefined ? 1 : 0) > SEARCH_THRESHOLD) {
    return (
      <div className="relative w-full sm:w-56 lg:w-48" title={allLabel}>
        <Combobox
          options={options}
          value={value}
          onChange={onChange}
          placeholder={allLabel ?? "— Chọn —"}
          clearable={allLabel !== undefined}
          inputClassName={`${className} w-full pr-7 placeholder:text-ink`}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-soft">▾</span>
      </div>
    );
  }
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
