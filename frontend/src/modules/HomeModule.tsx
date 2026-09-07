import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { KhieuNai, KhieuNaiStats } from "../api/types";
import { Card } from "../components/ui/Card";
import { Table, type TableColumn } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { KhieuNaiDetail } from "./KhieuNaiDetail";
import { useState } from "react";
import type { AppUser } from "../api/types";

interface ListResponse {
  items: KhieuNai[];
  total: number;
}

interface StatCardDef {
  label: string;
  value: number;
  tone: "blue" | "amber" | "green" | "red";
}

function StatCard({ label, value, tone }: StatCardDef) {
  const toneClasses: Record<StatCardDef["tone"], string> = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className={`rounded-lg border border-line p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export function HomeModule({ user }: { user: AppUser }) {
  const [detailId, setDetailId] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ["khieu-nai-stats"],
    queryFn: () => api.get<KhieuNaiStats>("/khieu-nai/stats"),
  });

  const activeQuery = useQuery({
    queryKey: ["khieu-nai", { trang_thai: "Dang xu ly", page: 1, home: true }],
    queryFn: () => api.get<ListResponse>("/khieu-nai?trang_thai=Dang+xu+ly&page=1&pageSize=5"),
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
      <div className="rounded-xl bg-gradient-to-br from-accent to-accent-dark px-6 py-6 text-white">
        <h2 className="text-xl font-bold">Hệ thống ghi nhận khiếu nại</h2>
        <p className="mt-1 text-sm text-white/80">Kết nối KTV hiện trường - CSKH - Xử lý nhanh chóng - Hiệu quả</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Tổng khiếu nại" value={s?.tong ?? 0} tone="blue" />
        <StatCard label="Đang xử lý" value={s?.dang_xu_ly ?? 0} tone="amber" />
        <StatCard label="Đã kết thúc" value={s?.da_ket_thuc ?? 0} tone="green" />
        <StatCard label="Tồn đọng CRM" value={s?.ton_dong_crm ?? 0} tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Khiếu nại đang xử lý" className="lg:col-span-2">
          {activeQuery.isLoading && <p className="py-6 text-center text-sm text-ink-soft">Đang tải...</p>}
          {activeQuery.data && (
            <Table
              columns={columns}
              rows={activeQuery.data.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetailId(r.id)}
              emptyText="Không có khiếu nại đang xử lý."
            />
          )}
        </Card>

        <Card title="Khiếu nại theo nhóm vấn đề">
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

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={detailId ? `Chi tiết ${detailId}` : ""} width="xl">
        {detailId && (
          <KhieuNaiDetail
            id={detailId}
            user={user}
            onClose={() => setDetailId(null)}
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
