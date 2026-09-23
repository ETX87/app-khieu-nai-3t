import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { SelectOption } from "./Select";

interface ComboboxProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  creatable?: boolean;
  onCreate?: (value: string) => Promise<void> | void;
  id?: string;
  clearable?: boolean; // false: khong hien dong "xoa lua chon" (vd bo loc sap xep luon phai co gia tri)
  inputClassName?: string; // thay class mac dinh cua o nhap (vd o loc tren thanh cong cu, gon hon)
}

// Bo dau tieng Viet de go "bui" van tim ra "Bùi", "dang" ra "Đặng".
export function foldVi(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

const BASE_CLS =
  "w-full rounded-md border border-field-border bg-field-bg px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-ink-faint lg:px-2.5 lg:py-1.5 lg:text-sm";

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
  id,
  clearable = true,
  inputClassName,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  // Danh sach dropdown portal ra document.body (item: sua bug bi cac khung overflow-y-auto ben
  // ngoai - vd EditDialog, Modal - cat mat khi Combobox nam gan day khung cuon). Vi tri tinh lai
  // theo input moi lan mo + khi cuon/resize de bam sat dung o.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Chặn onBlur xử lý lại khi vừa chọn xong bằng Enter/Tab/click.
  const justCommitted = useRef(false);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? value ?? "",
    [options, value],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (q === "") return options;
    const fq = foldVi(q);
    return options.filter((o) => foldVi(o.label).includes(fq));
  }, [options, q]);
  // Khop "tuong duong" = giong nhau sau khi bo dau/hoa-thuong ("dak nong" ~ "Đắk Nông") - de go khong
  // dau van chon dung muc san co, khong tao ra ban trung sai chinh ta.
  const exactMatch = useMemo(
    () => (q === "" ? undefined : options.find((o) => foldVi(o.label.trim()) === foldVi(q))),
    [options, q],
  );
  const canCreateNew = !!creatable && q !== "" && !exactMatch;
  // Số dòng "chọn được": [xoá lựa chọn?] + filtered + [tạo mới?]
  const rows: Array<{ kind: "clear" | "option" | "create"; value?: string; label: string }> = [];
  if (clearable && value !== "") rows.push({ kind: "clear", label: placeholder });
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
      const t = e.target as Node;
      const inRoot = !!rootRef.current?.contains(t);
      const inList = !!listRef.current?.contains(t);
      if (!inRoot && !inList) commitAndClose();
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  useLayoutEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

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
    const exact = options.find((o) => foldVi(o.label.trim()) === foldVi(typed));
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
        id={id}
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
        className={inputClassName ?? BASE_CLS}
      />
      {open && !disabled && pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-[200] max-h-56 overflow-y-auto rounded-md border border-line bg-white py-0.5 shadow-lg"
          >
            {rows.length === 0 && (
              <li className="px-3 py-2.5 text-base text-ink-soft lg:py-2 lg:text-sm">Không tìm thấy kết quả.</li>
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
                  className={`block w-full px-3 py-2.5 text-left text-base lg:py-1.5 lg:text-sm ${
                    idx === highlight ? "bg-accent-soft text-accent" : "text-ink"
                  } ${r.kind === "clear" ? "text-ink-soft" : ""} ${
                    r.kind === "create" ? "border-t border-line font-medium text-accent" : ""
                  } ${r.kind === "option" && r.value === value ? "font-medium" : ""}`}
                >
                  {r.kind === "create" && creating ? "Đang thêm..." : r.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
