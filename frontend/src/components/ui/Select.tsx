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
      className={`w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-gray-100 disabled:text-gray-400 ${className}`}
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
