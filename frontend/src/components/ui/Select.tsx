import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
}

export function Select({ options, placeholder, className = "", ...rest }: SelectProps) {
  return (
    <select
      className={`w-full rounded-md border border-field-border bg-field-bg px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-ink-faint ${className}`}
      {...rest}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
