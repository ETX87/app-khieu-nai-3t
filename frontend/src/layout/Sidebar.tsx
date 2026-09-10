import { useState } from "react";
import { api } from "../api/client";
import type { AppUser } from "../api/types";
import { MODULE_LABELS, NAV_GROUPS, type ModuleKey } from "./navConfig";
import { NAV_ICONS } from "./BottomNav";
import { NotificationBell } from "./NotificationBell";
import { APP_VERSION } from "../version";

interface SidebarProps {
  modules: ModuleKey[];
  active: ModuleKey;
  onSelect: (m: ModuleKey) => void;
  user: AppUser;
  open: boolean;
  onClose: () => void;
  onOpenDetail: (id: string) => void;
}

const ROLE_LABEL: Record<string, string> = {
  Admin: "Admin",
  Viewer: "Viewer",
  CSKH: "CSKH",
  "NV Sale": "NV Sale",
  "Tổng đài viên": "Tổng đài viên",
  "TN CSKH": "TN CSKH",
  QL: "Quản lý",
};

const COLLAPSED_KEY = "khieunai_sidebar_collapsed";

// Luu y: `collapsed` chi co y nghia tren desktop (md+) - o mobile sidebar la drawer toan man
// nen luon hien day du, ke ca khi nguoi dung tung thu gon tren desktop. Vi vay moi cho an chu
// dung "md:hidden" (khong dung dieu kien JS !collapsed) de khong lam vo giao dien mobile.
function NavButton({
  moduleKey, active, onSelect, collapsed,
}: { moduleKey: ModuleKey; active: boolean; onSelect: (m: ModuleKey) => void; collapsed: boolean }) {
  return (
    <button
      onClick={() => onSelect(moduleKey)}
      title={collapsed ? MODULE_LABELS[moduleKey] : undefined}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
        collapsed ? "md:justify-center" : ""
      } ${active ? "bg-accent-soft text-accent" : "text-ink hover:bg-gray-100"}`}
    >
      <span className="shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]">{NAV_ICONS[moduleKey]}</span>
      <span className={collapsed ? "md:hidden" : ""}>{MODULE_LABELS[moduleKey]}</span>
    </button>
  );
}

const ChevronIcon = ({ flipped }: { flipped: boolean }) => (
  <svg
    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={`shrink-0 transition-transform ${flipped ? "rotate-180" : ""}`}
  >
    <path d="M15 6 9 12l6 6" />
  </svg>
);

export function Sidebar({ modules, active, onSelect, user, open, onClose, onOpenDetail }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      window.location.href = "/";
    }
  };

  const has = (m: ModuleKey) => modules.includes(m);

  const select = (m: ModuleKey) => {
    onSelect(m);
    onClose();
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-line bg-surface transition-all duration-200 ease-in-out md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-16" : "md:w-64"}`}
      >
        <div className={`flex items-center gap-3 border-b border-line px-4 py-4 ${collapsed ? "md:justify-center md:px-2" : ""}`}>
          <img src="/icon-192.png" alt="3T" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className={`min-w-0 flex-1 ${collapsed ? "md:hidden" : ""}`}>
            <h1 className="truncate text-sm font-bold text-ink">Tiếp nhận phản ánh 3T</h1>
            <p className="truncate text-xs text-ink-soft">Tiếp nhận · Xử lý · Đồng hành</p>
          </div>
          <div className="hidden shrink-0 md:block">
            <NotificationBell onOpenDetail={onOpenDetail} />
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng menu"
            className="rounded-md p-1 text-ink-soft hover:bg-gray-100 md:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {(has("trang-chu") || has("bao-cao")) && (
            <div className="space-y-1">
              {has("trang-chu") && (
                <NavButton moduleKey="trang-chu" active={active === "trang-chu"} onSelect={select} collapsed={collapsed} />
              )}
              {has("bao-cao") && (
                <NavButton moduleKey="bao-cao" active={active === "bao-cao"} onSelect={select} collapsed={collapsed} />
              )}
            </div>
          )}

          {NAV_GROUPS.map((group) => {
            const visible = group.modules.filter(has);
            if (visible.length === 0) return null;
            return (
              <div key={group.label} className="space-y-1">
                <p className={`px-3 text-xs font-semibold uppercase tracking-wide text-ink-soft ${collapsed ? "md:hidden" : ""}`}>
                  {group.label}
                </p>
                {visible.map((m) => (
                  <NavButton key={m} moduleKey={m} active={active === m} onSelect={select} collapsed={collapsed} />
                ))}
              </div>
            );
          })}
        </nav>

        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
          title={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
          className="hidden items-center justify-center gap-1.5 border-t border-line py-2 text-xs font-medium text-ink-soft hover:bg-gray-100 hover:text-ink md:flex"
        >
          <ChevronIcon flipped={collapsed} />
          <span className={collapsed ? "md:hidden" : ""}>Thu gọn</span>
        </button>

        <div className={`border-t border-line px-3 py-3 ${collapsed ? "md:px-2 md:text-center" : ""}`}>
          <p className={`truncate text-sm font-medium text-ink ${collapsed ? "md:hidden" : ""}`}>{user.ten ?? user.email}</p>
          <p className={`text-xs text-ink-soft ${collapsed ? "md:hidden" : "mb-2"}`}>{ROLE_LABEL[user.vai_tro ?? ""] ?? "Chưa gán vai trò"}</p>
          <button onClick={logout} title="Đăng xuất" className="text-xs font-medium text-accent hover:underline">
            <span className={collapsed ? "md:hidden" : ""}>Đăng xuất</span>
            <span className={collapsed ? "hidden md:inline" : "hidden"}>⎋</span>
          </button>
          <p className="mt-2 text-[10px] text-ink-faint">
            <span className={collapsed ? "md:hidden" : ""}>Phiên bản {APP_VERSION}</span>
            <span className={collapsed ? "hidden md:inline" : "hidden"}>{APP_VERSION}</span>
          </p>
        </div>
      </aside>
    </>
  );
}
