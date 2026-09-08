import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { SettingsNhom, SettingsOption } from "./types";

// parent: khi truyen (dia ly cascading) chi lay cac muc co settings_option.parent = parent.
// parent === "" -> chua chon cap tren -> khong goi API, tra danh sach rong.
export function useSettingsOptions(nhom: SettingsNhom, parent?: string) {
  return useQuery({
    queryKey: ["settings-options", nhom, parent ?? null],
    queryFn: () => {
      const qs = new URLSearchParams({ nhom });
      if (parent !== undefined) qs.set("parent", parent);
      return api.get<{ items: SettingsOption[] }>(`/settings/options?${qs.toString()}`);
    },
    select: (data) => data.items,
    staleTime: 60_000,
    enabled: parent === undefined || parent !== "",
  });
}

// Dung cho cac Combobox "creatable" (nguoi dung tu them lua chon moi luc nhap lieu).
export function useCreateSettingsOption(nhom: SettingsNhom) {
  const qc = useQueryClient();
  return async (gia_tri: string, parent?: string) => {
    await api.post("/settings/options", { nhom, gia_tri, parent });
    await qc.invalidateQueries({ queryKey: ["settings-options", nhom] });
  };
}
