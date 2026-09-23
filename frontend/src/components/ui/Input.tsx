import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

// Ô nhập liệu: nền lõm (--field-bg) + viền rõ (--field-border) để người dùng nhận ra
// ngay đây là chỗ cần nhập; khi focus chuyển sang viền + vòng nhấn màu chủ đạo. Kích thước to hơn
// trên mobile (~44-46px cao, chữ text-base) cho người dùng lớn tuổi dễ đọc/bấm; tự trả về đúng
// kích thước cũ trên desktop (lg:) qua override - không đổi mật độ hiển thị ở văn phòng (2026-09-22).
const FIELD_CLS =
  "w-full rounded-md border border-field-border bg-field-bg px-3 py-2.5 text-base text-ink lg:px-2.5 lg:py-1.5 lg:text-sm " +
  "placeholder:text-ink-faint focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 " +
  "disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-ink-faint";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_CLS} ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_CLS} ${className}`} {...rest} />;
}

export function Field({
  label, children, hint, className = "block",
}: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-0.5 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs leading-tight text-ink-faint lg:text-[11px]">{hint}</span>}
    </label>
  );
}
