import type { ReactNode } from "react";
import { MODULE_LABELS, type ModuleKey } from "./navConfig";

const ICON_PROPS = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const NAV_ICONS: Record<ModuleKey, ReactNode> = {
  "trang-chu": (
    <svg {...ICON_PROPS}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  "khieu-nai": (
    <svg {...ICON_PROPS}>
      <path d="M4 5h16v11H8l-4 4V5Z" />
      <path d="M8 9h8M8 12.5h5" />
    </svg>
  ),
  settings: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4.7a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.3 2.7a7.6 7.6 0 0 0-1.7 1l-2.4-.7-2 3.5L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-.7a7.6 7.6 0 0 0 1.7 1L9 21h6l.3-2.7a7.6 7.6 0 0 0 1.7-1l2.4.7 2-3.5-2-1.5Z" />
    </svg>
  ),
  users: (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M15.5 14c2.5.4 4.5 2.6 4.5 6" />
    </svg>
  ),
};

const ACCOUNT_ICON = (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 20c.7-3.6 3.4-5.5 6.5-5.5s5.8 1.9 6.5 5.5" />
  </svg>
);

interface BottomNavProps {
  modules: ModuleKey[];
  active: ModuleKey;
  onSelect: (m: ModuleKey) => void;
  onMore: () => void;
}

export function BottomNav({ modules, active, onSelect, onMore }: BottomNavProps) {
  // Hiện tất cả module (tối đa 4) + một mục "Tài khoản" luôn có (mở ngăn kéo: hồ sơ + đăng xuất).
  const primary = modules.slice(0, 4);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {primary.map((m) => (
        <button
          key={m}
          onClick={() => onSelect(m)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            active === m ? "text-accent" : "text-ink-soft"
          }`}
        >
          {NAV_ICONS[m]}
          <span className="truncate">{MODULE_LABELS[m]}</span>
        </button>
      ))}
      <button onClick={onMore} className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-soft">
        {ACCOUNT_ICON}
        <span>Tài khoản</span>
      </button>
    </nav>
  );
}
