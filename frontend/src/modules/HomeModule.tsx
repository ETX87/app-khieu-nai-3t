import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { KhieuNai, KhieuNaiStats } from "../api/types";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Table, type TableColumn } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { ThangFilter } from "../components/ui/ThangFilter";
import { fmtVN } from "../lib/formatVN";
import { KhieuNaiDetail } from "./KhieuNaiDetail";
import { KhieuNaiForm, type KhieuNaiFormHandle, type KhieuNaiFormHeaderState } from "./KhieuNaiForm";
import { KhieuNaiCard } from "./KhieuNaiCard";
import { useRef, useState } from "react";
import type { AppUser } from "../api/types";

interface ListResponse {
  items: KhieuNai[];
  total: number;
}

interface StatCardDef {
  label: string;
  value: number;
  tone: "blue" | "amber" | "green" | "red";
  onClick?: () => void;
}

function StatCard({ label, value, tone, onClick }: StatCardDef) {
  const toneClasses: Record<StatCardDef["tone"], string> = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-lg border border-line p-5 text-left lg:p-4 ${toneClasses[tone]} ${
        onClick ? "transition-shadow hover:shadow-md" : "cursor-default"
      }`}
    >
      <p className="text-sm font-medium opacity-80 lg:text-xs">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </button>
  );
}

interface HomeProps {
  user: AppUser;
  onOpenList: (filter: { trang_thai?: string; chua_dong_bo?: string; cho_tn_cskh?: boolean; qua_han_giai_trinh?: boolean }) => void;
  onOpenModule: (m: "trang-chu" | "khieu-nai" | "settings" | "users") => void;
}

export function HomeModule({ user, onOpenList, onOpenModule }: HomeProps) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const createFormRef = useRef<KhieuNaiFormHandle>(null);
  const [createHeader, setCreateHeader] = useState<KhieuNaiFormHeaderState>({
    missing: [], pendingCount: 0, submitting: false, panelClassName: "bg-surface",
  });
  const { showToast } = useToast();
  const closeDetail = () => setDetailId(null);
  const canCreate = ["CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "");

  const [thang, setThang] = useState("");
  const statsQuery = useQuery({
    queryKey: ["khieu-nai-stats", thang],
    queryFn: () => api.get<KhieuNaiStats>(`/khieu-nai/stats${thang ? `?thang=${thang}` : ""}`),
  });

  const activeQuery = useQuery({
    queryKey: ["khieu-nai", { trang_thai: "Dang xu ly", page: 1, home: true }],
    queryFn: () => api.get<ListResponse>("/khieu-nai?trang_thai=Dang+xu+ly&page=1&pageSize=5"),
  });

  const pendingUsersQuery = useQuery({
    queryKey: ["users", "pending-count"],
    enabled: user.vai_tro === "Admin",
    queryFn: () => api.get<{ count: number }>("/users/pending-count"),
    select: (d) => d.count,
  });

  // "Việc của tôi" theo vai trò.
  const role = user.vai_tro;
  const myQuery = useQuery({
    queryKey: ["khieu-nai", "viec-cua-toi", role, user.email],
    queryFn: () => {
      if (role === "QL") return api.get<ListResponse>("/khieu-nai?trang_thai=Cho+chot+ket+thuc&pageSize=10");
      if (role === "TN CSKH") return api.get<ListResponse>("/khieu-nai?trang_thai=Dang+xu+ly&pageSize=20");
      if (role === "CSKH" || role === "Admin")
        return api.get<ListResponse>("/khieu-nai?trang_thai=Cho+tiep+nhan&pageSize=20");
      return api.get<ListResponse>(
        `/khieu-nai?nguoi_phu_trach=${encodeURIComponent(user.email)}&pageSize=10`,
      );
    },
  });
  const myTitle =
    role === "QL"
      ? "Ca chờ tôi chốt"
      : role === "TN CSKH"
        ? "Ca đang xử lý (sẵn sàng đóng)"
        : role === "CSKH" || role === "Admin"
          ? "Phản ánh chờ tiếp nhận"
          : "Ca tôi phụ trách";
  const myItems = (myQuery.data?.items ?? []).filter((r) =>
    role === "TN CSKH"
      ? r.loi_nha_san_xuat !== "Chua danh gia" &&
        r.loi_lap_dat !== "Chua danh gia" &&
        r.loi_thai_do_ktv !== "Chua danh gia" &&
        r.loi_quy_trinh_nskx !== "Chua danh gia" &&
        (r.ket_luan_khieu_nai ?? "Chua danh gia") !== "Chua danh gia"
      : true,
  );

  const syncTon = useMutation({
    mutationFn: () => api.post<{ results: { id: string; ok: boolean; error?: string }[] }>("/khieu-nai/dong-bo-cac-ca-ton"),
    onSuccess: (d) => {
      const okN = d.results.filter((r) => r.ok).length;
      const saiN = d.results.filter((r) => r.error === "DVBH_NOT_FOUND").length;
      const loiN = d.results.length - okN - saiN;
      showToast(
        `Đã kiểm tra ${d.results.length} ca: ${okN} ID đúng` + (saiN ? `, ${saiN} chưa tìm thấy trên CRM` : "") + (loiN ? `, ${loiN} lỗi kết nối` : ""),
        saiN || loiN ? "info" : "success",
      );
      statsQuery.refetch();
    },
    onError: () => showToast("Đồng bộ ca tồn thất bại", "error"),
  });

  const columns: TableColumn<KhieuNai>[] = [
    { key: "id", header: "Mã KN", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "ten_khach", header: "Khách hàng", render: (r) => r.ten_khach ?? "—" },
    { key: "van_de_dau_vao", header: "Vấn đề", render: (r) => r.van_de_dau_vao ?? "—" },
    { key: "ngay_tiep_nhan", header: "Tiếp nhận", render: (r) => r.ngay_tiep_nhan },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge trangThai={r.trang_thai} /> },
  ];

  const s = statsQuery.data;
  const maxNhom = Math.max(1, ...(s?.theoNhomVanDe.map((x) => x.so_luong) ?? [1]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl bg-gradient-to-br from-accent to-accent-dark px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Hệ thống ghi nhận phản ánh</h2>
          <p className="mt-1 text-sm text-white/80">Kết nối KTV hiện trường - CSKH - Xử lý nhanh chóng - Hiệu quả</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="shrink-0 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-accent shadow-sm transition-shadow hover:shadow-md"
          >
            + Tạo phản ánh mới
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          Số liệu: ca đang tồn (mọi lúc) + ca đóng/hủy trong{" "}
          <b className="text-ink">{thang ? `tháng ${thang.slice(5)}/${thang.slice(0, 4)}` : `tháng hiện tại (${s ? `${s.thang.slice(5)}/${s.thang.slice(0, 4)}` : "..."})`}</b>
        </p>
        <ThangFilter value={thang} onChange={setThang} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-10">
        <StatCard label="Tổng (phạm vi)" value={s?.tong ?? 0} tone="blue" onClick={() => onOpenList({})} />
        <StatCard label="Chờ tiếp nhận" value={s?.cho_tiep_nhan ?? 0} tone="red" onClick={() => onOpenList({ trang_thai: "Cho tiep nhan" })} />
        <StatCard label="Đang xử lý" value={s?.dang_xu_ly ?? 0} tone="amber" onClick={() => onOpenList({ trang_thai: "Dang xu ly" })} />
        <StatCard label="Chờ chốt kết thúc" value={s?.cho_chot_ket_thuc ?? 0} tone="amber" onClick={() => onOpenList({ trang_thai: "Cho chot ket thuc" })} />
        <StatCard label="Đã kết thúc" value={s?.da_ket_thuc ?? 0} tone="green" onClick={() => onOpenList({ trang_thai: "Da ket thuc" })} />
        <StatCard label="Đã hủy" value={s?.huy ?? 0} tone="blue" onClick={() => onOpenList({ trang_thai: "Huy" })} />
        <StatCard label="Chờ đồng bộ CRM" value={s?.ton_cho_dong_bo ?? 0} tone="amber" onClick={() => onOpenList({ chua_dong_bo: "cho" })} />
        <StatCard label="ID CRM sai" value={s?.ton_crm_sai ?? 0} tone="red" onClick={() => onOpenList({ chua_dong_bo: "sai" })} />
        <StatCard label="Chờ TN CSKH" value={s?.cho_tn_cskh ?? 0} tone="amber" onClick={() => onOpenList({ cho_tn_cskh: true })} />
        <StatCard label="Quá hạn giải trình" value={s?.qua_han_giai_trinh ?? 0} tone="red" onClick={() => onOpenList({ qua_han_giai_trinh: true })} />
      </div>

      {user.vai_tro === "Admin" && (pendingUsersQuery.data ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => onOpenModule("users")}
          className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-800 hover:shadow-md"
        >
          <span>{pendingUsersQuery.data} người dùng đang chờ duyệt</span>
          <span className="text-xs">Mở màn Người dùng →</span>
        </button>
      )}

      <Card
        title={`Việc của tôi — ${myTitle}`}
        actions={
          (user.vai_tro === "QL" || user.vai_tro === "Admin") ? (
            <Btn size="sm" variant="secondary" disabled={syncTon.isPending} onClick={() => syncTon.mutate()}>
              {syncTon.isPending ? "Đang đồng bộ..." : `Đồng bộ ${s?.ton_dong_crm ?? 0} ca tồn CRM`}
            </Btn>
          ) : undefined
        }
      >
        {myQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {myQuery.data && myItems.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-soft">Không có ca nào cần bạn xử lý.</p>
        )}
        <div className="flex flex-col gap-2">
          {myItems.map((r) => (
            <button
              key={r.id}
              onClick={() => setDetailId(r.id)}
              className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-3 text-left text-base hover:bg-gray-50 lg:py-2 lg:text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono text-xs text-ink-soft">{r.id}</span> · {r.ten_khach ?? "—"} ·{" "}
                {r.van_de_dau_vao ?? r.nhom_van_de ?? "—"}
              </span>
              <span className="shrink-0 text-xs text-ink-soft">{fmtVN.relative(r.ngay_thay_doi)}</span>
              <StatusBadge trangThai={r.trang_thai} />
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Phản ánh đang xử lý" className="lg:col-span-2">
          {activeQuery.isLoading && <p className="py-6 text-center text-sm text-ink-soft">Đang tải...</p>}
          {activeQuery.data && (
            <>
              <div className="flex flex-col gap-2 md:hidden">
                {activeQuery.data.items.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">Không có phản ánh đang xử lý.</p>
                )}
                {activeQuery.data.items.map((r) => (
                  <KhieuNaiCard key={r.id} kn={r} onClick={() => setDetailId(r.id)} />
                ))}
              </div>
              <div className="hidden md:block">
                <Table
                  columns={columns}
                  rows={activeQuery.data.items}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => setDetailId(r.id)}
                  emptyText="Không có phản ánh đang xử lý."
                />
              </div>
            </>
          )}
        </Card>

        <Card title="Phản ánh theo nhóm vấn đề">
          {(s?.theoNhomVanDe.length ?? 0) === 0 && <p className="text-sm text-ink-soft">Chưa có dữ liệu.</p>}
          <div className="space-y-2">
            {s?.theoNhomVanDe.map((row) => (
              <div key={row.nhom_van_de}>
                <div className="mb-0.5 flex items-center justify-between text-xs text-ink-soft">
                  <span className="truncate">{row.nhom_van_de}</span>
                  <span className="font-medium text-ink">{row.so_luong}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-accent"
                    style={{ width: `${(row.so_luong / maxNhom) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo phản ánh mới"
        width="full"
        panelClassName={createHeader.panelClassName}
        actions={
          <div className="flex items-center gap-3">
            {createHeader.pendingCount > 0 && (
              <span className="hidden text-[11px] text-ink-soft sm:inline">
                {createHeader.pendingCount} lựa chọn mới sẽ được lưu khi bấm Tạo
              </span>
            )}
            {createHeader.missing.length > 0 && createHeader.pendingCount === 0 && (
              <span className="hidden text-xs text-amber-700 sm:inline">Còn thiếu: {createHeader.missing.join(", ")}</span>
            )}
            <Btn type="button" variant="secondary" size="sm" onClick={() => createFormRef.current?.cancel()}>Hủy</Btn>
            <Btn
              type="button"
              variant="primary"
              size="sm"
              disabled={createHeader.submitting || createHeader.missing.length > 0}
              onClick={() => createFormRef.current?.submit()}
            >
              {createHeader.submitting ? "Đang tạo..." : "Tạo phản ánh"}
            </Btn>
          </div>
        }
      >
        <KhieuNaiForm
          ref={createFormRef}
          onStateChange={setCreateHeader}
          onCreated={(id) => {
            setCreateOpen(false);
            statsQuery.refetch();
            activeQuery.refetch();
            myQuery.refetch();
            setDetailId(id);
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal open={!!detailId} onClose={closeDetail} width="full">
        {detailId && (
          <KhieuNaiDetail
            id={detailId}
            user={user}
            onClose={closeDetail}
            onNavigate={setDetailId}
            onChanged={() => {
              statsQuery.refetch();
              activeQuery.refetch();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
