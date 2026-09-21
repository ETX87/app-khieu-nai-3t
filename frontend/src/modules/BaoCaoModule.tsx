import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AppUser } from "../api/types";
import { fmtVN } from "../lib/formatVN";
import { Card } from "../components/ui/Card";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { ThangFilter } from "../components/ui/ThangFilter";
import { KhieuNaiDetail } from "./KhieuNaiDetail";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { sortMucDoOptions } from "../lib/severity";
import { NGUON_OPTIONS } from "./KhieuNaiForm";

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
  thang: string;
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

interface ChotLoiGroup {
  key: string;
  so_ca: number;
  so_loi_nsx: number;
  so_loi_lap_dat: number;
  so_loi_thai_do_ktv: number;
  so_loi_quy_trinh_nskx: number;
  ca_co_loi: number;
  ty_le_loi: number;
}
interface ChotLoiReport {
  tong: ChotLoiGroup;
  theo_thang: ChotLoiGroup[];
  theo_tinh: ChotLoiGroup[];
  theo_nhom_yeu_cau: ChotLoiGroup[];
  theo_nhom_van_de: ChotLoiGroup[];
  theo_nguon_tao: ChotLoiGroup[];
  theo_nguoi_tao: ChotLoiGroup[];
  thang: string | null;
}

interface TheoNgayRow {
  ngay: string;
  ca_moi: number;
  ton_cu_chua_tiep_nhan: number | null;
  ton_cu_da_tiep_nhan: number | null;
  da_tiep_nhan: number;
  da_dong: number;
  tb_gio_tiep_nhan: number | null;
  tb_gio_xu_ly: number | null;
  ty_le_tiep_nhan: number | null;
  cho_tiep_nhan: number | null;
  con_ton: number | null;
}
interface TheoNgayReport {
  tu_ngay: string;
  den_ngay: string;
  co_loc: boolean;
  rows: TheoNgayRow[];
}
interface NguoiDungGon {
  email: string;
  ten: string | null;
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

function ChotLoiRowView({ g }: { g: ChotLoiGroup }) {
  const rateCls = g.ca_co_loi === 0 ? "text-ink-faint" : g.ty_le_loi >= 50 ? "text-red-600" : "text-amber-600";
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate text-ink-soft" title={g.key}>{g.key}</span>
      <span className="shrink-0 text-ink">{g.so_ca} ca</span>
      <span className={`shrink-0 w-16 text-right font-medium ${rateCls}`}>
        {g.ca_co_loi > 0 ? `${g.ty_le_loi}% lỗi` : "—"}
      </span>
    </div>
  );
}

function ChotLoiMiniTable({ title, rows }: { title: string; rows: ChotLoiGroup[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-faint">—</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((g) => <ChotLoiRowView key={g.key} g={g} />)}
        </div>
      )}
    </div>
  );
}

export function BaoCaoModule({ user }: { user: AppUser }) {
  // "thang" chi ap dung cho SLA + Chot loi (can gioi han theo thang de tranh quet toan bo lich su
  // khi du lieu tang qua 2 nam - xem backend/src/lib/thangFilter.ts). "Ca trung lap/tai phat" CAN
  // nhin xuyen nhieu thang de phat hien tai phat (vd tai phat sau 3-4 thang) nen KHONG loc theo
  // thang o day, van giu logic rieng (LIMIT 20000 dong gan nhat lam phong ho).
  const [thang, setThang] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const thangQs = thang ? `?thang=${thang}` : "";

  const todayISO = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [ngayTu, setNgayTu] = useState(todayISO);
  const [ngayDen, setNgayDen] = useState(todayISO);
  const [locNguoiTiepNhan, setLocNguoiTiepNhan] = useState("");
  const [locNguoiTao, setLocNguoiTao] = useState("");
  const [locNguon, setLocNguon] = useState("");
  const [locNhomYeuCau, setLocNhomYeuCau] = useState("");
  const [locMucDo, setLocMucDo] = useState("");
  const [locPhanLoaiKh, setLocPhanLoaiKh] = useState("");

  const nhomYeuCauOpts = useSettingsOptions("nhom_yeu_cau");
  const mucDoOptsTheoNgay = useSettingsOptions("muc_do");
  const phanLoaiKhOpts = useSettingsOptions("phan_loai_kh");
  const nguoiDungQuery = useQuery({
    queryKey: ["bao-cao-nguoi-dung"],
    queryFn: () => api.get<{ items: NguoiDungGon[] }>("/khieu-nai/bao-cao/nguoi-dung"),
  });

  const theoNgayQs = new URLSearchParams();
  theoNgayQs.set("tu_ngay", ngayTu);
  theoNgayQs.set("den_ngay", ngayDen);
  if (locNguoiTiepNhan) theoNgayQs.set("nguoi_tiep_nhan", locNguoiTiepNhan);
  if (locNguoiTao) theoNgayQs.set("nguoi_tao", locNguoiTao);
  if (locNguon) theoNgayQs.set("nguon", locNguon);
  if (locNhomYeuCau) theoNgayQs.set("nhom_yeu_cau", locNhomYeuCau);
  if (locMucDo) theoNgayQs.set("muc_do", locMucDo);
  if (locPhanLoaiKh) theoNgayQs.set("phan_loai_kh", locPhanLoaiKh);
  const theoNgayQuery = useQuery({
    queryKey: ["bao-cao-theo-ngay", ngayTu, ngayDen, locNguoiTiepNhan, locNguoiTao, locNguon, locNhomYeuCau, locMucDo, locPhanLoaiKh],
    queryFn: () => api.get<TheoNgayReport>(`/khieu-nai/bao-cao/theo-ngay?${theoNgayQs.toString()}`),
  });

  const slaQuery = useQuery({
    queryKey: ["bao-cao-sla", thang],
    queryFn: () => api.get<SlaReport>(`/khieu-nai/bao-cao/sla${thangQs}`),
  });
  const trungLapQuery = useQuery({
    queryKey: ["bao-cao-trung-lap"],
    queryFn: () => api.get<TrungLapReport>("/khieu-nai/bao-cao/trung-lap"),
  });
  const chotLoiQuery = useQuery({
    queryKey: ["bao-cao-chot-loi", thang],
    queryFn: () => api.get<ChotLoiReport>(`/khieu-nai/bao-cao/chot-loi${thangQs}`),
  });

  const sla = slaQuery.data;
  const maxBucket = Math.max(1, ...(sla?.buckets.map((b) => b.da_ket_thuc + b.dang_xu_ly) ?? [1]));
  const maxNhom = Math.max(1, ...(sla?.theo_nhom_van_de.map((n) => n.so_ca) ?? [1]));

  const selCls = "rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Báo cáo</h2>
          <p className="text-xs text-ink-soft">
            SLA + Chốt lỗi: ca đang tồn (mọi lúc) + ca đóng/hủy trong{" "}
            <b className="text-ink">
              {thang ? `tháng ${thang.slice(5)}/${thang.slice(0, 4)}` : `tháng hiện tại${sla ? ` (${sla.thang.slice(5)}/${sla.thang.slice(0, 4)})` : ""}`}
            </b>
            . Ca trùng lặp/tái phát xem xuyên suốt (không lọc theo tháng).
          </p>
        </div>
        <ThangFilter value={thang} onChange={setThang} />
      </div>

      <Card title="Báo cáo theo ngày">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            Từ <input type="date" className={selCls} value={ngayTu} max={ngayDen} onChange={(e) => setNgayTu(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            đến <input type="date" className={selCls} value={ngayDen} min={ngayTu} onChange={(e) => setNgayDen(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => { setNgayTu(todayISO); setNgayDen(todayISO); }}
            className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-ink-soft hover:bg-gray-50"
          >
            Hôm nay
          </button>
          <select className={selCls} value={locNguoiTiepNhan} onChange={(e) => setLocNguoiTiepNhan(e.target.value)}>
            <option value="">Mọi người tiếp nhận</option>
            {(nguoiDungQuery.data?.items ?? []).map((u) => <option key={u.email} value={u.email}>{u.ten || u.email}</option>)}
          </select>
          <select className={selCls} value={locNguoiTao} onChange={(e) => setLocNguoiTao(e.target.value)}>
            <option value="">Mọi người tạo</option>
            {(nguoiDungQuery.data?.items ?? []).map((u) => <option key={u.email} value={u.email}>{u.ten || u.email}</option>)}
          </select>
          <select className={selCls} value={locNguon} onChange={(e) => setLocNguon(e.target.value)}>
            <option value="">Mọi nguồn</option>
            {NGUON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className={selCls} value={locNhomYeuCau} onChange={(e) => setLocNhomYeuCau(e.target.value)}>
            <option value="">Mọi nhóm yêu cầu</option>
            {(nhomYeuCauOpts.data ?? []).map((o) => <option key={o.id} value={o.gia_tri}>{o.gia_tri}</option>)}
          </select>
          <select className={selCls} value={locMucDo} onChange={(e) => setLocMucDo(e.target.value)}>
            <option value="">Mọi mức độ</option>
            {sortMucDoOptions(mucDoOptsTheoNgay.data ?? []).map((o) => <option key={o.id} value={o.gia_tri}>{o.gia_tri}</option>)}
          </select>
          <select className={selCls} value={locPhanLoaiKh} onChange={(e) => setLocPhanLoaiKh(e.target.value)}>
            <option value="">Mọi phân loại KH</option>
            {(phanLoaiKhOpts.data ?? []).map((o) => <option key={o.id} value={o.gia_tri}>{o.gia_tri}</option>)}
          </select>
        </div>

        {theoNgayQuery.data?.co_loc && (
          <p className="mb-2 text-xs text-amber-700">
            Đang lọc: cột "Tồn cũ chưa/đã tiếp nhận", "Chưa tiếp nhận", "Còn tồn" chỉ tính được cho <b>hôm nay</b> —
            các ngày quá khứ hiện "—" vì số tồn đọng theo bộ lọc tại 1 thời điểm cũ chưa được lưu lại.
          </p>
        )}

        {theoNgayQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {theoNgayQuery.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-line text-left font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="whitespace-nowrap px-2 py-1.5">Ngày</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Ca mới</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Tồn cũ chưa TN</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Tồn cũ đã TN</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Đã tiếp nhận</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Đã đóng</th>
                  <th className="whitespace-nowrap px-2 py-1.5">TB giờ TN</th>
                  <th className="whitespace-nowrap px-2 py-1.5">TB giờ XL</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Tỷ lệ TN</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Chưa TN</th>
                  <th className="whitespace-nowrap px-2 py-1.5">Còn tồn</th>
                </tr>
              </thead>
              <tbody>
                {theoNgayQuery.data.rows.map((r) => (
                  <tr key={r.ngay} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-2 py-1.5 font-medium text-ink">{r.ngay}</td>
                    <td className="px-2 py-1.5">{r.ca_moi}</td>
                    <td className="px-2 py-1.5">{r.ton_cu_chua_tiep_nhan ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.ton_cu_da_tiep_nhan ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.da_tiep_nhan}</td>
                    <td className="px-2 py-1.5">{r.da_dong}</td>
                    <td className="px-2 py-1.5">{r.tb_gio_tiep_nhan ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.tb_gio_xu_ly ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.ty_le_tiep_nhan != null ? `${r.ty_le_tiep_nhan}%` : "—"}</td>
                    <td className="px-2 py-1.5">{r.cho_tiep_nhan ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.con_ton ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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

      <Card title="Chốt lỗi">
        {chotLoiQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {chotLoiQuery.data && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-soft">
              <span>Đã chốt: <b className="text-ink">{chotLoiQuery.data.tong.so_ca}</b> ca</span>
              <span>
                Có lỗi: <b className="text-ink">{chotLoiQuery.data.tong.ca_co_loi}</b> ca (
                <b className={chotLoiQuery.data.tong.ty_le_loi >= 50 ? "text-red-600" : "text-ink"}>
                  {chotLoiQuery.data.tong.ty_le_loi}%
                </b>
                )
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone="gray">NSX {chotLoiQuery.data.tong.so_loi_nsx}</Badge>
                <Badge tone="gray">Lắp đặt {chotLoiQuery.data.tong.so_loi_lap_dat}</Badge>
                <Badge tone="gray">Thái độ KTV {chotLoiQuery.data.tong.so_loi_thai_do_ktv}</Badge>
                <Badge tone="gray">Quy trình NSKX {chotLoiQuery.data.tong.so_loi_quy_trinh_nskx}</Badge>
              </span>
            </div>
            {chotLoiQuery.data.tong.so_ca === 0 ? (
              <p className="py-4 text-center text-sm text-ink-soft">Chưa có ca nào được chốt kết luận trong khoảng lọc này.</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-line pt-3 md:grid-cols-2">
                <ChotLoiMiniTable title="Theo tháng (đóng ca)" rows={chotLoiQuery.data.theo_thang.slice(0, 12)} />
                <ChotLoiMiniTable title="Theo tỉnh" rows={chotLoiQuery.data.theo_tinh} />
                <ChotLoiMiniTable title="Theo nhóm yêu cầu" rows={chotLoiQuery.data.theo_nhom_yeu_cau} />
                <ChotLoiMiniTable title="Theo nhóm vấn đề" rows={chotLoiQuery.data.theo_nhom_van_de} />
                <ChotLoiMiniTable title="Theo nguồn tạo" rows={chotLoiQuery.data.theo_nguon_tao} />
                <ChotLoiMiniTable title="Theo người tạo" rows={chotLoiQuery.data.theo_nguoi_tao} />
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
            onChanged={() => { slaQuery.refetch(); trungLapQuery.refetch(); chotLoiQuery.refetch(); }}
          />
        )}
      </Modal>
    </div>
  );
}
