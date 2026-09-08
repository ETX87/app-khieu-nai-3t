import { useEffect, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { SessionExpiredOverlay } from "./auth/SessionExpiredOverlay";
import { LoginScreen } from "./login/LoginScreen";
import { Sidebar } from "./layout/Sidebar";
import { BottomNav } from "./layout/BottomNav";
import { ROLE_MODULES, DEFAULT_MODULES, type ModuleKey } from "./layout/navConfig";
import { HomeModule } from "./modules/HomeModule";
import { KhieuNaiModule } from "./modules/KhieuNaiModule";
import { SettingsModule } from "./modules/SettingsModule";
import { UsersModule } from "./modules/UsersModule";
import type { AppUser } from "./api/types";

const ACTIVE_MODULE_KEY = "khieunai_active_module";

function MainApp({ user }: { user: AppUser }) {
  const modules = user.vai_tro ? ROLE_MODULES[user.vai_tro] : DEFAULT_MODULES;

  const [active, setActive] = useState<ModuleKey>(() => {
    const saved = localStorage.getItem(ACTIVE_MODULE_KEY) as ModuleKey | null;
    if (saved && modules.includes(saved)) return saved;
    return modules[0] ?? "trang-chu";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        modules={modules}
        active={active}
        onSelect={selectModule}
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <img src="/icon-192.png" alt="3T" className="h-7 w-7 shrink-0 rounded-lg" />
          <span className="text-sm font-bold text-ink">3T</span>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-20 sm:p-6 md:pb-6">
          {active === "trang-chu" && <HomeModule user={user} />}
          {active === "khieu-nai" && <KhieuNaiModule user={user} />}
          {active === "settings" && user.vai_tro === "Admin" && <SettingsModule />}
          {active === "users" && user.vai_tro === "Admin" && <UsersModule />}
        </main>
      </div>
      <BottomNav modules={modules} active={active} onSelect={selectModule} onMore={() => setSidebarOpen(true)} />
    </div>
  );
}

export default function App() {
  const auth = useAuth();

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

  return (
    <>
      <MainApp user={auth.user} />
      <SessionExpiredOverlay />
    </>
  );
}
