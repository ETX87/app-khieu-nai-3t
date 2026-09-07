import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AdminUserRow, VaiTro } from "../api/types";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Select";
import { Table, type TableColumn } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";

const VAI_TRO_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Chưa gán" },
  { value: "Admin", label: "Admin" },
  { value: "Viewer", label: "Viewer" },
  { value: "CSKH", label: "CSKH" },
  { value: "KTV", label: "KTV" },
  { value: "TN CSKH", label: "TN CSKH" },
  { value: "QL", label: "QL" },
];

const TRANG_THAI_OPTIONS = [
  { value: "Cho duyet", label: "Chờ duyệt" },
  { value: "Da duyet", label: "Đã duyệt" },
  { value: "Tu choi", label: "Từ chối" },
];

export function UsersModule() {
  const { showToast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ items: AdminUserRow[] }>("/users"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const patchMutation = useMutation({
    mutationFn: (vars: { email: string; body: Record<string, unknown> }) =>
      api.patch<{ user: AdminUserRow }>(`/users/${encodeURIComponent(vars.email)}`, vars.body),
    onSuccess: () => {
      showToast("Đã cập nhật người dùng", "success");
      invalidate();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Cập nhật thất bại", "error"),
  });

  const columns: TableColumn<AdminUserRow>[] = [
    { key: "email", header: "Email", render: (r) => <span className="text-xs">{r.email}</span> },
    { key: "ten", header: "Tên", render: (r) => r.ten ?? "—" },
    {
      key: "vai_tro",
      header: "Vai trò",
      render: (r) => (
        <Select
          options={VAI_TRO_OPTIONS}
          value={r.vai_tro ?? ""}
          onChange={(e) =>
            patchMutation.mutate({ email: r.email, body: { vai_tro: e.target.value === "" ? null : (e.target.value as VaiTro) } })
          }
          className="w-32"
        />
      ),
    },
    {
      key: "trang_thai_duyet",
      header: "Trạng thái duyệt",
      render: (r) => (
        <Select
          options={TRANG_THAI_OPTIONS}
          value={r.trang_thai_duyet}
          onChange={(e) => patchMutation.mutate({ email: r.email, body: { trang_thai_duyet: e.target.value } })}
          className="w-32"
        />
      ),
    },
    {
      key: "bi_khoa",
      header: "Khóa",
      render: (r) => (r.bi_khoa ? <Badge tone="red">Đã khóa</Badge> : <Badge tone="green">Hoạt động</Badge>),
    },
    {
      key: "action",
      header: "Hành động",
      render: (r) => (
        <Btn
          size="sm"
          variant={r.bi_khoa ? "secondary" : "danger"}
          disabled={patchMutation.isPending}
          onClick={() => patchMutation.mutate({ email: r.email, body: { bi_khoa: !r.bi_khoa } })}
        >
          {r.bi_khoa ? "Mở khóa" : "Khóa"}
        </Btn>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink">Người dùng</h2>
      <Card>
        {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>}
        {query.isError && <p className="py-8 text-center text-sm text-red-600">Không thể tải danh sách người dùng.</p>}
        {query.data && <Table columns={columns} rows={query.data.items} rowKey={(r) => r.email} />}
      </Card>
    </div>
  );
}
