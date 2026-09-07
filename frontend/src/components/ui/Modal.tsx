import type { ReactNode } from "react";
import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: "md" | "lg" | "xl";
}

const WIDTH_CLASSES: Record<NonNullable<ModalProps["width"]>, string> = {
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({ open, onClose, title, children, width = "lg" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className={`w-full ${WIDTH_CLASSES[width]} rounded-lg bg-surface shadow-xl`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-soft hover:bg-gray-100 hover:text-ink"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
