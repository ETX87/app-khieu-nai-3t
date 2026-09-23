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
import { FilterSelect } from "../components/ui/FilterSelect";

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
  id_truy_van: string | null;
}
interface TrungLapGroup {
  id_truy_van_ids: string[];
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
      <div className="mb-0.5 flex items-center justify-between text-sm text-ink-soft lg:text-xs">
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
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm lg:py-1 lg:text-xs">
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
        <p className="text-sm text-ink-faint lg:text-xs">—</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((g) => <ChotLoiRowView key={g.key} g={g} />)}
        </div>
      )}
    </div>
  );
}

function TheoNgayStat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-soft">{k}</span>
      <span className="font-medium text-ink">{v}</span>
    </div>
  );
}

// Card doc cho mobile - mo phong pattern KhieuNaiCard (bang 11 cot khong xem duoc tren man hinh
// hep, phai cuon ngang - card 1 the/ngay de doc thang khong can cuon).
function TheoNgayCard({ r }: { r: TheoNgayRow }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-base font-semibold text-ink">{r.ngay}</span>
        <span className="text-sm text-ink-soft">Còn tồn: <b className="text-ink">{r.con_ton ?? "—"}</b></span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <TheoNgayStat k="Ca mới" v={r.ca_moi} />
        <TheoNgayStat k="Đã tiếp nhận" v={r.da_tiep_nhan} />
        <TheoNgayStat k="Đã đóng" v={r.da_dong} />
        <TheoNgayStat k="Tỷ lệ TN" v={r.ty_le_tiep_nhan != null ? `${r.ty_le_tiep_nhan}%` : "—"} />
        <TheoNgayStat k="Tồn cũ chưa TN" v={r.ton_cu_chua_tiep_nhan ?? "—"} />
        <TheoNgayStat k="Tồn cũ đã TN" v={r.ton_cu_da_tiep_nhan ?? "—"} />
        <TheoNgayStat k="TB giờ TN" v={r.tb_gio_tiep_nhan ?? "—"} />
        <TheoNgayStat k="TB giờ XL" v={r.tb_gio_xu_ly ?? "—"} />
        <TheoNgayStat k="Chưa TN" v={r.cho_tiep_nhan ?? "—"} />
      </div>
    </div>
  );
}

export function BaoCaoModule({ user }: { user: AppUser }) {
  // "thang" dung chung cho SLA + Chot loi + Trung lap/tai phat - gioi han theo thang de tranh quet
  // toan bo lich su khi du lieu tang qua nhieu nam (xem backend/src/lib/thangFilter.ts). Trung lap/
  // tai phat truoc day quet xuyen suot (chi cham LIMIT dong) nhung "cua so" do se ngam seo lai khi
  // luong ca/ngay tang -> doi sang loc theo thang (2026-09-21): tai phat cach nhau qua 1 thang se
  // khong con duoc gop nhom, doi lay chi phi doc D1 chac chan theo khoi luong 1 thang.
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
    queryKey: ["bao-cao-trung-lap", thang],
    queryFn: () => api.get<TrungLapReport>(`/khieu-nai/bao-cao/trung-lap${thangQs}`),
  });
  const chotLoiQuery = useQuery({
    queryKey: ["bao-cao-chot-loi", thang],
    queryFn: () => api.get<ChotLoiReport>(`/khieu-nai/bao-cao/chot-loi${thangQs}`),
  });

  const sla = slaQuery.data;
  const maxBucket = Math.max(1, ...(sla?.buckets.map((b) => b.da_ket_thuc + b.dang_xu_ly) ?? [1]));
  const maxNhom = Math.max(1, ...(sla?.theo_nhom_van_de.map((n) => n.so_ca) ?? [1]));

  const selCls =
    "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none lg:px-2 lg:py-1 lg:text-xs";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Báo cáo</h2>
          <p className="text-xs text-ink-soft">
            SLA + Chốt lỗi + Trùng lặp/tái phát: ca đang tồn (mọi lúc) + ca đóng/hủy/tiếp nhận trong{" "}
            <b className="text-ink">
              {thang ? `tháng ${thang.slice(5)}/${thang.slice(0, 4)}` : `tháng hiện tại${sla ? ` (${sla.thang.slice(5)}/${sla.thang.slice(0, 4)})` : ""}`}
            </b>
            . Tái phát cách nhau quá 1 tháng sẽ không được gộp nhóm.
          </p>
        </div>
        <ThangFilter value={thang} onChange={setThang} />
      </div>

      <Card title="Báo cáo theo ngày">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
            Từ <input type="date" className={selCls} value={ngayTu} max={ngayDen} onChange={(e) => setNgayTu(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
            đến <input type="date" className={selCls} value={ngayDen} min={ngayTu} onChange={(e) => setNgayDen(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => { setNgayTu(todayISO); setNgayDen(todayISO); }}
            className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink-soft hover:bg-gray-50 lg:px-2 lg:py-1 lg:text-xs"
          >
            Hôm nay
          </button>
          <FilterSelect className={selCls} value={locNguoiTiepNhan} onChange={setLocNguoiTiepNhan} allLabel="Mọi người tiếp nhận"
            options={(nguoiDungQuery.data?.items ?? []).map((u) => ({ value: u.email, label: u.ten || u.email }))} />
          <FilterSelect className={selCls} value={locNguoiTao} onChange={setLocNguoiTao} allLabel="Mọi người tạo"
            options={(nguoiDungQuery.data?.items ?? []).map((u) => ({ value: u.email, label: u.ten || u.email }))} />
          <FilterSelect className={selCls} value={locNguon} onChange={setLocNguon} allLabel="Mọi nguồn"
            options={NGUON_OPTIONS} />
          <FilterSelect className={selCls} value={locNhomYeuCau} onChange={setLocNhomYeuCau} allLabel="Mọi nhóm yêu cầu"
            options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
          <FilterSelect className={selCls} value={locMucDo} onChange={setLocMucDo} allLabel="Mọi mức độ"
            options={(sortMucDoOptions(mucDoOptsTheoNgay.data ?? [])).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
          <FilterSelect className={selCls} value={locPhanLoaiKh} onChange={setLocPhanLoaiKh} allLabel="Mọi phân loại KH"
            options={(phanLoaiKhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
        </div>

        {theoNgayQuery.data?.co_loc && (
          <p className="mb-2 text-xs text-amber-700">
            Đang lọc: cột "Tồn cũ chưa/đã tiếp nhận", "Chưa tiếp nhận", "Còn tồn" chỉ tính được cho <b>hôm nay</b> —
            các ngày quá khứ hiện "—" vì số tồn đọng theo bộ lọc tại 1 thời điểm cũ chưa được lưu lại.
          </p>
        )}

        {theoNgayQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {theoNgayQuery.data && (
          <>
            <div className="flex flex-col gap-2 md:hidden">
              {theoNgayQuery.data.rows.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">Không có dữ liệu</p>}
              {theoNgayQuery.data.rows.map((r) => <TheoNgayCard key={r.ngay} r={r} />)}
            </div>
            <div className="hidden overflow-x-auto md:block">
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
          </>
        )}
      </Card>

      <Card title="SLA theo thời gian xử lý">
        {slaQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {sla && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-ink-soft lg:text-xs">
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
                      <div className="mb-0.5 flex items-center justify-between text-sm text-ink-soft lg:text-xs">
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
            <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-ink-soft lg:text-xs">
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
            <span className="text-sm text-ink-soft lg:text-xs">
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
          <p className="py-4 text-center text-sm text-ink-soft">Không có ca trùng lặp theo ID Truy xuất/ID Lada trong khoảng lọc này.</p>
        )}
        <div className="flex flex-col gap-3">
          {trungLapQuery.data?.groups.map((g) => (
            <div key={[...g.id_truy_van_ids, ...g.lada_ids].join("+")} className="rounded-md border border-line p-2.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {g.id_truy_van_ids.length > 0 && (
                  <span className="font-mono text-sm text-ink-soft lg:text-xs">
                    ID Truy xuất: {g.id_truy_van_ids.join(" → ")}
                  </span>
                )}
                {g.lada_ids.length > 0 && (
                  <span className="font-mono text-sm text-ink-soft lg:text-xs">
                    ID Lada: {g.lada_ids.join(" → ")}
                  </span>
                )}
                {g.tai_phat_trong_7_ngay ? (
                  <Badge tone="red">⚠ Tái phát trong {g.khoang_cach_ngan_nhat} ngày</Badge>
                ) : (
                  <Badge tone="gray">Cách nhau {g.khoang_cach_ngan_nhat} ngày</Badge>
                )}
                <span className="text-sm text-ink-soft lg:text-xs">{g.so_lan} lần phản ánh</span>
              </div>
              <div className="flex flex-col gap-1">
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setDetailId(it.id)}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50 lg:py-1 lg:text-xs"
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
