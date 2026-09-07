import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-dark disabled:opacity-40",
  secondary: "bg-white text-ink border border-line hover:bg-gray-50 disabled:text-gray-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "bg-transparent text-ink hover:bg-gray-100 disabled:text-gray-300",
};

export function Btn({ variant = "secondary", size = "md", className = "", ...rest }: BtnProps) {
  const sizeClasses = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${sizeClasses} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
