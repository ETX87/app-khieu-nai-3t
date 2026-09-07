import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AppUser, KhieuNai } from "../api/types";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Table, type TableColumn } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { KhieuNaiForm } from "./KhieuNaiForm";
import { KhieuNaiDetail } from "./KhieuNaiDetail";
import { KhieuNaiCard } from "./KhieuNaiCard";

const STATUS_OPTIONS = [
  { value: "Cho tiep nhan", label: "Chờ tiếp nhận" },
  { value: "Dang xu ly", label: "Đang xử lý" },
  { value: "Cho chot ket thuc", label: "Chờ chốt kết thúc" },
  { value: "Da ket thuc", label: "Đã kết thúc" },
  { value: "Huy", label: "Hủy" },
];

const PAGE_SIZE = 20;

interface ListResponse {
  items: KhieuNai[];
  total: number;
  page: number;
  pageSize: number;
}

export function KhieuNaiModule({ user }: { user: AppUser }) {
  const [trangThai, setTrangThai] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canCreate = !!user.vai_tro && user.vai_tro !== "Viewer";

  const query = useQuery({
    queryKey: ["khieu-nai", { trangThai, q, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (trangThai) params.set("trang_thai", trangThai);
      if (q) params.set("q", q);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      return api.get<ListResponse>(`/khieu-nai?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setQ(qInput.trim());
    setPage(1);
  };

  const columns: TableColumn<KhieuNai>[] = [
    { key: "id", header: "Mã KN", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "ngay_tiep_nhan", header: "Ngày tiếp nhận", render: (r) => r.ngay_tiep_nhan },
    { key: "ten_khach", header: "Khách hàng", render: (r) => r.ten_khach ?? "—" },
    { key: "id_lada", header: "ID Lada", render: (r) => r.id_lada ?? "—" },
    { key: "model", header: "Model", render: (r) => r.model ?? "—" },
    { key: "trang_thai", header: "Trạng thái", render: (r) => <StatusBadge trangThai={r.trang_thai} /> },
    {
      key: "ngay_ktv_hoan_thanh",
      header: "KTV hoàn thành",
      render: (r) =>
        r.ngay_ktv_hoan_thanh ? (
          <span className="text-green-700">{r.ngay_ktv_hoan_thanh}</span>
        ) : (
          <span className="text-amber-600">Chưa hoàn thành</span>
        ),
    },
  ];

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Khiếu nại</h2>
        {canCreate && (
          <Btn variant="primary" onClick={() => setCreateOpen(true)}>
            + Tạo khiếu nại mới
          </Btn>
        )}
      </div>

      <Card>
        <form onSubmit={submitSearch} className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Trạng thái</label>
            <Select
              options={STATUS_OPTIONS}
              placeholder="Tất cả"
              value={trangThai}
              onChange={(e) => {
                setTrangThai(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-ink-soft">Tìm kiếm (tên khách, ID Lada, mã KN)</label>
            <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Nhập từ khóa..." />
          </div>
          <Btn type="submit" variant="secondary">
            Tìm kiếm
          </Btn>
        </form>

        {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>}
        {query.isError && <p className="py-8 text-center text-sm text-red-600">Không thể tải dữ liệu.</p>}
        {query.data && (
          <>
            <div className="flex flex-col gap-2 md:hidden">
              {query.data.items.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">Không có dữ liệu</p>}
              {query.data.items.map((r) => (
                <KhieuNaiCard key={r.id} kn={r} onClick={() => setDetailId(r.id)} />
              ))}
            </div>
            <div className="hidden md:block">
              <Table
                columns={columns}
                rows={query.data.items}
                rowKey={(r) => r.id}
                onRowClick={(r) => setDetailId(r.id)}
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
              <span>
                Tổng {total} khiếu nại — Trang {page}/{totalPages}
              </span>
              <div className="flex gap-2">
                <Btn size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Trước
                </Btn>
                <Btn size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Sau
                </Btn>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo khiếu nại mới" width="lg">
        <KhieuNaiForm
          onCreated={(id) => {
            setCreateOpen(false);
            query.refetch();
            setDetailId(id);
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detailId ? `Chi tiết ${detailId}` : ""} width="xl">
        {detailId && (
          <KhieuNaiDetail
            id={detailId}
            user={user}
            onClose={() => setDetailId(null)}
            onChanged={() => query.refetch()}
          />
        )}
      </Modal>
    </div>
  );
}
