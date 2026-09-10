import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
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
// 2 phut (Web Push lo phan "ngay lap tuc", polling chi la du phong/dong bo lai khi dang mo app);
// danh sach chi tai khi mo popover (giong pattern linh-kien-app).
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 max-h-[70vh] w-[22rem] max-w-[90vw] overflow-y-auto rounded-md border border-line bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-sm font-semibold text-ink">Thông báo</span>
              <button
                type="button"
                disabled={unread === 0 || markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
                className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
              >
                Đánh dấu tất cả đã đọc
              </button>
            </div>
            {listQuery.isLoading && <p className="px-3 py-6 text-center text-sm text-ink-soft">Đang tải...</p>}
            {listQuery.data && listQuery.data.items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-ink-soft">Không có thông báo</p>
            )}
            {listQuery.data?.items.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => handleRowClick(row)}
                className={`block w-full border-b border-line px-3 py-2 text-left text-xs last:border-0 hover:bg-gray-50 ${
                  row.da_doc ? "" : "bg-accent-soft/40 font-medium"
                }`}
              >
                <span className="mr-1">{LOAI_ICON[row.loai] ?? "🔔"}</span>
                {row.noi_dung}
                <div className="mt-0.5 text-[10px] text-ink-soft">{fmtVN.relative(row.ngay_tao)}</div>
              </button>
            ))}
            <div className="border-t border-line px-3 py-2">
              {push.supported && push.checked && (
                <button type="button" disabled={push.busy} onClick={togglePush} className="text-xs font-medium text-accent hover:underline">
                  {push.subscribed ? "Tắt thông báo đẩy trên thiết bị này" : "Bật thông báo đẩy trên thiết bị này"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
