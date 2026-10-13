import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth/AuthContext";
import { SessionExpiredOverlay } from "./auth/SessionExpiredOverlay";
import { LoginScreen } from "./login/LoginScreen";
import { ChonCongTyModal } from "./components/ChonCongTyModal";
import { Sidebar } from "./layout/Sidebar";
import { BottomNav } from "./layout/BottomNav";
import { NotificationBell } from "./layout/NotificationBell";
import { ROLE_MODULES, DEFAULT_MODULES, type ModuleKey } from "./layout/navConfig";
import { HomeModule } from "./modules/HomeModule";
import { KhieuNaiModule } from "./modules/KhieuNaiModule";
import { BaoCaoModule } from "./modules/BaoCaoModule";
import { SettingsModule } from "./modules/SettingsModule";
import { UsersModule } from "./modules/UsersModule";
import type { AppUser } from "./api/types";

const ACTIVE_MODULE_KEY = "khieunai_active_module";

function MainApp({ user }: { user: AppUser }) {
  const { t } = useTranslation();
  const modules = user.vai_tro ? ROLE_MODULES[user.vai_tro] : DEFAULT_MODULES;

  const [active, setActive] = useState<ModuleKey>(() => {
    const saved = localStorage.getItem(ACTIVE_MODULE_KEY) as ModuleKey | null;
    if (saved && modules.includes(saved)) return saved;
    return modules[0] ?? "trang-chu";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Bộ lọc khởi tạo cho màn Phản ánh khi mở từ KPI Trang chủ. Đổi tham chiếu mỗi lần điều hướng.
  const [listFilter, setListFilter] = useState<{
    trang_thai?: string; chua_dong_bo?: string; cho_tn_cskh?: boolean; qua_han_giai_trinh?: boolean;
  } | null>(null);
  // Mo thang 1 don cu the tu chuong thong bao - object moi moi lan bam de useEffect trong
  // KhieuNaiModule luon nhan biet duoc kich hoat lai (ke ca bam trung 1 thong bao 2 lan lien tiep).
  const [openDetailRequest, setOpenDetailRequest] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (!modules.includes(active)) {
      setActive(modules[0] ?? "trang-chu");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.vai_tro]);

  const selectModule = (m: ModuleKey) => {
    setActive(m);
    localStorage.setItem(ACTIVE_MODULE_KEY, m);
  };

  const openList = (filter: { trang_thai?: string; chua_dong_bo?: string; cho_tn_cskh?: boolean; qua_han_giai_trinh?: boolean }) => {
    setListFilter({ ...filter });
    selectModule("khieu-nai");
  };

  const openDetail = (id: string) => {
    setOpenDetailRequest({ id });
    selectModule("khieu-nai");
  };

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        modules={modules}
        active={active}
        onSelect={selectModule}
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenDetail={openDetail}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-sidebar px-4 py-3 text-white shadow-brand md:hidden">
          <img src="/icon-192.png" alt="3T" className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-white/30" />
          <span className="text-base font-bold">{t("sidebar.appTitle")}</span>
          <div className="ml-auto">
            <NotificationBell onOpenDetail={openDetail} onDark />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-20 sm:p-6 md:pb-6">
          {active === "trang-chu" && (
            <HomeModule user={user} onOpenList={openList} onOpenModule={selectModule} />
          )}
          {active === "khieu-nai" && (
            <KhieuNaiModule user={user} initialFilter={listFilter} openDetailRequest={openDetailRequest} />
          )}
          {active === "bao-cao" && <BaoCaoModule user={user} />}
          {active === "settings" && user.vai_tro === "Admin" && <SettingsModule />}
          {active === "users" && user.vai_tro === "Admin" && <UsersModule user={user} />}
        </main>
      </div>
      <BottomNav modules={modules} active={active} onSelect={selectModule} onMore={() => setSidebarOpen(true)} />
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const { i18n } = useTranslation();

  // Dong bo ngon ngu hien thi theo luu o tai khoan - chay khi dang nhap xong hoac sau khi doi ngon
  // ngu qua switcher (AuthContext refetch() cap nhat lai auth.user.ngon_ngu).
  useEffect(() => {
    if (auth.user?.ngon_ngu && auth.user.ngon_ngu !== i18n.language) {
      void i18n.changeLanguage(auth.user.ngon_ngu);
    }
  }, [auth.user?.ngon_ngu, i18n]);

  if (auth.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent" />
      </div>
    );
  }

  if (auth.status === "anonymous") return <LoginScreen variant="anonymous" />;
  if (auth.status === "pending") return <LoginScreen variant="pending" />;
  if (auth.status === "rejected") return <LoginScreen variant="rejected" />;
  if (auth.status === "disabled") return <LoginScreen variant="disabled" />;

  if (!auth.user) return null;

  if (auth.user.cong_ty == null) return <ChonCongTyModal />;

  return (
    <>
      <MainApp user={auth.user} />
      <SessionExpiredOverlay />
    </>
  );
}
