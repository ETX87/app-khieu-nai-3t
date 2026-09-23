import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AdminUserRow, AppUser, EtxNhanSuRow, EtxNhanSuSyncStatus, VaiTro } from "../api/types";
import { fmtVN } from "../lib/formatVN";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Table, type TableColumn } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";

const PAGE_SIZE = 20;

interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Cho nguoi dung ngung go 300ms moi goi server - tranh 1 truy van D1/phim bam.
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Trang gan voi bo loc: doi `filterKey` -> ve trang 1 ngay trong CUNG lan render (reset bang useEffect
// se ban them 1 truy van thua voi trang cu + tu khoa moi).
function usePageFor(filterKey: string): [number, (p: number) => void] {
  const [state, setState] = useState({ key: filterKey, page: 1 });
  if (state.key !== filterKey) setState({ key: filterKey, page: 1 });
  const page = state.key === filterKey ? state.page : 1;
  return [page, (p: number) => setState({ key: filterKey, page: p })];
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
      <span>
        {from}–{to} / {total} dòng · Trang {page}/{totalPages}
      </span>
      <div className="flex gap-2">
        <Btn size="touch" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</Btn>
        <Btn size="touch" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Sau</Btn>
      </div>
    </div>
  );
}

// NV Sale / Tong dai vien mac dinh chi thay ca minh tao - Admin bat "Xem tat ca ca" cho tung nguoi.
const KTV_LIKE: string[] = ["NV Sale", "Tổng đài viên"];

const VAI_TRO_OPTIONS = [
  { value: "Admin", label: "Admin" },
  { value: "Viewer", label: "Viewer" },
  { value: "CSKH", label: "CSKH" },
  { value: "NV Sale", label: "NV Sale" },
  { value: "Tổng đài viên", label: "Tổng đài viên" },
  { value: "TN CSKH", label: "TN CSKH" },
  { value: "QL", label: "QL" },
];

const DUYET_LABEL: Record<string, string> = {
  "Cho duyet": "Chờ duyệt",
  "Da duyet": "Đã duyệt",
  "Tu choi": "Từ chối",
};

const ERR_MSG: Record<string, string> = {
  CANNOT_MODIFY_SELF: "Không thể tự đổi vai trò / tự khoá tài khoản của chính bạn.",
  LAST_ADMIN: "Đây là Admin hoạt động cuối cùng — không thể hạ quyền / khoá / từ chối.",
};

export function UsersModule({ user }: { user: AppUser }) {
  const isAdmin = user.vai_tro === "Admin";
  const [tab, setTab] = useState<"nguoi-dung" | "etx-nhan-su">("nguoi-dung");
  const pendingCount = useQuery({
    queryKey: ["users", "pending-count"],
    enabled: isAdmin,
    queryFn: () => api.get<{ count: number }>("/users/pending-count"),
    select: (d) => d.count,
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink">Người dùng</h2>
      <Tabs
        tabs={[
          { key: "nguoi-dung", label: "Người dùng", count: pendingCount.data },
          // Du lieu nhan su nhay cam hon danh sach users thuong nen chi Admin thay tab nay.
          ...(isAdmin ? [{ key: "etx-nhan-su", label: "ETX nhân sự" }] : []),
        ]}
        active={tab}
        onChange={(k) => setTab(k as "nguoi-dung" | "etx-nhan-su")}
      />
      {tab === "nguoi-dung" && <NguoiDungTab user={user} />}
      {tab === "etx-nhan-su" && isAdmin && <EtxNhanSuTab />}
    </div>
  );
}

function NguoiDungTab({ user }: { user: AppUser }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editRow, setEditRow] = useState<AdminUserRow | null>(null);
  const search = useDebounced(q.trim());
  const [page, setPage] = usePageFor(search);

  const query = useQuery({
    queryKey: ["users", "list", search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      return api.get<PagedResponse<AdminUserRow>>(`/users?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["users"] });
    qc.invalidateQueries({ queryKey: ["users", "pending-count"] });
  };

  const patch = useMutation({
    mutationFn: (vars: { email: string; body: Record<string, unknown> }) =>
      api.patch<{ user: AdminUserRow }>(`/users/${encodeURIComponent(vars.email)}`, vars.body),
    onSuccess: () => {
      showToast("Đã cập nhật người dùng", "success");
      setEditRow(null);
      invalidate();
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : "";
      showToast(ERR_MSG[code] ?? (code ? `Lỗi: ${code}` : "Cập nhật thất bại"), "error");
    },
  });

  const columns: TableColumn<AdminUserRow>[] = [
    {
      key: "user",
      header: "Người dùng",
      render: (r) => (
        <div className="leading-tight">
          <div className="font-medium">{r.ten ?? "—"}</div>
          <div className="text-xs text-ink-soft">{r.email}</div>
        </div>
      ),
    },
    { key: "vai_tro", header: "Vai trò", render: (r) => r.vai_tro ?? <span className="text-ink-faint">Chưa gán</span> },
    {
      key: "trang_thai_duyet",
      header: "Duyệt",
      render: (r) => {
        const tone = r.trang_thai_duyet === "Da duyet" ? "green" : r.trang_thai_duyet === "Tu choi" ? "red" : "amber";
        return <Badge tone={tone}>{DUYET_LABEL[r.trang_thai_duyet] ?? r.trang_thai_duyet}</Badge>;
      },
    },
    {
      key: "xem_tat_ca",
      header: "Xem tất cả ca",
      render: (r) =>
        !r.vai_tro || !KTV_LIKE.includes(r.vai_tro) ? (
          <span className="text-xs text-ink-faint">{r.vai_tro ? "Sẵn có" : "—"}</span>
        ) : r.xem_tat_ca ? (
          <Badge tone="green">Bật (chỉ xem)</Badge>
        ) : (
          <Badge tone="gray">Tắt · ca của mình</Badge>
        ),
    },
    { key: "bi_khoa", header: "Trạng thái", render: (r) => (r.bi_khoa ? <Badge tone="red">Đã khoá</Badge> : <Badge tone="green">Hoạt động</Badge>) },
    { key: "last_login", header: "Đăng nhập gần nhất", render: (r) => <span className="text-xs text-ink-soft">{fmtVN.relative(r.last_login)}</span> },
    { key: "created_at", header: "Ngày tạo", render: (r) => <span className="text-xs text-ink-soft">{fmtVN.date(r.created_at)}</span> },
    {
      key: "action",
      header: "",
      render: (r) => {
        const isSelf = r.email === user.email;
        if (r.trang_thai_duyet === "Cho duyet") {
          return (
            <Btn size="sm" variant="primary" onClick={() => setEditRow(r)}>
              Duyệt &amp; gán vai trò
            </Btn>
          );
        }
        return (
          <Btn size="sm" variant="secondary" disabled={isSelf} title={isSelf ? "Không thể sửa tài khoản của chính bạn" : undefined} onClick={() => setEditRow(r)}>
            Sửa
          </Btn>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="mb-3">
          <Input type="search" className="lg:max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo email hoặc tên..." />
        </div>
        {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>}
        {query.isError && <p className="py-8 text-center text-sm text-red-600">Không thể tải danh sách người dùng.</p>}
        {query.data && (
          <>
            <Table columns={columns} rows={query.data.items} rowKey={(r) => r.email} />
            <Pager page={page} total={query.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {editRow && (
        <EditUserDialog
          row={editRow}
          pending={editRow.trang_thai_duyet === "Cho duyet"}
          busy={patch.isPending}
          onClose={() => setEditRow(null)}
          onSubmit={(body) => patch.mutate({ email: editRow.email, body })}
        />
      )}
    </div>
  );
}

const TRANG_THAI_LAM_VIEC_LABEL: Record<string, string> = { on: "Đang làm việc", off: "Đã nghỉ" };

// Tab "ETX nhân sự" (2026-09-21) - danh bạ nhân sự đồng bộ PULL 1 chiều từ hệ ETX ngoài (xem
// backend/src/lib/etxNhanSuSync.ts), Admin-only. Đồng bộ tự động 1 lần/ngày lúc 3h sáng qua cron,
// hoặc bấm "Đồng bộ ngay" khi cần gấp. Khác linh-kien-app: không có cột "Mã KTV" để gán tay vì App
// Khiếu Nại khớp tài khoản trực tiếp theo gmail (không có bảng trung gian).
function EtxNhanSuTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [trangThai, setTrangThai] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [page, setPage] = usePageFor(`${debouncedSearch}|${trangThai}`);

  const query = useQuery({
    queryKey: ["etx-nhan-su", debouncedSearch, trangThai, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (trangThai) params.set("trang_thai", trangThai);
      return api.get<PagedResponse<EtxNhanSuRow>>(`/etx-nhan-su?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const syncStatus = useQuery({
    queryKey: ["etx-nhan-su-sync-status"],
    queryFn: () => api.get<EtxNhanSuSyncStatus>("/etx-nhan-su/sync-status"),
    refetchInterval: 60_000,
  });

  const runSync = useMutation({
    mutationFn: () => api.post<EtxNhanSuSyncStatus>("/etx-nhan-su/sync/run", {}),
    onSuccess: async (res) => {
      if (res.last_status === "error") showToast(`Đồng bộ lỗi: ${res.last_error}`, "error");
      else showToast(`Đã đồng bộ xong, ${res.changed_count} dòng thay đổi`, "success");
      await qc.invalidateQueries({ queryKey: ["etx-nhan-su-sync-status"] });
      await qc.invalidateQueries({ queryKey: ["etx-nhan-su"] });
    },
    onError: (err) => showToast("Không thể đồng bộ: " + (err instanceof Error ? err.message : String(err)), "error"),
  });

  const columns: TableColumn<EtxNhanSuRow>[] = [
    { key: "ma_nhan_su", header: "Mã NV", render: (r) => r.ma_nhan_su },
    { key: "ho_ten", header: "Họ tên", render: (r) => r.ho_ten },
    { key: "chuc_danh", header: "Chức danh", render: (r) => r.chuc_danh ?? <span className="text-ink-faint">—</span> },
    { key: "gmail", header: "Gmail", render: (r) => r.gmail ?? <span className="text-ink-faint">—</span> },
    {
      key: "trang_thai_lam_viec",
      header: "Trạng thái làm việc",
      render: (r) => (
        <Badge tone={r.trang_thai_lam_viec === "on" ? "green" : "red"}>{TRANG_THAI_LAM_VIEC_LABEL[r.trang_thai_lam_viec]}</Badge>
      ),
    },
    {
      key: "lien_ket",
      header: "Tài khoản liên kết",
      render: (r) =>
        r.lien_ket_vai_tro || r.lien_ket_trang_thai_duyet ? (
          <div className="leading-tight">
            <div>{r.lien_ket_vai_tro ?? <span className="text-ink-faint">Chưa gán vai trò</span>}</div>
            {!!r.lien_ket_bi_khoa && <Badge tone="red">Đã khoá</Badge>}
          </div>
        ) : (
          <span className="text-ink-faint">Chưa có tài khoản</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="text-xs text-ink-soft">
            {syncStatus.isLoading ? (
              "Đang tải trạng thái đồng bộ..."
            ) : syncStatus.data?.last_run_at ? (
              <>
                Đồng bộ gần nhất: {fmtVN.relative(syncStatus.data.last_run_at)}
                {syncStatus.data.last_status === "error" ? (
                  <span className="text-red-600"> — lỗi: {syncStatus.data.last_error}</span>
                ) : (
                  <> — {syncStatus.data.changed_count} dòng thay đổi</>
                )}
              </>
            ) : (
              "Chưa đồng bộ lần nào."
            )}
          </div>
          <Btn size="sm" variant="secondary" disabled={runSync.isPending} onClick={() => runSync.mutate()} className="ml-auto">
            {runSync.isPending ? "Đang đồng bộ..." : "Đồng bộ ngay"}
          </Btn>
        </div>
        <div className="mb-3 flex flex-wrap gap-3">
          <Input type="search" className="lg:max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo mã NV, họ tên, gmail..." />
          <Select
            className="lg:max-w-[180px]"
            options={[
              { value: "on", label: "Đang làm việc" },
              { value: "off", label: "Đã nghỉ" },
            ]}
            placeholder="Tất cả trạng thái"
            value={trangThai}
            onChange={(e) => setTrangThai(e.target.value)}
          />
        </div>
        {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>}
        {query.isError && <p className="py-8 text-center text-sm text-red-600">Không thể tải danh bạ ETX nhân sự.</p>}
        {query.data && (
          <>
            <Table columns={columns} rows={query.data.items} rowKey={(r) => r.ma_nhan_su} />
            <Pager page={page} total={query.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

function EditUserDialog({
  row, pending, busy, onClose, onSubmit,
}: {
  row: AdminUserRow;
  pending: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [vaiTro, setVaiTro] = useState<string>(row.vai_tro ?? "");
  const [duyet, setDuyet] = useState<string>(pending ? "Da duyet" : row.trang_thai_duyet);
  const [biKhoa, setBiKhoa] = useState<boolean>(!!row.bi_khoa);
  const [xemTatCa, setXemTatCa] = useState<boolean>(!!row.xem_tat_ca);
  const [confirmText, setConfirmText] = useState("");

  const promotingAdmin = vaiTro === "Admin" && row.vai_tro !== "Admin";
  const locking = biKhoa && !row.bi_khoa;
  const needConfirm = promotingAdmin || locking;

  const submit = () => {
    const body: Record<string, unknown> = {};
    if ((vaiTro || null) !== (row.vai_tro ?? null)) body.vai_tro = vaiTro || null;
    if (duyet !== row.trang_thai_duyet) body.trang_thai_duyet = duyet;
    if (biKhoa !== !!row.bi_khoa) body.bi_khoa = biKhoa;
    if (xemTatCa !== !!row.xem_tat_ca) body.xem_tat_ca = xemTatCa;
    if (Object.keys(body).length === 0) return onClose();
    if (duyet === "Da duyet" && !vaiTro) return; // không cho duyệt mà chưa gán vai trò
    onSubmit(body);
  };

  const canSubmit =
    !busy && !(duyet === "Da duyet" && !vaiTro) && (!needConfirm || confirmText.trim().toLowerCase() === "xac nhan");

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-ink">
          {pending ? "Duyệt & gán vai trò" : "Chỉnh sửa người dùng"}
        </h3>
        <p className="mb-4 text-xs text-ink-soft">{row.ten ?? row.email} · {row.email}</p>

        <label className="mb-1 block text-xs font-medium text-ink-soft">Vai trò</label>
        <Select
          className="mb-3"
          options={VAI_TRO_OPTIONS}
          placeholder="— Chưa gán —"
          value={vaiTro}
          onChange={(e) => setVaiTro(e.target.value)}
        />

        <label className="mb-1 block text-xs font-medium text-ink-soft">Trạng thái duyệt</label>
        <Select
          className="mb-3"
          options={[
            { value: "Cho duyet", label: "Chờ duyệt" },
            { value: "Da duyet", label: "Đã duyệt" },
            { value: "Tu choi", label: "Từ chối" },
          ]}
          value={duyet}
          onChange={(e) => setDuyet(e.target.value)}
        />
        {duyet === "Da duyet" && !vaiTro && (
          <p className="mb-3 text-xs text-amber-700">Phải gán vai trò trước khi duyệt.</p>
        )}

        {KTV_LIKE.includes(vaiTro) ? (
          <label className="mb-3 flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={xemTatCa} onChange={(e) => setXemTatCa(e.target.checked)} />
            <span>
              Xem tất cả ca trên hệ thống
              <span className="block text-xs text-ink-soft">
                Tắt (mặc định): chỉ thấy ca do mình tạo. Bật: thấy mọi ca, ca của người khác chỉ được xem.
              </span>
            </span>
          </label>
        ) : vaiTro ? (
          <p className="mb-3 text-xs text-ink-soft">Vai trò {vaiTro} đã xem được tất cả các ca.</p>
        ) : null}

        <label className="mb-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={biKhoa} onChange={(e) => setBiKhoa(e.target.checked)} />
          Khoá tài khoản
        </label>

        {needConfirm && (
          <div className="mb-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-300">
            <p className="mb-2 font-medium">
              {promotingAdmin && "Bạn đang nâng người này lên quyền Admin. "}
              {locking && "Bạn đang khoá tài khoản này. "}
              Gõ <code>xac nhan</code> để tiếp tục.
            </p>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="xac nhan" />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>Huỷ</Btn>
          <Btn variant="primary" disabled={!canSubmit} onClick={submit}>
            {busy ? "Đang lưu..." : "Lưu"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
