import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "touch";
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-brand hover:bg-accent-dark disabled:opacity-40 disabled:shadow-none",
  secondary: "bg-surface text-ink-body border border-line-strong hover:border-brand-300 hover:bg-accent-soft hover:text-accent-ink disabled:text-ink-faint disabled:hover:border-line-strong disabled:hover:bg-surface",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "bg-transparent text-ink-body hover:bg-accent-soft hover:text-accent-ink disabled:text-ink-faint",
};

// "touch" (2026-09-22): nut hanh dong chinh tren mobile (Luu/Tiep nhan/Sua...) - cao ~48-50px du
// nguong tap-target khuyen nghi cho nguoi lon tuoi, tu dong tra ve dung kich thuoc "md" cu tren
// desktop (lg:) - khong doi mat do man hinh van phong. "sm"/"md" giu nguyen KHONG responsive vi
// nhieu noi co chu y dung nut nho o moi kich thuoc man hinh (nut hanh dong trong bang, nut sao chep).
const SIZE_CLASSES: Record<NonNullable<BtnProps["size"]>, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
  touch: "px-5 py-3 text-base lg:px-3.5 lg:py-2 lg:text-sm",
};

export function Btn({ variant = "secondary", size = "md", className = "", ...rest }: BtnProps) {
  const sizeClasses = SIZE_CLASSES[size];
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/25 disabled:cursor-not-allowed ${sizeClasses} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
