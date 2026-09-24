type Variant = "anonymous" | "pending" | "rejected" | "disabled";

const MESSAGES: Record<Exclude<Variant, "anonymous">, string> = {
  pending: "Tài khoản đang chờ Admin duyệt",
  rejected: "Tài khoản bị từ chối",
  disabled: "Tài khoản bị khóa",
};

export function LoginScreen({ variant }: { variant: Variant }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-100 via-bg to-brand-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-pop">
        <img src="/icon-192.png" alt="3T" className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-brand" />
        <h1 className="mb-1 text-xl font-bold text-ink">Tiếp nhận phản ánh 3T</h1>
        <p className="mb-6 text-sm text-ink-soft">Hệ thống ghi nhận phản ánh bảo hành máy lọc nước Karofi</p>

        {variant === "anonymous" ? (
          <div className="flex flex-col gap-2">
            <a
              href="/api/auth/login"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-brand hover:bg-accent-dark"
            >
              Đăng nhập với Google
            </a>
            {import.meta.env.DEV && (
              <a
                href="/api/auth/dev-login"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
              >
                Đăng nhập dev (bypass)
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-300">
              {MESSAGES[variant]}
            </p>
            <p className="text-xs text-ink-soft">
              Cần hỗ trợ? Liên hệ quản trị viên:{" "}
              <a href="mailto:smarttrade.vp@gmail.com" className="font-medium text-accent">smarttrade.vp@gmail.com</a>
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
              >
                Kiểm tra lại
              </button>
              <a
                href="/api/auth/login"
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
              >
                Đăng nhập tài khoản khác
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
