import { useEffect, useRef, useState } from "react";
import { Select, type SelectOption } from "./Select";

const SEARCH_THRESHOLD = 10;

interface ComboboxProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  creatable?: boolean;
  onCreate?: (value: string) => Promise<void> | void;
}

export function Combobox({ options, value, onChange, placeholder = "— Chọn —", disabled, creatable, onCreate }: ComboboxProps) {
  // Danh sach ngan va khong cho tao moi thi giu nguyen <select> thuong - khong doi UX khong can thiet.
  if (!creatable && options.length <= SEARCH_THRESHOLD) {
    return <Select options={options} placeholder={placeholder} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q === "" ? options : options.filter((o) => o.label.toLowerCase().includes(q));
  const exactMatch = options.some((o) => o.label.toLowerCase() === q);
  const canCreateNew = creatable && q !== "" && !exactMatch;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const create = async () => {
    if (!onCreate || creating) return;
    const gia_tri = query.trim();
    setCreating(true);
    try {
      await onCreate(gia_tri);
      onChange(gia_tri);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        disabled={disabled}
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-gray-100 disabled:text-gray-400"
      />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
          {value !== "" && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick("")}
              className="block w-full px-3 py-1.5 text-left text-sm text-ink-soft hover:bg-gray-50"
            >
              {placeholder}
            </button>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${o.value === value ? "bg-accent-soft text-accent" : "text-ink"}`}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && !canCreateNew && (
            <p className="px-3 py-2 text-sm text-ink-soft">Không tìm thấy kết quả.</p>
          )}
          {canCreateNew && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={create}
              disabled={creating}
              className="block w-full border-t border-line px-3 py-1.5 text-left text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
            >
              {creating ? "Đang thêm..." : `+ Thêm "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
