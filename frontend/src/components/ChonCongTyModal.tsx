import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./ui/Modal";
import { NGUON_OPTIONS } from "../modules/KhieuNaiForm";

// Chan man hinh bat buoc chon cong ty sau dang nhap lan dau (user.cong_ty == null) - khong cho dong
// (onClose no-op) de dam bao moi user deu co cong_ty truoc khi dung app (dung lam mac dinh Nguon).
export function ChonCongTyModal() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (value: string) => {
    setBusy(value);
    try {
      await api.patch("/auth/me", { cong_ty: value });
      auth.refetch();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={() => {}} width="md">
      <div className="p-6 text-center">
        <h2 className="mb-2 text-lg font-bold text-ink">{t("congTyPicker.title")}</h2>
        <p className="mb-5 text-sm text-ink-soft">{t("congTyPicker.body")}</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {NGUON_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={busy !== null}
              onClick={() => void choose(o.value)}
              className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm font-semibold text-ink-body hover:border-accent hover:bg-accent-soft hover:text-accent-ink disabled:opacity-60"
            >
              {busy === o.value ? "…" : o.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
