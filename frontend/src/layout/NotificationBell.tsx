import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Drawer } from "../components/ui/Drawer";
import { fmtVN } from "../lib/formatVN";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useToast } from "../components/ui/Toast";

interface ThongBaoRow {
  id: number;
  loai: "cho_tiep_nhan" | "cho_chot";
  noi_dung: string;
  khieu_nai_id: string | null;
  da_doc: number;
  ngay_tao: string;
}

const LOAI_ICON: Record<string, string> = {
  cho_tiep_nhan: "📥",
  cho_chot: "✅",
};

// Chuong thong bao (2026-09): "Don moi can tiep nhan" + "Don cho QL chot". Dem chua doc poll moi
// 2 phut (Web Push lo phan "ngay lap tuc", polling chi la du phong/dong bo lai khi dang mo app).
// UI doi tu popover absolute (bi bug hien thi sai/cat mat tren mobile) sang Drawer truot canh phai,
// dung dung pattern da kiem thu ben linh-kien-app (xem NotificationBell.tsx cua app do).
export function NotificationBell({ onOpenDetail }: { onOpenDetail: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const push = usePushNotifications();

  const countQuery = useQuery({
    queryKey: ["thong-bao-count"],
    queryFn: () => api.get<{ chuaDoc: number }>("/thong-bao/count"),
    refetchInterval: 120_000,
  });

  // Moi lan mo lai deu coi du lieu cu la stale va fetch lai (staleTime: 0) - tranh hien thong bao cu
  // trong luc Web Push da day toi thong bao moi ma cache React Query chua het han.
  const listQuery = useQuery({
    queryKey: ["thong-bao-list"],
    queryFn: () => api.get<{ items: ThongBaoRow[] }>("/thong-bao"),
    enabled: open,
    staleTime: 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["thong-bao-count"] });
    queryClient.invalidateQueries({ queryKey: ["thong-bao-list"] });
  };

  const markAllRead = useMutation({
    mutationFn: () => api.post("/thong-bao/mark-all-read"),
    onSuccess: invalidate,
  });

  async function handleRowClick(row: ThongBaoRow) {
    if (!row.da_doc) {
      try {
        await api.post(`/thong-bao/${row.id}/read`);
        invalidate();
      } catch {
        /* khong chan click chi vi danh dau doc that bai */
      }
    }
    if (row.khieu_nai_id) {
      setOpen(false);
      onOpenDetail(row.khieu_nai_id);
    }
  }

  async function togglePush() {
    try {
      if (push.subscribed) await push.unsubscribe();
      else await push.subscribe();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không bật được thông báo đẩy", "error");
    }
  }

  const unread = countQuery.data?.chuaDoc ?? 0;
  const rows = listQuery.data?.items ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Thông báo"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink-soft hover:bg-gray-100"
      >
        🔔
        {unread > 0 && (
          <span className="absolute right-0 top-0 min-w-[16px] rounded-full bg-red-600 px-[3px] text-center text-[9px] font-bold leading-[16px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Thông báo"
        footer={
          <div className="flex flex-col gap-1.5">
            {push.checked && push.supported && (
              <button
                type="button"
                onClick={togglePush}
                disabled={push.busy}
                className={`w-full rounded-lg border py-1.5 text-center text-sm font-semibold disabled:opacity-60 ${
                  push.subscribed ? "border-line text-ink-soft" : "border-accent/50 text-accent-ink"
                }`}
              >
                {push.subscribed ? "✓ Đã bật thông báo trên thiết bị này" : "🔔 Bật thông báo đẩy trên thiết bị này"}
              </button>
            )}
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={unread === 0 || markAllRead.isPending}
              className="w-full py-1.5 text-center text-sm font-semibold text-accent-ink disabled:cursor-default disabled:text-ink-faint"
            >
              Đánh dấu tất cả đã đọc
            </button>
          </div>
        }
      >
        {listQuery.isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-ink-soft">Đang tải...</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-soft">Không có thông báo</p>
        ) : (
          <div className="flex flex-col gap-2 p-4">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => handleRowClick(row)}
                className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors hover:bg-gray-50 ${
                  row.da_doc ? "border-line bg-surface" : "border-accent/40 bg-accent-soft/40 font-medium"
                }`}
              >
                <span className="mr-1">{LOAI_ICON[row.loai] ?? "🔔"}</span>
                {row.noi_dung}
                <div className="mt-0.5 text-[10px] text-ink-soft">{fmtVN.relative(row.ngay_tao)}</div>
              </button>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
