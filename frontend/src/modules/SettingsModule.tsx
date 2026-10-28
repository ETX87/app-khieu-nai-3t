import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api/client";
import type { SettingsNhom } from "../api/types";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/Toast";

const TAB_GROUPS: { group: string; items: { key: SettingsNhom; label: string }[] }[] = [
  {
    group: "Phân loại vấn đề",
    items: [
      { key: "nhom_van_de", label: "Nhóm vấn đề" },
      { key: "van_de_dau_vao", label: "Vấn đề đầu vào" },
      { key: "muc_do", label: "Mức độ" },
      { key: "nhom_yeu_cau", label: "Nhóm yêu cầu" },
    ],
  },
  {
    group: "Địa lý (địa chính cũ)",
    items: [
      { key: "tinh", label: "Tỉnh" },
      { key: "quan_huyen", label: "Quận/Huyện" },
      { key: "phuong_xa", label: "Phường/Xã" },
    ],
  },
  {
    group: "Địa lý (địa chính mới 2025)",
    items: [
      { key: "tinh_moi", label: "Tỉnh/TP" },
      { key: "phuong_xa_moi", label: "Phường/Xã" },
    ],
  },
  {
    group: "Sản phẩm",
    items: [
      { key: "hang", label: "Hãng" },
      { key: "model", label: "Model" },
    ],
  },
  {
    group: "Quy trình xử lý",
    items: [
      { key: "ly_do_cham", label: "Lý do chậm" },
      { key: "danh_gia_cskh", label: "Đánh giá QL (kết thúc ca)" },
      { key: "phan_loai_kh", label: "Phân loại KH" },
      { key: "sale_khu_vuc", label: "Sale khu vực" },
      { key: "bo_phan_ban_giao", label: "Bộ phận bàn giao" },
    ],
  },
];

interface GoogleDriveStatus {
  connected: boolean;
  google_email?: string;
  folder_id?: string;
  authorized_by?: string | null;
  authorized_at?: string;
}

function GoogleDriveCard() {
  const { t } = useTranslation();
  const statusQuery = useQuery({
    queryKey: ["google-drive-status"],
    queryFn: () => api.get<GoogleDriveStatus>("/settings/google-drive/status"),
  });
  const s = statusQuery.data;
  return (
    <Card title={t("settings.gdriveTitle")}>
      <p className="mb-2 text-xs text-ink-soft">{t("settings.gdriveDesc")}</p>
      {statusQuery.isLoading && <p className="text-sm text-ink-soft">{t("common.loading")}</p>}
      {s?.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-green-800">{t("settings.gdriveConnected", { email: s.google_email })}</p>
            <p className="text-xs text-ink-soft">
              {t("settings.gdriveBy", { by: s.authorized_by ?? "—", at: s.authorized_at })}
            </p>
          </div>
          <Btn size="sm" variant="secondary" onClick={() => { window.location.href = "/api/settings/google-drive/authorize"; }}>
            {t("settings.gdriveReconnect")}
          </Btn>
        </div>
      ) : (
        !statusQuery.isLoading && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <p className="text-amber-800">{t("settings.gdriveNotConnected")}</p>
            <Btn size="sm" onClick={() => { window.location.href = "/api/settings/google-drive/authorize"; }}>
              {t("settings.gdriveConnect")}
            </Btn>
          </div>
        )
      )}
    </Card>
  );
}

export function SettingsModule() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsNhom>("nhom_van_de");

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-ink lg:text-[21px]">{t("settings.pageTitle")}</h2>

      <GoogleDriveCard />
      <NgayNghiCard />

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <nav className="flex shrink-0 flex-col gap-3 md:w-52">
          {TAB_GROUPS.map((g) => (
            <div key={g.group}>
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{g.group}</p>
              {g.items.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium ${
                    tab === t.key ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-accent-soft hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <OptionsPanel nhom={tab} />
        </div>
      </div>
    </div>
  );
}

interface OptRow { id: string | number; gia_tri: string; parent: string | null; active: number | boolean }

// Ngay nghi le: moc "48h bo Chu nhat + ngay le" cua cac loi vi pham (backend lib/gioTinh.ts).
interface NgayNghiRow { ngay: string; ten: string; created_by: string | null }

function NgayNghiCard() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const namNay = new Date().getFullYear();
  const [nam, setNam] = useState(String(namNay));
  const [ngay, setNgay] = useState("");
  const [ten, setTen] = useState("");

  const listQuery = useQuery({
    queryKey: ["ngay-nghi", nam],
    queryFn: () => api.get<{ items: NgayNghiRow[] }>(`/settings/ngay-nghi?nam=${nam}`),
    select: (d) => d.items,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ngay-nghi"] });

  const addMutation = useMutation({
    mutationFn: () => api.post<{ ok: true }>("/settings/ngay-nghi", { ngay, ten: ten.trim() }),
    onSuccess: () => {
      showToast(t("settings.ngayNghi.toastAdded"), "success");
      setNgay("");
      setTen("");
      invalidate();
    },
    onError: (err) => showToast(t("settings.ngayNghi.toastError", { code: err instanceof ApiError ? err.code : "?" }), "error"),
  });
  const delMutation = useMutation({
    mutationFn: (d: string) => api.delete<{ ok: true }>(`/settings/ngay-nghi/${d}`),
    onSuccess: () => {
      showToast(t("settings.ngayNghi.toastDeleted"), "success");
      invalidate();
    },
    onError: (err) => showToast(t("settings.ngayNghi.toastError", { code: err instanceof ApiError ? err.code : "?" }), "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ngay || !ten.trim()) return;
    addMutation.mutate();
  };

  return (
    <Card
      title={t("settings.ngayNghi.title")}
      actions={
        <Select
          className="w-24"
          value={nam}
          onChange={(e) => setNam(e.target.value)}
          options={[namNay - 1, namNay, namNay + 1].map((y) => ({ value: String(y), label: String(y) }))}
        />
      }
    >
      <p className="mb-3 text-xs text-ink-soft">{t("settings.ngayNghi.desc")}</p>
      <form onSubmit={submit} className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-full lg:w-44">
          <label className="mb-1 block text-xs font-medium text-ink-soft">{t("settings.ngayNghi.ngay")}</label>
          <Input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} />
        </div>
        <div className="w-full lg:w-64">
          <label className="mb-1 block text-xs font-medium text-ink-soft">{t("settings.ngayNghi.ten")}</label>
          <Input value={ten} onChange={(e) => setTen(e.target.value)} placeholder={t("settings.ngayNghi.tenPlaceholder")} />
        </div>
        <Btn type="submit" variant="primary" disabled={addMutation.isPending || !ngay || !ten.trim()}>
          {addMutation.isPending ? t("settings.adding") : t("settings.add")}
        </Btn>
      </form>
      {listQuery.isLoading && <p className="py-3 text-sm text-ink-soft">{t("common.loading")}</p>}
      {listQuery.data && (
        listQuery.data.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-soft">{t("settings.ngayNghi.empty", { nam })}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {listQuery.data.map((r) => (
              <li key={r.ngay} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-28 shrink-0 font-semibold tabular-nums text-ink">{r.ngay.split("-").reverse().join("/")}</span>
                <span className="min-w-0 flex-1 truncate text-ink-body">{r.ten}</span>
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={delMutation.isPending}
                  onClick={() => { if (window.confirm(t("settings.ngayNghi.confirmDelete", { ngay: r.ngay, ten: r.ten }))) delMutation.mutate(r.ngay); }}
                >
                  {t("settings.ngayNghi.xoa")}
                </Btn>
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  );
}

function OptionsPanel({ nhom }: { nhom: SettingsNhom }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const nhomVanDeOpts = useSettingsOptions("nhom_van_de");

  const [giaTri, setGiaTri] = useState("");
  const [parent, setParent] = useState("");
  const [statusFilter, setStatusFilter] = useState<"1" | "0" | "all">("1");
  const [search, setSearch] = useState("");

  const listQuery = useQuery({
    queryKey: ["settings-options-admin", nhom, statusFilter],
    queryFn: () =>
      api.get<{ items: OptRow[] }>(`/settings/options?nhom=${encodeURIComponent(nhom)}&active=${statusFilter}`),
    select: (d) => d.items,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["settings-options-admin", nhom] });
    qc.invalidateQueries({ queryKey: ["settings-options", nhom] });
  };

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: true }>("/settings/options", {
        nhom,
        gia_tri: giaTri.trim(),
        parent: nhom === "van_de_dau_vao" ? (parent.trim() === "" ? undefined : parent.trim()) : undefined,
      }),
    onSuccess: () => {
      showToast(t("settings.toast.added"), "success");
      setGiaTri("");
      setParent("");
      invalidate();
    },
    onError: (err) => showToast(err instanceof ApiError ? t("settings.toast.addFailedCode", { code: err.code }) : t("settings.toast.addFailed"), "error"),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string | number; active: boolean }) =>
      api.patch<{ ok: true }>(`/settings/options/${vars.id}`, { active: vars.active }),
    onSuccess: (_d, vars) => {
      invalidate();
      showToast(
        vars.active ? t("settings.toast.unhidden") : t("settings.toast.hiddenMsg"),
        "success",
      );
    },
    onError: (err) => showToast(err instanceof ApiError ? t("settings.toast.updateFailedCode", { code: err.code }) : t("settings.toast.updateFailed"), "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!giaTri.trim()) return;
    addMutation.mutate();
  };

  const rows = (listQuery.data ?? []).filter(
    (o) => !search.trim() || o.gia_tri.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const chip = (v: "1" | "0" | "all", label: string) => (
    <button
      onClick={() => setStatusFilter(v)}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        statusFilter === v ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Card
      title={t("settings.listTitle", { label: TABS_LABEL[nhom] })}
      actions={<span className="text-xs text-ink-soft">{t("settings.itemsCount", { count: rows.length })}</span>}
    >
      <form onSubmit={submit} className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-full lg:w-64">
          <label className="mb-1 block text-xs font-medium text-ink-soft">{t("settings.newValue")}</label>
          <Input value={giaTri} onChange={(e) => setGiaTri(e.target.value)} placeholder={t("settings.newValuePlaceholder")} />
        </div>
        {nhom === "van_de_dau_vao" && (
          <div className="w-full lg:w-56">
            <label className="mb-1 block text-xs font-medium text-ink-soft">{t("settings.belongsToGroup")}</label>
            <Select
              options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              placeholder={t("settings.choosePlaceholder")}
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            />
          </div>
        )}
        <Btn type="submit" variant="primary" disabled={addMutation.isPending}>
          {addMutation.isPending ? t("settings.adding") : t("settings.add")}
        </Btn>
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chip("1", t("settings.active"))}
        {chip("0", t("settings.hidden"))}
        {chip("all", t("settings.all"))}
        <Input className="ml-auto max-w-[220px]" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("settings.searchInList")} />
      </div>

      {listQuery.isLoading && <p className="py-4 text-sm text-ink-soft">{t("common.loading")}</p>}
      {listQuery.data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-semibold text-ink-soft">
              <th className="px-2 py-2">{t("settings.col.value")}</th>
              {nhom === "van_de_dau_vao" && <th className="px-2 py-2">{t("settings.col.belongsTo")}</th>}
              <th className="px-2 py-2">{t("settings.col.status")}</th>
              <th className="px-2 py-2 text-right">{t("settings.col.action")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-ink-soft">{t("settings.noValues")}</td>
              </tr>
            )}
            {rows.map((o) => {
              const on = !!o.active;
              return (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="px-2 py-2">{o.gia_tri}</td>
                  {nhom === "van_de_dau_vao" && <td className="px-2 py-2 text-ink-soft">{o.parent ?? "—"}</td>}
                  <td className="px-2 py-2">
                    <span className={`text-xs ${on ? "text-green-700" : "text-ink-faint"}`}>{on ? t("settings.active") : t("settings.hidden")}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Btn
                      size="sm"
                      variant="secondary"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: o.id, active: !on })}
                    >
                      {on ? t("settings.hide") : t("settings.unhide")}
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

const TABS_LABEL: Record<SettingsNhom, string> = {
  ly_do_cham: "Lý do chậm",
  nhom_van_de: "Nhóm vấn đề",
  van_de_dau_vao: "Vấn đề đầu vào",
  danh_gia_cskh: "Đánh giá QL (kết thúc ca)",
  phan_loai_kh: "Phân loại KH",
  muc_do: "Mức độ",
  nhom_yeu_cau: "Nhóm yêu cầu",
  sale_khu_vuc: "Sale khu vực",
  model: "Model",
  hang: "Hãng",
  tinh: "Tỉnh",
  quan_huyen: "Quận/Huyện",
  phuong_xa: "Phường/Xã",
  tinh_moi: "Tỉnh/TP (mới)",
  phuong_xa_moi: "Phường/Xã (mới)",
  bo_phan_ban_giao: "Bộ phận bàn giao",
};
