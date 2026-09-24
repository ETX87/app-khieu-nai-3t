import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: "md" | "lg" | "xl" | "full";
  panelClassName?: string; // vd vien/nen theo muc do + KH VIP tren khung popup ngoai cung
}

const WIDTH_CLASSES: Record<"md" | "lg" | "xl", string> = {
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Mac dinh "bg-surface" (item: KHONG duoc dat bg-surface CO DINH cung voi panelClassName tren
// cung 1 element - 2 class bg-* cung specificity se "an nhau" theo thu tu CSS duoc Tailwind sinh ra
// (alphabet theo ten mau), khong theo thu tu trong className string -> co mau (vd bg-red-50) bi
// bg-surface de len tren mot cach ngau nhien tuy ten mau. Vi vay chi duy nhat 1 class bg-* duoc
// dat tren panel, luon di qua panelClassName (mac dinh "bg-surface" khi khong co gi khac).
export function Modal({ open, onClose, title, actions, children, width = "lg", panelClassName = "bg-surface" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  // Luon giu ban moi nhat cua onClose ma KHONG dua vao mang deps cua effect ben duoi - onClose thuong
  // la ham inline (vd `onClose={() => setOpen(false)}`) nen doi tham chieu MOI LAN component cha
  // render lai. Neu de thang trong deps, effect (va logic "cuop" focus vao phan tu focus-duoc DAU
  // TIEN trong modal) se chay lai moi lan cha render lai vi ly do BAT KY - vd nguoi dung go 1 ky tu
  // vao textarea lam cha doi state khac -> focus nhay khoi o dang go sang nut dau tien trong modal
  // (thuong la "Huy") ngay giua luc go, phai bam chuot lai vao o nhap (bug bao 2026-09-21).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;

    // Khoá cuộn nền.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Đưa focus vào modal.
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (n) => n.offsetParent !== null,
        );
        if (nodes.length === 0) return;
        const firstEl = nodes[0];
        const lastEl = nodes[nodes.length - 1];
        const activeEl = document.activeElement as HTMLElement;
        if (e.shiftKey && activeEl === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && activeEl === lastEl) {
          e.preventDefault();
          firstEl.focus();
        } else if (!panelRef.current.contains(activeEl)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      prevFocus.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // "full": popup chiếm ~95% màn hình (95vh × 97vw). Giữ bẫy focus / khoá cuộn / Esc.
  //  - không truyền `title` → bare, nội dung con tự dựng header + vùng cuộn (màn Chi tiết KN).
  //  - có `title` → thanh tiêu đề + ✕ mặc định + vùng cuộn (màn Tạo KN).
  if (width === "full") {
    // Co `title` (man Tao KN): tren mobile chiem tron man hinh (chua cho tai tho/thanh cu chi vi
    // viewport-fit=cover), desktop (lg:) giu popup 95% nhu cu.
    const fullscreenMobile = title !== undefined;
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${
          fullscreenMobile ? "lg:p-4" : "p-2 sm:p-4"
        }`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className={`flex max-w-[1700px] flex-col overflow-hidden shadow-2xl outline-none transition-colors duration-300 ${
            fullscreenMobile
              ? "h-[100dvh] w-full pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] lg:h-[95vh] lg:w-[97vw] lg:rounded-xl lg:pb-0 lg:pt-0"
              : "h-[95vh] w-[97vw] rounded-xl"
          } ${panelClassName}`}
        >
          {title === undefined ? (
            children
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5">
                <h2 className="text-base font-bold text-ink">{title}</h2>
                <div className="ml-auto flex items-center gap-3">
                  {actions}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-2.5 text-ink-soft hover:bg-accent-soft hover:text-accent-ink lg:p-1.5"
                    aria-label="Đóng"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`w-full ${WIDTH_CLASSES[width]} rounded-xl shadow-xl outline-none transition-colors duration-300 ${panelClassName}`}
      >
        {title === undefined ? (
          <div className="max-h-[85vh] overflow-y-auto">{children}</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              <h2 className="text-base font-bold text-ink">{title}</h2>
              <div className="ml-auto flex items-center gap-3">
                {actions}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1 text-ink-soft hover:bg-accent-soft hover:text-accent-ink"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="max-h-[80vh] overflow-y-auto px-5 py-4">{children}</div>
          </>
        )}
      </div>
    </div>
  );
}
