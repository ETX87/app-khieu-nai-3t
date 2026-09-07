import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { SettingsNhom, SettingsOption } from "./types";

export function useSettingsOptions(nhom: SettingsNhom) {
  return useQuery({
    queryKey: ["settings-options", nhom],
    queryFn: () => api.get<{ items: SettingsOption[] }>(`/settings/options?nhom=${encodeURIComponent(nhom)}`),
    select: (data) => data.items,
    staleTime: 60_000,
  });
}

// Dung cho cac Combobox "creatable" (nguoi dung tu them lua chon moi luc nhap lieu).
export function useCreateSettingsOption(nhom: SettingsNhom) {
  const qc = useQueryClient();
  return async (gia_tri: string) => {
    await api.post("/settings/options", { nhom, gia_tri });
    await qc.invalidateQueries({ queryKey: ["settings-options", nhom] });
  };
}
