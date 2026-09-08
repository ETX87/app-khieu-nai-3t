import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { SelectOption } from "./Select";

interface ComboboxProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  creatable?: boolean;
  onCreate?: (value: string) => Promise<void> | void;
}

const BASE_CLS =
  "w-full rounded-md border border-field-border bg-field-bg px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-ink-faint";

// Combobox điều khiển hoàn toàn bằng bàn phím:
//  - gõ để lọc; ↑/↓ di chuyển; Enter/Tab chọn mục đang tô sáng rồi cho focus đi tiếp;
//  - Esc đóng, giữ giá trị cũ; blur (rời khỏi ô) = commit (khớp / tạo mới / hoàn nguyên).
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "— Chọn —",
  disabled,
  creatable,
  onCreate,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  // Chặn onBlur xử lý lại khi vừa chọn xong bằng Enter/Tab/click.
  const justCommitted = useRef(false);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? value ?? "",
    [options, value],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q === "" ? options : options.filter((o) => o.label.toLowerCase().includes(q))),
    [options, q],
  );
  const exactMatch = useMemo(
    () => options.find((o) => o.label.toLowerCase() === q),
    [options, q],
  );
  const canCreateNew = !!creatable && q !== "" && !exactMatch;
  // Số dòng "chọn được": [xoá lựa chọn?] + filtered + [tạo mới?]
  const rows: Array<{ kind: "clear" | "option" | "create"; value?: string; label: string }> = [];
  if (value !== "") rows.push({ kind: "clear", label: placeholder });
  filtered.forEach((o) => rows.push({ kind: "option", value: o.value, label: o.label }));
  if (canCreateNew) rows.push({ kind: "create", label: `+ Thêm "${query.trim()}"` });

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setHighlight(rows.findIndex((r) => r.kind === "option" && r.value === value) >= 0
      ? rows.findIndex((r) => r.kind === "option" && r.value === value)
      : (rows.length > 0 && rows[0].kind === "clear" ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    // Khi query đổi, đưa tô sáng về dòng chọn-được đầu tiên.
    const first = rows.findIndex((r) => r.kind !== "clear");
    setHighlight(first < 0 ? 0 : first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, options.length]);

  useEffect(() => {
    function onDocPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) commitAndClose();
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const pick = (v: string) => {
    justCommitted.current = true;
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const doCreate = async () => {
    if (!onCreate || creating) return;
    const giaTri = query.trim();
    if (!giaTri) return;
    setCreating(true);
    try {
      await onCreate(giaTri);
      justCommitted.current = true;
      onChange(giaTri);
      setOpen(false);
      setQuery("");
    } finally {
      setCreating(false);
    }
  };

  // Commit khi rời ô mà không bấm chọn: khớp nhãn chính xác -> chọn;
  // creatable + có chữ -> tạo mới; còn lại -> hoàn về giá trị cũ.
  const commitAndClose = () => {
    if (!open) return;
    if (justCommitted.current) {
      justCommitted.current = false;
      setOpen(false);
      return;
    }
    const typed = query.trim();
    if (typed === "") {
      setOpen(false);
      setQuery("");
      return;
    }
    const exact = options.find((o) => o.label.toLowerCase() === typed.toLowerCase());
    if (exact) {
      onChange(exact.value);
    } else if (creatable) {
      void doCreate();
      return;
    }
    // không khớp & không tạo được -> giữ nguyên value cũ
    setOpen(false);
    setQuery("");
  };

  const chooseRow = (idx: number) => {
    const r = rows[idx];
    if (!r) return;
    if (r.kind === "clear") pick("");
    else if (r.kind === "option" && r.value !== undefined) pick(r.value);
    else if (r.kind === "create") void doCreate();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => Math.min(rows.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (open && rows[highlight]) {
        e.preventDefault(); // không cho submit form
        chooseRow(highlight);
      }
      // nếu đang đóng: để Enter cho form xử lý bình thường
    } else if (e.key === "Tab") {
      // Chọn mục đang tô sáng rồi ĐỂ focus đi tiếp tự nhiên (không preventDefault).
      if (open && rows[highlight]) chooseRow(highlight);
      else commitAndClose();
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false); setQuery(""); }
    }
  };

  const displayValue = open ? query : selectedLabel;

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // đợi click option (mousedown đã preventDefault) rồi mới commit
          window.setTimeout(() => {
            if (rootRef.current && rootRef.current.contains(document.activeElement)) return;
            commitAndClose();
          }, 0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={BASE_CLS}
      />
      {open && !disabled && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white py-0.5 shadow-lg"
        >
          {rows.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-soft">Không tìm thấy kết quả.</li>
          )}
          {rows.map((r, idx) => (
            <li key={`${r.kind}-${r.value ?? idx}`} role="option" aria-selected={idx === highlight}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => chooseRow(idx)}
                disabled={r.kind === "create" && creating}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  idx === highlight ? "bg-accent-soft text-accent" : "text-ink"
                } ${r.kind === "clear" ? "text-ink-soft" : ""} ${
                  r.kind === "create" ? "border-t border-line font-medium text-accent" : ""
                } ${r.kind === "option" && r.value === value ? "font-medium" : ""}`}
              >
                {r.kind === "create" && creating ? "Đang thêm..." : r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
