import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { SettingsNhom } from "../api/types";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/Toast";

const TABS: { key: SettingsNhom; label: string }[] = [
  { key: "ly_do_cham", label: "Lý do chậm" },
  { key: "nhom_van_de", label: "Nhóm vấn đề" },
  { key: "van_de_dau_vao", label: "Vấn đề đầu vào" },
  { key: "kenh_tiep_nhan", label: "Kênh tiếp nhận" },
  { key: "danh_gia_cskh", label: "Đánh giá CSKH" },
  { key: "phan_loai_kh", label: "Phân loại KH" },
  { key: "muc_do", label: "Mức độ" },
  { key: "nhom_yeu_cau", label: "Nhóm yêu cầu" },
];

export function SettingsModule() {
  const [tab, setTab] = useState<SettingsNhom>("ly_do_cham");

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink">Cấu hình danh mục</h2>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-md border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-accent text-accent" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <OptionsPanel nhom={tab} />
    </div>
  );
}

function OptionsPanel({ nhom }: { nhom: SettingsNhom }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const options = useSettingsOptions(nhom);
  const nhomVanDeOpts = useSettingsOptions("nhom_van_de");

  const [giaTri, setGiaTri] = useState("");
  const [parent, setParent] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["settings-options", nhom] });

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: true }>("/settings/options", {
        nhom,
        gia_tri: giaTri.trim(),
        parent: nhom === "van_de_dau_vao" ? (parent.trim() === "" ? undefined : parent.trim()) : undefined,
      }),
    onSuccess: () => {
      showToast("Đã thêm giá trị mới", "success");
      setGiaTri("");
      setParent("");
      invalidate();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Thêm thất bại", "error"),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string | number; active: boolean }) =>
      api.patch<{ ok: true }>(`/settings/options/${vars.id}`, { active: vars.active }),
    onSuccess: () => {
      showToast("Đã cập nhật trạng thái", "success");
      invalidate();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Cập nhật thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!giaTri.trim()) return;
    addMutation.mutate();
  };

  return (
    <Card title={`Danh sách giá trị (${TABS_LABEL[nhom]})`}>
      <form onSubmit={submit} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-64">
          <label className="mb-1 block text-xs font-medium text-ink-soft">Giá trị mới</label>
          <Input value={giaTri} onChange={(e) => setGiaTri(e.target.value)} placeholder="Nhập giá trị..." />
        </div>
        {nhom === "van_de_dau_vao" && (
          <div className="w-56">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Thuộc nhóm vấn đề</label>
            <Select
              options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              placeholder="— Chọn —"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            />
          </div>
        )}
        <Btn type="submit" variant="primary" disabled={addMutation.isPending}>
          {addMutation.isPending ? "Đang thêm..." : "Thêm"}
        </Btn>
      </form>

      {options.isLoading && <p className="py-4 text-sm text-ink-soft">Đang tải...</p>}
      {options.data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase text-ink-soft">
              <th className="px-2 py-2">Giá trị</th>
              {nhom === "van_de_dau_vao" && <th className="px-2 py-2">Thuộc nhóm</th>}
              <th className="px-2 py-2 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {options.data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-6 text-center text-ink-soft">
                  Chưa có giá trị nào.
                </td>
              </tr>
            )}
            {options.data.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="px-2 py-2">{o.gia_tri}</td>
                {nhom === "van_de_dau_vao" && <td className="px-2 py-2 text-ink-soft">{o.parent ?? "—"}</td>}
                <td className="px-2 py-2 text-right">
                  <Btn
                    size="sm"
                    variant="secondary"
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate({ id: o.id, active: false })}
                  >
                    Vô hiệu hóa
                  </Btn>
                </td>
              </tr>
            ))}
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
  kenh_tiep_nhan: "Kênh tiếp nhận",
  danh_gia_cskh: "Đánh giá CSKH",
  phan_loai_kh: "Phân loại KH",
  muc_do: "Mức độ",
  nhom_yeu_cau: "Nhóm yêu cầu",
};
