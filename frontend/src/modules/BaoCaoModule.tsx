import { Fragment, useState } from "react";
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

interface TheoNguoiTnSo {
  tu_mo: number;
  tu_nguon_khac: number;
  tong_tiep_nhan: number;
  ty_le: number | null;
  tb_gio_tiep_nhan: number | null;
}
interface TheoNguoiTnRow extends TheoNguoiTnSo {
  email: string;
  ten: string | null;
}
interface TheoNguoiTnReport {
  tong_ca_moi: number;
  ton_cu_chua_tn: number;
  tong: TheoNguoiTnSo;
  rows: TheoNguoiTnRow[];
}

type TocDoMoc = "tn" | "vp" | "ql" | "kt";
type TocDoCell = { sl: number; tb_gio: number | null };
type TocDoSo = Record<TocDoMoc, TocDoCell>;
interface TocDoReport {
  tu_ngay: string;
  den_ngay: string;
  ky: "ngay" | "tuan" | "thang";
  phan_loai: string;
  tong: TocDoSo;
  rows: (TocDoSo & { ky: string; nhom: (TocDoSo & { key: string; nhan: string })[] })[];
}
const TOC_DO_MOC_COLS: { key: TocDoMoc; label: string; hint: string }[] = [
  { key: "tn", label: "Tiếp nhận", hint: "Từ lúc mở ca đến khi CSKH bấm Tiếp nhận (không tính ca tự mở - nhận ngay)" },
  { key: "vp", label: "Chốt vi phạm", hint: "Từ lúc mở ca đến lần đánh giá cuối cùng đủ 4 lỗi + kết luận" },
  { key: "ql", label: "Đánh giá QL", hint: "Từ lúc mở ca đến khi QL nhập Đánh giá QL" },
  { key: "kt", label: "Chốt kết thúc", hint: "Từ lúc mở ca đến khi ca chuyển Đã kết thúc" },
];
const KY_OPTIONS = [
  { value: "ngay", label: "Theo ngày" },
  { value: "tuan", label: "Theo tuần" },
  { value: "thang", label: "Theo tháng" },
];
const PHAN_LOAI_OPTIONS = [
  { value: "nguoi_tiep_nhan", label: "Theo người tiếp nhận" },
  { value: "nguon", label: "Theo nguồn" },
  { value: "tinh", label: "Theo tỉnh" },
];

// Gio -> chu de doc: <1 gio hien phut, <48 gio hien gio, con lai hien ngay.
function fmtGio(h: number | null | undefined): string {
  if (h == null) return "—";
  const f1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (h < 1) return `${Math.round(h * 60)} phút`;
  if (h < 48) return `${f1(h)} giờ`;
  return `${f1(h / 24)} ngày`;
}

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
function kyLabel(ky: TocDoReport["ky"], key: string): string {
  if (ky === "thang") return `Tháng ${key.slice(5, 7)}/${key.slice(0, 4)}`;
  if (ky === "tuan") return `Tuần ${dmy(key).slice(0, 5)}–${dmy(isoAddDays(key, 6))}`;
  return dmy(key);
}

function TocDoCells({ v, bold }: { v: TocDoSo; bold?: boolean }) {
  return (
    <>
      {TOC_DO_MOC_COLS.map((c) => (
        <td key={c.key} className={`whitespace-nowrap px-2 py-1.5 ${bold ? "font-semibold text-ink" : ""}`}>
          {v[c.key].sl > 0 ? (
            <>
              {fmtGio(v[c.key].tb_gio)} <span className="font-normal text-ink-faint">· {v[c.key].sl} ca</span>
            </>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </td>
      ))}
    </>
  );
}

// Card mobile cho bang theo nguoi tiep nhan.
function TheoNguoiTnCard({ ten, v, tong }: { ten: string; v: TheoNguoiTnSo; tong?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${tong ? "border-accent/40 bg-accent-soft/40" : "border-line bg-white"}`}>
      <div className="mb-2 text-base font-semibold text-ink">{ten}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <TheoNgayStat k="Tự mở mới" v={v.tu_mo} />
        <TheoNgayStat k="Từ nguồn khác" v={v.tu_nguon_khac} />
        <TheoNgayStat k="Tổng tiếp nhận" v={v.tong_tiep_nhan} />
        <TheoNgayStat k="Tỷ lệ TN" v={v.ty_le != null ? `${v.ty_le}%` : "—"} />
        <TheoNgayStat k="TB giờ TN" v={fmtGio(v.tb_gio_tiep_nhan)} />
      </div>
    </div>
  );
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

  const theoNguoiTnQuery = useQuery({
    queryKey: ["bao-cao-theo-nguoi-tn", ngayTu, ngayDen, locNguoiTiepNhan, locNguoiTao, locNguon, locNhomYeuCau, locMucDo, locPhanLoaiKh],
    queryFn: () => api.get<TheoNguoiTnReport>(`/khieu-nai/bao-cao/theo-nguoi-tiep-nhan?${theoNgayQs.toString()}`),
  });

  // Toc do xu ly: mac dinh theo thang, 6 thang gan nhat (tinh ca thang hien tai).
  const [tdKy, setTdKy] = useState<"ngay" | "tuan" | "thang">("thang");
  const [tdPhanLoai, setTdPhanLoai] = useState("");
  const [tdTu, setTdTu] = useState(() => {
    const d = new Date(`${todayISO.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 5);
    return d.toISOString().slice(0, 10);
  });
  const [tdDen, setTdDen] = useState(todayISO);
  const tocDoQuery = useQuery({
    queryKey: ["bao-cao-toc-do", tdKy, tdPhanLoai, tdTu, tdDen],
    queryFn: () => {
      const q = new URLSearchParams({ ky: tdKy, tu_ngay: tdTu, den_ngay: tdDen });
      if (tdPhanLoai) q.set("phan_loai", tdPhanLoai);
      return api.get<TocDoReport>(`/khieu-nai/bao-cao/toc-do-xu-ly?${q.toString()}`);
    },
  });
  const nguonLabel = (v: string) => NGUON_OPTIONS.find((o) => o.value === v)?.label ?? (v || "(Chưa có)");
  const [moNhom, setMoNhom] = useState<Set<string>>(new Set());
  const toggleNhom = (k: string) =>
    setMoNhom((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

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

        <div className="mt-5 border-t border-line pt-4">
          <h4 className="mb-1 text-sm font-semibold text-ink">Theo người tiếp nhận</h4>
          <p className="mb-3 text-xs text-ink-soft">
            Cùng khoảng ngày và bộ lọc ở trên. Chỉ hiện người có tiếp nhận ca trong khoảng. Tỷ lệ = tổng tiếp nhận ÷ (ca mở mới
            mọi nguồn + ca tồn cũ chưa tiếp nhận đầu kỳ)
            {theoNguoiTnQuery.data ? (
              <> = <b className="text-ink">{theoNguoiTnQuery.data.tong_ca_moi}</b> + <b className="text-ink">{theoNguoiTnQuery.data.ton_cu_chua_tn}</b> ={" "}
                <b className="text-ink">{theoNguoiTnQuery.data.tong_ca_moi + theoNguoiTnQuery.data.ton_cu_chua_tn}</b> ca</>
            ) : null}.
            TB giờ TN chỉ tính ca tiếp nhận từ nguồn khác (ca tự mở được nhận ngay).
          </p>
          {theoNguoiTnQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
          {theoNguoiTnQuery.data && (
            <>
              <div className="flex flex-col gap-2 md:hidden">
                <TheoNguoiTnCard ten="Toàn hệ thống" v={theoNguoiTnQuery.data.tong} tong />
                {theoNguoiTnQuery.data.rows.map((r) => <TheoNguoiTnCard key={r.email} ten={r.ten || r.email} v={r} />)}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-line text-left font-semibold uppercase tracking-wide text-ink-soft">
                      <th className="whitespace-nowrap px-2 py-1.5">Người tiếp nhận</th>
                      <th className="whitespace-nowrap px-2 py-1.5">Tự mở mới</th>
                      <th className="whitespace-nowrap px-2 py-1.5">Từ nguồn khác</th>
                      <th className="whitespace-nowrap px-2 py-1.5">Tổng tiếp nhận</th>
                      <th className="whitespace-nowrap px-2 py-1.5">Tỷ lệ TN</th>
                      <th className="whitespace-nowrap px-2 py-1.5">TB giờ TN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[{ key: "__tong__", ten: "Toàn hệ thống", v: theoNguoiTnQuery.data.tong, tong: true },
                      ...theoNguoiTnQuery.data.rows.map((r) => ({ key: r.email, ten: r.ten || r.email, v: r as TheoNguoiTnSo, tong: false }))].map((x) => (
                      <tr key={x.key} className={`border-b border-line last:border-0 ${x.tong ? "bg-accent-soft/40 font-semibold text-ink" : ""}`}>
                        <td className="whitespace-nowrap px-2 py-1.5 font-medium text-ink">{x.ten}</td>
                        <td className="px-2 py-1.5">{x.v.tu_mo}</td>
                        <td className="px-2 py-1.5">{x.v.tu_nguon_khac}</td>
                        <td className="px-2 py-1.5">{x.v.tong_tiep_nhan}</td>
                        <td className="px-2 py-1.5">{x.v.ty_le != null ? `${x.v.ty_le}%` : "—"}</td>
                        <td className="px-2 py-1.5">{fmtGio(x.v.tb_gio_tiep_nhan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {theoNguoiTnQuery.data.rows.length === 0 && (
                <p className="py-2 text-center text-sm text-ink-soft">Chưa có ai tiếp nhận ca trong khoảng này.</p>
              )}
            </>
          )}
        </div>
      </Card>

      <Card title="Tốc độ xử lý toàn hệ thống">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <FilterSelect className={selCls} value={tdKy} onChange={(v) => setTdKy(v as "ngay" | "tuan" | "thang")} options={KY_OPTIONS} />
          <FilterSelect className={selCls} value={tdPhanLoai} onChange={(v) => { setTdPhanLoai(v); setMoNhom(new Set()); }}
            allLabel="Không phân loại" options={PHAN_LOAI_OPTIONS} />
          <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
            Từ <input type="date" className={selCls} value={tdTu} max={tdDen} onChange={(e) => setTdTu(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
            đến <input type="date" className={selCls} value={tdDen} min={tdTu} onChange={(e) => setTdDen(e.target.value)} />
          </label>
        </div>
        <p className="mb-3 text-xs text-ink-soft">
          Mỗi mốc tính từ lúc <b>mở ca</b> đến khi mốc đó xảy ra, xếp vào kỳ theo <b>ngày xảy ra mốc</b>. Mỗi ô: thời gian trung bình · số ca.
          Không tính ca đã hủy.
          {tocDoQuery.data && (tocDoQuery.data.tu_ngay !== tdTu || tocDoQuery.data.den_ngay !== tdDen) && (
            <> Khoảng ngày được giới hạn còn <b className="text-ink">{dmy(tocDoQuery.data.tu_ngay)} – {dmy(tocDoQuery.data.den_ngay)}</b> cho kiểu kỳ này.</>
          )}
        </p>
        {tocDoQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {tocDoQuery.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm lg:text-xs">
              <thead>
                <tr className="border-b border-line text-left font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="sticky left-0 whitespace-nowrap bg-white px-2 py-1.5">Kỳ</th>
                  {TOC_DO_MOC_COLS.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-2 py-1.5" title={c.hint}>TB {c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line bg-accent-soft/40">
                  <td className="sticky left-0 whitespace-nowrap bg-accent-soft px-2 py-1.5 font-semibold text-ink">Cả khoảng</td>
                  <TocDoCells v={tocDoQuery.data.tong} bold />
                </tr>
                {tocDoQuery.data.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-6 text-center text-ink-soft">Không có dữ liệu</td></tr>
                )}
                {tocDoQuery.data.rows.map((r) => {
                  const mo = moNhom.has(r.ky);
                  const coNhom = r.nhom.length > 0;
                  return (
                    <Fragment key={r.ky}>
                      <tr className="border-b border-line">
                        <td className="sticky left-0 whitespace-nowrap bg-white px-2 py-1.5 font-medium text-ink">
                          {coNhom ? (
                            <button type="button" onClick={() => toggleNhom(r.ky)} className="flex items-center gap-1 hover:text-accent">
                              <span className="inline-block w-3 text-ink-soft">{mo ? "▾" : "▸"}</span>
                              {kyLabel(tocDoQuery.data.ky, r.ky)}
                              <span className="text-xs font-normal text-ink-faint">({r.nhom.length})</span>
                            </button>
                          ) : (
                            kyLabel(tocDoQuery.data.ky, r.ky)
                          )}
                        </td>
                        <TocDoCells v={r} />
                      </tr>
                      {mo && r.nhom.map((g) => (
                        <tr key={`${r.ky}-${g.key}`} className="border-b border-line bg-surface-2/60">
                          <td className="sticky left-0 whitespace-nowrap bg-surface-2 py-1.5 pl-7 pr-2 text-ink-soft">
                            {tocDoQuery.data.phan_loai === "nguon" ? nguonLabel(g.key) : g.nhan}
                          </td>
                          <TocDoCells v={g} />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {tdPhanLoai && tocDoQuery.data.rows.some((r) => r.nhom.length > 0) && (
              <p className="mt-2 text-xs text-ink-soft">Bấm vào từng kỳ để xem chi tiết theo phân loại.</p>
            )}
          </div>
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
