type Variant = "anonymous" | "pending" | "rejected" | "disabled";

const MESSAGES: Record<Exclude<Variant, "anonymous">, string> = {
  pending: "Tài khoản đang chờ Admin duyệt",
  rejected: "Tài khoản bị từ chối",
  disabled: "Tài khoản bị khóa",
};

export function LoginScreen({ variant }: { variant: Variant }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 text-center shadow-sm">
        <img src="/icon-192.png" alt="3T" className="mx-auto mb-4 h-14 w-14 rounded-xl" />
        <h1 className="mb-1 text-lg font-semibold text-ink">3T — Tiếp nhận · Xử lý · Đồng hành</h1>
        <p className="mb-6 text-sm text-ink-soft">Hệ thống ghi nhận khiếu nại bảo hành máy lọc nước Karofi</p>

        {variant === "anonymous" ? (
          <div className="flex flex-col gap-2">
            <a
              href="/api/auth/login"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
            >
              Đăng nhập với Google
            </a>
            {import.meta.env.DEV && (
              <a
                href="/api/auth/dev-login"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-gray-50"
              >
                Đăng nhập dev (bypass)
              </a>
            )}
          </div>
        ) : (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-300">
            {MESSAGES[variant]}
          </p>
        )}
      </div>
    </div>
  );
}
