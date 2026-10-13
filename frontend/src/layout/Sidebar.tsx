import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AppUser } from "../api/types";
import { MODULE_I18N_KEY, NAV_GROUPS, type ModuleKey } from "./navConfig";
import { NAV_ICONS } from "./BottomNav";
import { NotificationBell } from "./NotificationBell";
import { APP_VERSION } from "../version";
import { NGUON_OPTIONS } from "../modules/KhieuNaiForm";

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
  const { t } = useTranslation();
  const label = t(MODULE_I18N_KEY[moduleKey]);
  return (
    <button
      onClick={() => onSelect(moduleKey)}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-3 text-left text-base font-medium transition-colors md:py-2.5 md:text-[13.5px] ${
        collapsed ? "md:justify-center" : ""
      } ${active ? "bg-white/[0.22] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
    >
      <span className="shrink-0 [&_svg]:h-[22px] [&_svg]:w-[22px] md:[&_svg]:h-[18px] md:[&_svg]:w-[18px]">{NAV_ICONS[moduleKey]}</span>
      <span className={collapsed ? "md:hidden" : ""}>{label}</span>
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
  const { t, i18n } = useTranslation();
  const auth = useAuth();
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

  const changeCongTy = async (v: string) => {
    await api.patch("/auth/me", { cong_ty: v });
    auth.refetch();
  };
  const changeNgonNgu = async (v: string) => {
    await api.patch("/auth/me", { ngon_ngu: v });
    void i18n.changeLanguage(v);
    auth.refetch();
  };
  const selCls = "w-full rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs text-white [&>option]:text-ink";

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
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col bg-sidebar text-white shadow-xl transition-all md:shadow-none duration-200 ease-in-out md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-16" : "md:w-64"}`}
      >
        <div className={`flex items-center gap-3 border-b border-white/10 px-4 py-4 ${collapsed ? "md:justify-center md:px-2" : ""}`}>
          <img src="/icon-192.png" alt="3T" className="h-10 w-10 shrink-0 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.25)] ring-1 ring-white/30" />
          <div className={`min-w-0 flex-1 ${collapsed ? "md:hidden" : ""}`}>
            <h1 className="truncate text-base font-bold text-white">{t("sidebar.appTitle")}</h1>
            <p className="truncate text-xs text-white/70">{t("sidebar.appSubtitle")}</p>
          </div>
          <div className="hidden shrink-0 md:block">
            <NotificationBell onOpenDetail={onOpenDetail} onDark />
          </div>
          <button
            onClick={onClose}
            aria-label={t("sidebar.closeMenu")}
            className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white md:hidden"
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
              <div key={group.labelKey} className="space-y-1">
                <p className={`px-3.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-white/55 ${collapsed ? "md:hidden" : ""}`}>
                  {t(group.labelKey)}
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
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          className="hidden items-center justify-center gap-1.5 border-t border-white/10 py-2 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white md:flex"
        >
          <ChevronIcon flipped={collapsed} />
          <span className={collapsed ? "md:hidden" : ""}>{t("sidebar.collapseShort")}</span>
        </button>

        <div className={`border-t border-white/10 px-4 py-3 ${collapsed ? "md:px-2 md:text-center" : ""}`}>
          <p className={`truncate text-sm font-semibold text-white ${collapsed ? "md:hidden" : ""}`}>{user.ten ?? user.email}</p>
          <p className={`text-xs text-white/70 ${collapsed ? "md:hidden" : "mb-2"}`}>{ROLE_LABEL[user.vai_tro ?? ""] ?? t("sidebar.noRole")}</p>
          <div className={`mb-2 flex flex-col gap-1.5 ${collapsed ? "md:hidden" : ""}`}>
            <label className="text-left text-[10px] font-semibold uppercase tracking-wide text-white/50">
              {t("sidebar.congTy")}
              <select className={`mt-0.5 ${selCls}`} value={user.cong_ty ?? ""} onChange={(e) => void changeCongTy(e.target.value)}>
                {NGUON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-left text-[10px] font-semibold uppercase tracking-wide text-white/50">
              {t("sidebar.ngonNgu")}
              <select className={`mt-0.5 ${selCls}`} value={user.ngon_ngu} onChange={(e) => void changeNgonNgu(e.target.value)}>
                <option value="vi">{t("ngonNguPicker.vi")}</option>
                <option value="en">{t("ngonNguPicker.en")}</option>
                <option value="id">{t("ngonNguPicker.id")}</option>
              </select>
            </label>
          </div>
          <button onClick={logout} title={t("sidebar.logout")} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20">
            <span className={collapsed ? "md:hidden" : ""}>{t("sidebar.logout")}</span>
            <span className={collapsed ? "hidden md:inline" : "hidden"}>⎋</span>
          </button>
          <p className="mt-2 text-[10px] text-white/50">
            <span className={collapsed ? "md:hidden" : ""}>{t("sidebar.version")} {APP_VERSION}</span>
            <span className={collapsed ? "hidden md:inline" : "hidden"}>{APP_VERSION}</span>
          </p>
        </div>
      </aside>
    </>
  );
}
