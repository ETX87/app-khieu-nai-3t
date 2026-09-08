import { useEffect, useState } from "react";

// Hien khi phien het han giua chung (su kien tu api/client). Khong xoa state form —
// nguoi dung dang nhap lai o tab hien tai roi quay lai lam tiep.
export function SessionExpiredOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onExpired = () => setOpen(true);
    window.addEventListener("khieunai:session-expired", onExpired);
    return () => window.removeEventListener("khieunai:session-expired", onExpired);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 text-center shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-ink">Phiên đăng nhập đã hết hạn</h2>
        <p className="mb-5 text-sm text-ink-soft">
          Dữ liệu bạn đang nhập vẫn được giữ. Đăng nhập lại rồi quay lại tiếp tục.
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setOpen(false)}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-gray-50"
          >
            Để sau
          </button>
          <a
            href="/api/auth/login"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
          >
            Đăng nhập lại
          </a>
        </div>
      </div>
    </div>
  );
}
