import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

interface ThongBaoCursor {
  ngay_tao: string;
  id: number;
}

interface ThongBaoPage {
  items: ThongBaoRow[];
  nextCursor: ThongBaoCursor | null;
}

const LOAI_ICON: Record<string, string> = {
  cho_tiep_nhan: "📥",
  cho_chot: "✅",
};

type Tab = "all" | "unread" | "read";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tổng" },
  { key: "unread", label: "Chưa đọc" },
  { key: "read", label: "Đã đọc" },
];

// Chuong thong bao (2026-09): "Don moi can tiep nhan" + "Don cho QL chot". Dem chua doc poll moi
// 2 phut (Web Push lo phan "ngay lap tuc", polling chi la du phong/dong bo lai khi dang mo app).
// UI doi tu popover absolute (bi bug hien thi sai/cat mat tren mobile) sang Drawer truot canh phai,
// dung dung pattern da kiem thu ben linh-kien-app (xem NotificationBell.tsx cua app do).
// 3 the Tong/Chua doc/Da doc + cuon vo han 10 dong/lan (giong Facebook) thay vi tai het 1 lan
// (2026-09-21) - tranh doc/render toan bo lich su thong bao moi lan mo chuong.
export function NotificationBell({ onOpenDetail }: { onOpenDetail: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("unread");
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const push = usePushNotifications();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const countQuery = useQuery({
    queryKey: ["thong-bao-count"],
    queryFn: () => api.get<{ tong: number; chuaDoc: number; daDoc: number }>("/thong-bao/count"),
    refetchInterval: 120_000,
  });

  // Moi lan mo lai deu coi du lieu cu la stale va fetch lai (staleTime: 0) - tranh hien thong bao cu
  // trong luc Web Push da day toi thong bao moi ma cache React Query chua het han.
  const listQuery = useInfiniteQuery({
    queryKey: ["thong-bao-list", tab],
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ filter: tab, limit: "10" });
      if (pageParam) {
        qs.set("before_ngay_tao", pageParam.ngay_tao);
        qs.set("before_id", String(pageParam.id));
      }
      return api.get<ThongBaoPage>(`/thong-bao?${qs.toString()}`);
    },
    initialPageParam: null as ThongBaoCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
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
  const tabCount: Record<Tab, number | undefined> = {
    all: countQuery.data?.tong,
    unread: countQuery.data?.chuaDoc,
    read: countQuery.data?.daDoc,
  };
  const rows = listQuery.data?.pages.flatMap((p) => p.items) ?? [];

  // Cuon vo han: khi sentinel (o cuoi danh sach) lot vao khung nhin thi tai trang tiep theo.
  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
          listQuery.fetchNextPage();
        }
      },
      { rootMargin: "80px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, listQuery.hasNextPage, listQuery.isFetchingNextPage, rows.length]);

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
        <div className="sticky top-0 z-10 flex gap-1 border-b border-line bg-surface p-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                tab === t.key ? "bg-accent text-white" : "text-ink-soft hover:bg-gray-100"
              }`}
            >
              {t.label}
              {tabCount[t.key] != null && (
                <span className={`ml-1 ${tab === t.key ? "text-white/80" : "text-ink-faint"}`}>({tabCount[t.key]})</span>
              )}
            </button>
          ))}
        </div>

        {listQuery.isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-ink-soft">Đang tải...</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-soft">
            {tab === "unread" ? "Không có thông báo chưa đọc" : tab === "read" ? "Không có thông báo đã đọc" : "Không có thông báo"}
          </p>
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
            <div ref={sentinelRef} className="h-1" />
            {listQuery.isFetchingNextPage && (
              <p className="py-2 text-center text-xs text-ink-soft">Đang tải thêm...</p>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
