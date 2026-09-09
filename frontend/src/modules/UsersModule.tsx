import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AdminUserRow, AppUser, VaiTro } from "../api/types";
import { fmtVN } from "../lib/formatVN";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Table, type TableColumn } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";

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
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editRow, setEditRow] = useState<AdminUserRow | null>(null);

  const query = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ items: AdminUserRow[] }>("/users"),
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

  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    if (!q.trim()) return items;
    const s = q.trim().toLowerCase();
    return items.filter((r) => r.email.toLowerCase().includes(s) || (r.ten ?? "").toLowerCase().includes(s));
  }, [query.data, q]);

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
      <h2 className="text-lg font-semibold text-ink">Người dùng</h2>
      <Card>
        <div className="mb-3">
          <Input className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo email hoặc tên..." />
        </div>
        {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>}
        {query.isError && <p className="py-8 text-center text-sm text-red-600">Không thể tải danh sách người dùng.</p>}
        {query.data && <Table columns={columns} rows={rows} rowKey={(r) => r.email} />}
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
  const [confirmText, setConfirmText] = useState("");

  const promotingAdmin = vaiTro === "Admin" && row.vai_tro !== "Admin";
  const locking = biKhoa && !row.bi_khoa;
  const needConfirm = promotingAdmin || locking;

  const submit = () => {
    const body: Record<string, unknown> = {};
    if ((vaiTro || null) !== (row.vai_tro ?? null)) body.vai_tro = vaiTro || null;
    if (duyet !== row.trang_thai_duyet) body.trang_thai_duyet = duyet;
    if (biKhoa !== !!row.bi_khoa) body.bi_khoa = biKhoa;
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
