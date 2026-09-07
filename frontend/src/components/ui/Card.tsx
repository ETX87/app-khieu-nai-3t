import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  actions?: ReactNode;
}

export function Card({ title, actions, children, className = "", ...rest }: CardProps) {
  return (
    <div className={`rounded-lg border border-line bg-surface shadow-sm ${className}`} {...rest}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
