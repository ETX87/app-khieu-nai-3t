import { useEffect, type ReactNode } from "react";

// Truot tu canh phai (giong pattern da kiem thu ben linh-kien-app) thay vi popover neo theo nut bam -
// tranh bug bi cat/che khi container cha co overflow-hidden hoac khong du cho ngang (item: chuong
// thong bao tren mobile bi hien thi sai do dung popover absolute truoc day).
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-[24rem]",
  footer,
  headerExtra,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
  headerExtra?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className={`drawer-in fixed inset-y-0 right-0 z-50 flex w-full ${width} flex-col bg-surface shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="truncate text-sm font-bold text-ink">{title}</h3>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <button type="button" onClick={onClose} className="rounded-lg p-2.5 text-ink-soft hover:bg-accent-soft hover:text-accent-ink lg:p-1.5" aria-label="Đóng">
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-surface px-4 py-3">{footer}</div>}
      </div>
    </>
  );
}
