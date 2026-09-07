import { useQuery } from "@tanstack/react-query";
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
