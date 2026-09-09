import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AppUser } from "../api/types";
import { fmtVN } from "../lib/formatVN";
import { Card } from "../components/ui/Card";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { KhieuNaiDetail } from "./KhieuNaiDetail";

interface SlaBucket {
  label: string;
  da_ket_thuc: number;
  dang_xu_ly: number;
}
interface SlaNhomVanDe {
  nhom_van_de: string;
  so_ca: number;
  so_ngay_trung_binh: number;
}
interface SlaReport {
  buckets: SlaBucket[];
  tong_da_ket_thuc: number;
  tong_dang_xu_ly: number;
  so_ngay_trung_binh: number;
  theo_nhom_van_de: SlaNhomVanDe[];
}

interface TrungLapItem {
  id: string;
  ngay_tiep_nhan: string;
  ten_khach: string | null;
  van_de_dau_vao: string | null;
  trang_thai: string;
  id_lada: string | null;
  id_lada_phat_sinh: string | null;
}
interface TrungLapGroup {
  lada_ids: string[];
  so_lan: number;
  khoang_cach_ngan_nhat: number;
  tai_phat_trong_7_ngay: boolean;
  items: TrungLapItem[];
}
interface TrungLapReport {
  groups: TrungLapGroup[];
  tong_nhom: number;
  tong_tai_phat_7_ngay: number;
}

function SlaBar({ b, max }: { b: SlaBucket; max: number }) {
  const total = b.da_ket_thuc + b.dang_xu_ly;
  const donePct = max > 0 ? (b.da_ket_thuc / max) * 100 : 0;
  const openPct = max > 0 ? (b.dang_xu_ly / max) * 100 : 0;
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-xs text-ink-soft">
        <span>{b.label}</span>
        <span className="font-medium text-ink">{total}</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-2.5 bg-green-500" style={{ width: `${donePct}%` }} title={`Đã kết thúc: ${b.da_ket_thuc}`} />
        <div className="h-2.5 bg-amber-400" style={{ width: `${openPct}%` }} title={`Đang xử lý: ${b.dang_xu_ly}`} />
      </div>
    </div>
  );
}

export function BaoCaoModule({ user }: { user: AppUser }) {
  const [tuNgay, setTuNgay] = useState("");
  const [denNgay, setDenNgay] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const qs = new URLSearchParams();
  if (tuNgay) qs.set("tu_ngay", tuNgay);
  if (denNgay) qs.set("den_ngay", denNgay);

  const slaQuery = useQuery({
    queryKey: ["bao-cao-sla", tuNgay, denNgay],
    queryFn: () => api.get<SlaReport>(`/khieu-nai/bao-cao/sla?${qs.toString()}`),
  });
  const trungLapQuery = useQuery({
    queryKey: ["bao-cao-trung-lap", tuNgay, denNgay],
    queryFn: () => api.get<TrungLapReport>(`/khieu-nai/bao-cao/trung-lap?${qs.toString()}`),
  });

  const sla = slaQuery.data;
  const maxBucket = Math.max(1, ...(sla?.buckets.map((b) => b.da_ket_thuc + b.dang_xu_ly) ?? [1]));
  const maxNhom = Math.max(1, ...(sla?.theo_nhom_van_de.map((n) => n.so_ca) ?? [1]));

  const selCls = "rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Báo cáo</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            Từ <input type="date" className={selCls} value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            đến <input type="date" className={selCls} value={denNgay} onChange={(e) => setDenNgay(e.target.value)} />
          </label>
          {(tuNgay || denNgay) && (
            <button onClick={() => { setTuNgay(""); setDenNgay(""); }} className="text-xs font-medium text-accent hover:underline">
              Xoá lọc
            </button>
          )}
        </div>
      </div>

      <Card title="SLA theo thời gian xử lý">
        {slaQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {sla && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-soft">
              <span>Đã kết thúc: <b className="text-ink">{sla.tong_da_ket_thuc}</b></span>
              <span>Đang xử lý: <b className="text-ink">{sla.tong_dang_xu_ly}</b></span>
              <span>Số ngày xử lý trung bình (đã kết thúc): <b className="text-ink">{sla.so_ngay_trung_binh} ngày</b></span>
              <span className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-green-500" /> Đã kết thúc</span>
                <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Đang xử lý</span>
              </span>
            </div>
            <div className="space-y-2">
              {sla.buckets.map((b) => <SlaBar key={b.label} b={b} max={maxBucket} />)}
            </div>

            {sla.theo_nhom_van_de.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Số ngày xử lý trung bình theo nhóm vấn đề (ca đã kết thúc)
                </p>
                <div className="space-y-2">
                  {sla.theo_nhom_van_de.map((n) => (
                    <div key={n.nhom_van_de}>
                      <div className="mb-0.5 flex items-center justify-between text-xs text-ink-soft">
                        <span className="truncate">{n.nhom_van_de}</span>
                        <span className="font-medium text-ink">{n.so_ca} ca · {n.so_ngay_trung_binh} ngày TB</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(n.so_ca / maxNhom) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Card
        title="Ca trùng lặp / tái phát theo ID Lada"
        actions={
          trungLapQuery.data && (
            <span className="text-xs text-ink-soft">
              {trungLapQuery.data.tong_nhom} nhóm
              {trungLapQuery.data.tong_tai_phat_7_ngay > 0 && (
                <span className="ml-2 text-red-700 font-medium">· {trungLapQuery.data.tong_tai_phat_7_ngay} tái phát &lt;7 ngày</span>
              )}
            </span>
          )
        }
      >
        {trungLapQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {trungLapQuery.data && trungLapQuery.data.groups.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-soft">Không có ca trùng lặp theo ID Lada trong khoảng lọc này.</p>
        )}
        <div className="flex flex-col gap-3">
          {trungLapQuery.data?.groups.map((g) => (
            <div key={g.lada_ids.join("+")} className="rounded-md border border-line p-2.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-soft">{g.lada_ids.join(" → ")}</span>
                {g.tai_phat_trong_7_ngay ? (
                  <Badge tone="red">⚠ Tái phát trong {g.khoang_cach_ngan_nhat} ngày</Badge>
                ) : (
                  <Badge tone="gray">Cách nhau {g.khoang_cach_ngan_nhat} ngày</Badge>
                )}
                <span className="text-xs text-ink-soft">{g.so_lan} lần phản ánh</span>
              </div>
              <div className="flex flex-col gap-1">
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setDetailId(it.id)}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs hover:bg-gray-50"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono text-ink-soft">{it.id}</span> · {it.ten_khach ?? "—"} ·{" "}
                      {it.van_de_dau_vao ?? "—"}
                    </span>
                    <span className="shrink-0 text-ink-soft">{fmtVN.date(it.ngay_tiep_nhan)}</span>
                    <StatusBadge trangThai={it.trang_thai} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={!!detailId} onClose={() => setDetailId(null)} width="full">
        {detailId && (
          <KhieuNaiDetail
            id={detailId}
            user={user}
            onClose={() => setDetailId(null)}
            onNavigate={setDetailId}
            onChanged={() => { slaQuery.refetch(); trungLapQuery.refetch(); }}
          />
        )}
      </Modal>
    </div>
  );
}
