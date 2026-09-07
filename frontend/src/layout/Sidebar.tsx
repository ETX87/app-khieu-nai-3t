import { api } from "../api/client";
import type { AppUser } from "../api/types";
import { MODULE_LABELS, NAV_GROUPS, type ModuleKey } from "./navConfig";

interface SidebarProps {
  modules: ModuleKey[];
  active: ModuleKey;
  onSelect: (m: ModuleKey) => void;
  user: AppUser;
  open: boolean;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  Admin: "Admin",
  Viewer: "Viewer",
  CSKH: "CSKH",
  KTV: "KTV",
  "TN CSKH": "TN CSKH",
  QL: "Quản lý",
};

function NavButton({ moduleKey, active, onSelect }: { moduleKey: ModuleKey; active: boolean; onSelect: (m: ModuleKey) => void }) {
  return (
    <button
      onClick={() => onSelect(moduleKey)}
      className={`block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
        active ? "bg-accent-soft text-accent" : "text-ink hover:bg-gray-100"
      }`}
    >
      {MODULE_LABELS[moduleKey]}
    </button>
  );
}

export function Sidebar({ modules, active, onSelect, user, open, onClose }: SidebarProps) {
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
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-4">
          <img src="/icon-192.png" alt="3T" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-ink">3T</h1>
            <p className="truncate text-xs text-ink-soft">Tiếp nhận · Xử lý · Đồng hành</p>
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
          {has("trang-chu") && (
            <div className="space-y-1">
              <NavButton moduleKey="trang-chu" active={active === "trang-chu"} onSelect={select} />
            </div>
          )}

          {NAV_GROUPS.map((group) => {
            const visible = group.modules.filter(has);
            if (visible.length === 0) return null;
            return (
              <div key={group.label} className="space-y-1">
                <p className="px-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">{group.label}</p>
                {visible.map((m) => (
                  <NavButton key={m} moduleKey={m} active={active === m} onSelect={select} />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line px-3 py-3">
          <p className="truncate text-sm font-medium text-ink">{user.ten ?? user.email}</p>
          <p className="mb-2 text-xs text-ink-soft">{ROLE_LABEL[user.vai_tro ?? ""] ?? "Chưa gán vai trò"}</p>
          <button onClick={logout} className="text-xs font-medium text-accent hover:underline">
            Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
}
