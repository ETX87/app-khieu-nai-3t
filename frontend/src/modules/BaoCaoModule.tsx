import { Fragment, useState, type ReactNode } from "react";
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
import { KpiCard } from "../components/ui/KpiCard";
import { Donut, InlineStackedBar, Legend, LineChart, SERIES, STATUS_GOOD, STATUS_WARN, StackedColumns } from "../components/charts/Charts";

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
  ton_cu: number;
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

const fmtSoVN = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

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
        <td key={c.key} className={`whitespace-nowrap px-2 py-2 ${bold ? "font-semibold text-ink" : ""}`}>
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

// ---- Khung trinh bay (DESIGN_SYSTEM.md §8) ----

const TITLE_ICON_PROPS = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const TITLE_ICONS = {
  lich: <svg {...TITLE_ICON_PROPS}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  nguoi: <svg {...TITLE_ICON_PROPS}><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="8" r="2.5" /><path d="M15.5 14c2.5.4 4.5 2.6 4.5 6" /></svg>,
  tocDo: <svg {...TITLE_ICON_PROPS}><path d="M12 13l4-4" /><path d="M4.9 19a9 9 0 1 1 14.2 0" /></svg>,
  sla: <svg {...TITLE_ICON_PROPS}><path d="M4 20V10M10 20V4M16 20v-7M3 20h18" /></svg>,
  loi: <svg {...TITLE_ICON_PROPS}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 9 9h-9Z" /></svg>,
  nhom: <svg {...TITLE_ICON_PROPS}><path d="M4 6h16M4 12h10M4 18h6" /></svg>,
  lap: <svg {...TITLE_ICON_PROPS}><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></svg>,
  baoCao: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 20V10M10 20V4M16 20v-7M3 20h18" /></svg>,
};

function CardTitle({ icon, children, tone = "brand" }: { icon: keyof typeof TITLE_ICONS; children: ReactNode; tone?: "brand" | "red" }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone === "red" ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"}`}>
        {TITLE_ICONS[icon]}
      </span>
      {children}
    </span>
  );
}

function SectionHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-base font-bold text-ink">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-500 to-brand-700" />
          {title}
        </h3>
        {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// Nhom nut dang "vien nang" (giong bo loc nhanh man Phan anh - DESIGN_SYSTEM.md 6.6).
function PillGroup<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors lg:px-2.5 lg:py-1 lg:text-xs ${
            value === o.value ? "bg-accent text-white shadow-brand" : "text-ink-soft hover:bg-surface hover:text-accent-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// O so lieu nho co cham mau series (tong hop khoang ngay).
function MiniStat({ label, value, color, sub }: { label: string; value: ReactNode; color?: string; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-body">
        {color && <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />}
        {label}
      </p>
      <p className="mt-1 text-xl font-extrabold leading-none text-ink">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-ink-soft">{sub}</p>}
    </div>
  );
}

// Ty le tiep nhan -> vien nang mau (xanh >= 90%, cam >= 60%, do con lai).
function TyLePill({ v }: { v: number | null }) {
  if (v == null) return <span className="text-ink-faint">—</span>;
  const cls = v >= 90 ? "bg-green-50 text-green-700 ring-green-200" : v >= 60 ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>{v}%</span>;
}

const So = ({ v }: { v: number | null | undefined }) =>
  v == null ? <span className="text-ink-faint">—</span> : v === 0 ? <span className="text-ink-faint">0</span> : <>{v}</>;

const TN_PARTS = [
  { key: "tu_mo", label: "Tự mở mới", color: SERIES[0] },
  { key: "tu_nguon_khac", label: "Nguồn khác", color: SERIES[1] },
  { key: "ton_cu", label: "Tồn cũ", color: SERIES[2] },
] as const;
const tnParts = (v: TheoNguoiTnSo) => TN_PARTS.map((p) => ({ label: p.label, color: p.color, value: v[p.key] }));

// Card mobile cho bang theo nguoi tiep nhan.
function TheoNguoiTnCard({ ten, v, tong, max }: { ten: string; v: TheoNguoiTnSo; tong?: boolean; max: number }) {
  return (
    <div className={`rounded-xl border p-3 shadow-card ${tong ? "border-brand-200 bg-accent-soft" : "border-line bg-surface"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-base font-bold text-ink">{ten}</span>
        <span className="shrink-0 text-sm text-ink-soft"><b className="text-lg font-extrabold text-ink">{v.tong_tiep_nhan}</b> ca</span>
      </div>
      <InlineStackedBar parts={tnParts(v)} max={max} className="mb-2.5" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <TheoNgayStat k="Tự mở mới" v={v.tu_mo} dot={SERIES[0]} />
        <TheoNgayStat k="Nguồn khác" v={v.tu_nguon_khac} dot={SERIES[1]} />
        <TheoNgayStat k="Tồn cũ" v={v.ton_cu} dot={SERIES[2]} />
        <TheoNgayStat k="Tỷ lệ TN" v={<TyLePill v={v.ty_le} />} />
        <TheoNgayStat k="TB giờ TN" v={fmtGio(v.tb_gio_tiep_nhan)} />
      </div>
    </div>
  );
}

// Bang ty le % so ca theo khoang ngay xu ly, tach theo Tong / Da ket thuc / Dang xu ly
// (giong bang pivot SLA hay dung ngoai Sheet, de xem toc do xu ly nhanh/cham chiem bao nhieu %).
function SlaTyLeTable({ buckets, tongDaKetThuc, tongDangXuLy }: { buckets: SlaBucket[]; tongDaKetThuc: number; tongDangXuLy: number }) {
  const rows = [
    { label: "Tổng", tong: tongDaKetThuc + tongDangXuLy, get: (b: SlaBucket) => b.da_ket_thuc + b.dang_xu_ly, hi: true },
    { label: "Đã kết thúc", tong: tongDaKetThuc, get: (b: SlaBucket) => b.da_ket_thuc, hi: false },
    { label: "Đang xử lý", tong: tongDangXuLy, get: (b: SlaBucket) => b.dang_xu_ly, hi: false },
  ];
  const pct = (n: number, tong: number) => (tong > 0 ? Math.round((n / tong) * 1000) / 10 : 0);
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[620px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left font-semibold text-ink-soft">
            <th className="whitespace-nowrap px-2.5 py-2">Trạng thái</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right">Tổng</th>
            {buckets.map((b) => (
              <th key={b.label} className="whitespace-nowrap px-2.5 py-2 text-right">{b.label}</th>
            ))}
            {buckets.map((b) => (
              <th key={`${b.label}-pct`} className="whitespace-nowrap bg-accent-soft px-2.5 py-2 text-right text-accent-ink">% {b.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={`border-b border-line text-ink-body last:border-0 ${r.hi ? "bg-accent-soft/30 font-semibold" : ""}`}>
              <td className="whitespace-nowrap px-2.5 py-2 font-semibold text-ink">{r.label}</td>
              <td className="whitespace-nowrap px-2.5 py-2 text-right font-bold text-ink">{r.tong}</td>
              {buckets.map((b) => (
                <td key={b.label} className="whitespace-nowrap px-2.5 py-2 text-right"><So v={r.get(b)} /></td>
              ))}
              {buckets.map((b) => (
                <td key={`${b.label}-pct`} className="whitespace-nowrap bg-accent-soft/40 px-2.5 py-2 text-right font-semibold text-accent-ink">{pct(r.get(b), r.tong)}%</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Danh sach xep hang co thanh ty le loi (thay bang mini chu thuan).
function ChotLoiMiniTable({ title, rows }: { title: string; rows: ChotLoiGroup[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3">
      <p className="mb-2 text-sm font-bold text-ink lg:text-xs">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint lg:text-xs">—</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((g) => {
            const bar = g.ca_co_loi === 0 ? "bg-line-strong" : g.ty_le_loi >= 50 ? "bg-red-500" : "bg-amber-400";
            const rate = g.ca_co_loi === 0 ? "text-ink-faint" : g.ty_le_loi >= 50 ? "text-red-600" : "text-amber-700";
            return (
              <div key={g.key} className="text-sm lg:text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink-body" title={g.key}>{g.key}</span>
                  <span className="shrink-0 text-ink-soft">{g.so_ca} ca</span>
                  <span className={`w-16 shrink-0 text-right font-bold ${rate}`}>{g.ca_co_loi > 0 ? `${g.ty_le_loi}% lỗi` : "—"}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface">
                  <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${Math.max(g.ca_co_loi > 0 ? 3 : 0, g.ty_le_loi)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TheoNgayStat({ k, v, dot }: { k: string; v: ReactNode; dot?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-ink-soft">
        {dot && <i className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        {k}
      </span>
      <span className="font-semibold text-ink">{v}</span>
    </div>
  );
}

// Card doc cho mobile - mo phong pattern KhieuNaiCard (bang 11 cot khong xem duoc tren man hinh
// hep, phai cuon ngang - card 1 the/ngay de doc thang khong can cuon).
function TheoNgayCard({ r }: { r: TheoNgayRow }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-base font-bold text-ink">{dmy(r.ngay)}</span>
        <span className="text-sm text-ink-soft">Còn tồn: <b className="text-brand-700">{r.con_ton ?? "—"}</b></span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <TheoNgayStat k="Ca mới" v={r.ca_moi} dot={SERIES[0]} />
        <TheoNgayStat k="Đã tiếp nhận" v={r.da_tiep_nhan} dot={SERIES[1]} />
        <TheoNgayStat k="Đã đóng" v={r.da_dong} dot={SERIES[2]} />
        <TheoNgayStat k="Tỷ lệ TN" v={<TyLePill v={r.ty_le_tiep_nhan} />} />
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
  const [locNguonThang, setLocNguonThang] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const thangQsParams = new URLSearchParams();
  if (thang) thangQsParams.set("thang", thang);
  if (locNguonThang) thangQsParams.set("nguon", locNguonThang);
  const thangQs = thangQsParams.toString() ? `?${thangQsParams.toString()}` : "";

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
    queryKey: ["bao-cao-sla", thang, locNguonThang],
    queryFn: () => api.get<SlaReport>(`/khieu-nai/bao-cao/sla${thangQs}`),
  });
  const trungLapQuery = useQuery({
    queryKey: ["bao-cao-trung-lap", thang, locNguonThang],
    queryFn: () => api.get<TrungLapReport>(`/khieu-nai/bao-cao/trung-lap${thangQs}`),
  });
  const chotLoiQuery = useQuery({
    queryKey: ["bao-cao-chot-loi", thang, locNguonThang],
    queryFn: () => api.get<ChotLoiReport>(`/khieu-nai/bao-cao/chot-loi${thangQs}`),
  });

  const sla = slaQuery.data;
  const maxNhom = Math.max(1, ...(sla?.theo_nhom_van_de.map((n) => n.so_ca) ?? [1]));

  const selCls =
    "rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/15 lg:px-2 lg:py-1 lg:text-xs";

  const [xemHetNgay, setXemHetNgay] = useState(false);
  const [moBangTocDo, setMoBangTocDo] = useState(false);
  const [moLocNgay, setMoLocNgay] = useState(false);
  const soLocNgay = [locNguoiTiepNhan, locNguoiTao, locNguon, locNhomYeuCau, locMucDo, locPhanLoaiKh].filter(Boolean).length;

  // Nut chon nhanh khoang ngay cho bao cao theo ngay (bieu do chi co y nghia khi >= 2 ngay).
  const KHOANG_NHANH = [
    { value: "hom-nay", label: "Hôm nay", tu: todayISO },
    { value: "7", label: "7 ngày", tu: isoAddDays(todayISO, -6) },
    { value: "30", label: "30 ngày", tu: isoAddDays(todayISO, -29) },
    { value: "thang", label: "Tháng này", tu: `${todayISO.slice(0, 8)}01` },
  ];
  const khoangDangChon = ngayDen === todayISO ? (KHOANG_NHANH.find((k) => k.tu === ngayTu)?.value ?? "") : "";

  const tn = theoNgayQuery.data;
  const tnRows = tn?.rows ?? [];
  const tongNgay = tnRows.reduce(
    (a, r) => ({ moi: a.moi + r.ca_moi, tn: a.tn + r.da_tiep_nhan, dong: a.dong + r.da_dong }),
    { moi: 0, tn: 0, dong: 0 },
  );
  const conTonCuoi = [...tnRows].reverse().find((r) => r.con_ton != null)?.con_ton ?? null;
  const ngayMoiTruoc = [...tnRows].reverse();

  const nguoiTn = theoNguoiTnQuery.data;
  const maxTn = Math.max(1, ...(nguoiTn?.rows.map((r) => r.tong_tiep_nhan) ?? [1]));

  const td = tocDoQuery.data;
  const tdRowsTang = td ? [...td.rows].reverse() : []; // backend tra ky moi nhat truoc -> dao lai cho truc thoi gian

  const cl = chotLoiQuery.data;
  const loiItems = cl
    ? [
        { label: "Nhà sản xuất", value: cl.tong.so_loi_nsx, color: SERIES[0] },
        { label: "Lắp đặt", value: cl.tong.so_loi_lap_dat, color: SERIES[1] },
        { label: "Thái độ KTV", value: cl.tong.so_loi_thai_do_ktv, color: SERIES[2] },
        { label: "Quy trình NSKX", value: cl.tong.so_loi_quy_trinh_nskx, color: SERIES[3] },
      ]
    : [];
  const tongLuotLoi = loiItems.reduce((a, b) => a + b.value, 0);
  const tl = trungLapQuery.data;
  const thangNhan = thang ? `tháng ${thang.slice(5)}/${thang.slice(0, 4)}` : `tháng hiện tại${sla ? ` (${sla.thang.slice(5)}/${sla.thang.slice(0, 4)})` : ""}`;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-hero text-white shadow-brand">{TITLE_ICONS.baoCao}</span>
        <div>
          <h2 className="text-xl font-bold text-ink lg:text-[21px]">Báo cáo</h2>
          <p className="text-xs text-ink-soft">Theo dõi, phân tích và đánh giá hiệu quả xử lý phản ánh</p>
        </div>
      </div>

      {/* ============ PHAN 1: TONG QUAN THEO THANG ============ */}
      <SectionHeader
        title="Tổng quan tháng"
        sub={<>Ca đang tồn (mọi lúc) + ca đóng/hủy/tiếp nhận trong <b className="text-ink">{thangNhan}</b>. Tái phát cách nhau quá 1 tháng không được gộp nhóm.</>}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect className={selCls} value={locNguonThang} onChange={setLocNguonThang} allLabel="Mọi nguồn" options={NGUON_OPTIONS} />
            <ThangFilter value={thang} onChange={setThang} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Đã kết thúc" value={sla?.tong_da_ket_thuc ?? "…"} tone="green" icon="xong" sub="ca đóng trong tháng" />
        <KpiCard label="Đang xử lý" value={sla?.tong_dang_xu_ly ?? "…"} tone="blue" icon="dangXuLy" sub="ca còn tồn" />
        <KpiCard label="TB thời gian xử lý" value={sla ? <>{fmtSoVN(sla.so_ngay_trung_binh)}<span className="ml-1 text-base font-bold">ngày</span></> : "…"} tone="brand" icon="choChot" sub="ca đã kết thúc" />
        <KpiCard label="Tỷ lệ ca có lỗi" value={cl ? `${cl.tong.ty_le_loi}%` : "…"} tone={cl && cl.tong.ty_le_loi >= 50 ? "red" : "amber"} icon="canhBao" sub={cl ? `${cl.tong.ca_co_loi}/${cl.tong.so_ca} ca đã chốt` : undefined} />
        <div className="col-span-2 md:col-span-1">
          <KpiCard label="Tái phát < 7 ngày" value={tl?.tong_tai_phat_7_ngay ?? "…"} tone="red" icon="lap" sub={tl ? `${tl.tong_nhom} nhóm trùng lặp` : undefined} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title={<CardTitle icon="sla">SLA theo thời gian xử lý</CardTitle>}>
          {slaQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
          {sla && (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Legend items={[
                  { label: "Đã kết thúc", color: STATUS_GOOD, value: sla.tong_da_ket_thuc },
                  { label: "Đang xử lý", color: STATUS_WARN, value: sla.tong_dang_xu_ly },
                ]} />
                <span className="text-xs text-ink-soft">Số ca theo số ngày xử lý</span>
              </div>
              <StackedColumns
                categories={sla.buckets.map((b) => b.label)}
                series={[
                  { key: "done", label: "Đã kết thúc", color: STATUS_GOOD, values: sla.buckets.map((b) => b.da_ket_thuc) },
                  { key: "open", label: "Đang xử lý", color: STATUS_WARN, values: sla.buckets.map((b) => b.dang_xu_ly) },
                ]}
              />
              <SlaTyLeTable buckets={sla.buckets} tongDaKetThuc={sla.tong_da_ket_thuc} tongDangXuLy={sla.tong_dang_xu_ly} />
              {sla.theo_nhom_van_de.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2.5 text-sm font-bold text-ink lg:text-xs">Theo nhóm vấn đề (ca đã kết thúc)</p>
                  <div className="flex flex-col gap-2.5">
                    {sla.theo_nhom_van_de.map((n, i) => (
                      <div key={n.nhom_van_de} className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-between gap-2 text-sm lg:text-xs">
                            <span className="truncate text-ink-body">{n.nhom_van_de}</span>
                            <span className="shrink-0 text-ink-soft"><b className="text-ink">{n.so_ca}</b> ca · <b className="text-ink">{n.so_ngay_trung_binh}</b> ngày TB</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-surface-2">
                            <div className="h-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${(n.so_ca / maxNhom) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        <Card className="lg:col-span-2" title={<CardTitle icon="loi">Cơ cấu lỗi đã chốt</CardTitle>}>
          {chotLoiQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
          {cl && (cl.tong.so_ca === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">Chưa có ca nào được chốt kết luận trong tháng này.</p>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
              <Donut items={loiItems} centerValue={tongLuotLoi} centerLabel="lượt lỗi" />
              <div className="w-full min-w-0 flex-1">
                <div className="flex flex-col divide-y divide-line">
                  {loiItems.map((it) => (
                    <div key={it.label} className="flex items-center gap-2 py-2 text-sm lg:text-xs">
                      <i className="h-3 w-3 shrink-0 rounded-full" style={{ background: it.color }} />
                      <span className="min-w-0 flex-1 truncate text-ink-body">{it.label}</span>
                      <b className="w-8 text-right text-ink">{it.value}</b>
                      <span className="w-11 text-right text-ink-soft">{tongLuotLoi ? Math.round((it.value / tongLuotLoi) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs text-ink-soft">
                  Đã chốt <b className="text-ink">{cl.tong.so_ca}</b> ca, <b className="text-ink">{cl.tong.ca_co_loi}</b> ca có lỗi. 1 ca có thể có nhiều loại lỗi.
                </p>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {cl && cl.tong.so_ca > 0 && (
        <Card title={<CardTitle icon="nhom">Tỷ lệ lỗi theo nhóm</CardTitle>}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ChotLoiMiniTable title="Theo tháng (đóng ca)" rows={cl.theo_thang.slice(0, 12)} />
            <ChotLoiMiniTable title="Theo tỉnh" rows={cl.theo_tinh} />
            <ChotLoiMiniTable title="Theo nhóm yêu cầu" rows={cl.theo_nhom_yeu_cau} />
            <ChotLoiMiniTable title="Theo nhóm vấn đề" rows={cl.theo_nhom_van_de} />
            <ChotLoiMiniTable title="Theo nguồn tạo" rows={cl.theo_nguon_tao} />
            <ChotLoiMiniTable title="Theo người tạo" rows={cl.theo_nguoi_tao} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
            <span className="flex items-center gap-1"><i className="h-2 w-4 rounded-full bg-red-500" /> ≥ 50% ca có lỗi</span>
            <span className="flex items-center gap-1"><i className="h-2 w-4 rounded-full bg-amber-400" /> dưới 50%</span>
          </p>
        </Card>
      )}

      {/* ============ PHAN 2: VAN HANH HANG NGAY ============ */}
      <SectionHeader title="Vận hành hằng ngày" sub="Tiếp nhận, xử lý và tốc độ theo khoảng ngày tự chọn (không theo bộ lọc tháng ở trên)." />

      <Card title={<CardTitle icon="lich">Báo cáo theo ngày</CardTitle>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <PillGroup value={khoangDangChon} options={KHOANG_NHANH} onChange={(v) => { setNgayTu(KHOANG_NHANH.find((k) => k.value === v)!.tu); setNgayDen(todayISO); }} />
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <label className="flex min-w-0 items-center gap-1 text-sm text-ink-soft lg:text-xs">
              Từ <input type="date" className={`${selCls} min-w-0 flex-1`} value={ngayTu} max={ngayDen} onChange={(e) => setNgayTu(e.target.value)} />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-sm text-ink-soft lg:text-xs">
              đến <input type="date" className={`${selCls} min-w-0 flex-1`} value={ngayDen} min={ngayTu} onChange={(e) => setNgayDen(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            onClick={() => setMoLocNgay((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft hover:text-accent-ink md:hidden"
          >
            Bộ lọc
            {soLocNgay > 0 && <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs leading-none text-white">{soLocNgay}</span>}
            <span className="text-xs text-ink-soft">{moLocNgay ? "▲" : "▼"}</span>
          </button>
        </div>
        <div className={`${moLocNgay ? "flex" : "hidden"} mb-3 flex-col gap-2 md:flex md:flex-row md:flex-wrap md:items-end`}>
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

        {tn?.co_loc && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
            Đang lọc: cột "Tồn cũ chưa/đã tiếp nhận", "Chưa tiếp nhận", "Còn tồn" chỉ tính được cho <b>hôm nay</b> —
            các ngày quá khứ hiện "—" vì số tồn đọng theo bộ lọc tại 1 thời điểm cũ chưa được lưu lại.
          </p>
        )}

        {theoNgayQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {tn && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <MiniStat label="Ca mới" value={tongNgay.moi} color={SERIES[0]} sub={tnRows.length > 1 ? `${tnRows.length} ngày` : dmy(tn.tu_ngay)} />
              <MiniStat label="Đã tiếp nhận" value={tongNgay.tn} color={SERIES[1]} />
              <MiniStat label="Đã đóng" value={tongNgay.dong} color={SERIES[2]} />
              <MiniStat label="Còn tồn" value={conTonCuoi ?? "—"} sub="cuối khoảng" />
            </div>

            {tnRows.length > 1 && (
              <div className="mb-4 rounded-xl border border-line p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-ink lg:text-xs">Xu hướng theo ngày</p>
                  <Legend items={[
                    { label: "Ca mới", color: SERIES[0] },
                    { label: "Đã tiếp nhận", color: SERIES[1] },
                    { label: "Đã đóng", color: SERIES[2] },
                  ]} />
                </div>
                <LineChart
                  labels={tnRows.map((r) => dmy(r.ngay).slice(0, 5))}
                  tipLabels={tnRows.map((r) => dmy(r.ngay))}
                  series={[
                    { key: "moi", label: "Ca mới", color: SERIES[0], values: tnRows.map((r) => r.ca_moi), area: true },
                    { key: "tn", label: "Đã tiếp nhận", color: SERIES[1], values: tnRows.map((r) => r.da_tiep_nhan) },
                    { key: "dong", label: "Đã đóng", color: SERIES[2], values: tnRows.map((r) => r.da_dong) },
                  ]}
                />
              </div>
            )}

            <div className="flex flex-col gap-2 md:hidden">
              {tnRows.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">Không có dữ liệu</p>}
              {(xemHetNgay ? ngayMoiTruoc : ngayMoiTruoc.slice(0, 5)).map((r) => <TheoNgayCard key={r.ngay} r={r} />)}
              {ngayMoiTruoc.length > 5 && (
                <button type="button" onClick={() => setXemHetNgay((v) => !v)} className="rounded-lg py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-soft">
                  {xemHetNgay ? "Thu gọn" : `Xem thêm ${ngayMoiTruoc.length - 5} ngày`}
                </button>
              )}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-left font-semibold text-ink-soft">
                    <th className="whitespace-nowrap px-2.5 py-2">Ngày</th>
                    <th className="whitespace-nowrap px-2.5 py-2"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: SERIES[0] }} />Ca mới</span></th>
                    <th className="whitespace-nowrap px-2.5 py-2">Tồn cũ chưa TN</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Tồn cũ đã TN</th>
                    <th className="whitespace-nowrap px-2.5 py-2"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: SERIES[1] }} />Đã tiếp nhận</span></th>
                    <th className="whitespace-nowrap px-2.5 py-2"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: SERIES[2] }} />Đã đóng</span></th>
                    <th className="whitespace-nowrap px-2.5 py-2">TB giờ TN</th>
                    <th className="whitespace-nowrap px-2.5 py-2">TB giờ XL</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Tỷ lệ TN</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Chưa TN</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Còn tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {tnRows.map((r) => (
                    <tr key={r.ngay} className="border-b border-line text-ink-body last:border-0 hover:bg-accent-soft/50">
                      <td className="whitespace-nowrap px-2.5 py-2 font-semibold text-ink">{dmy(r.ngay)}</td>
                      <td className="px-2.5 py-2 font-semibold text-ink"><So v={r.ca_moi} /></td>
                      <td className="px-2.5 py-2"><So v={r.ton_cu_chua_tiep_nhan} /></td>
                      <td className="px-2.5 py-2"><So v={r.ton_cu_da_tiep_nhan} /></td>
                      <td className="px-2.5 py-2"><So v={r.da_tiep_nhan} /></td>
                      <td className="px-2.5 py-2"><So v={r.da_dong} /></td>
                      <td className="px-2.5 py-2">{r.tb_gio_tiep_nhan ?? <span className="text-ink-faint">—</span>}</td>
                      <td className="px-2.5 py-2">{r.tb_gio_xu_ly ?? <span className="text-ink-faint">—</span>}</td>
                      <td className="px-2.5 py-2"><TyLePill v={r.ty_le_tiep_nhan} /></td>
                      <td className="px-2.5 py-2">{r.cho_tiep_nhan ? <b className="text-red-600">{r.cho_tiep_nhan}</b> : <So v={r.cho_tiep_nhan} />}</td>
                      <td className="px-2.5 py-2">{r.con_ton != null ? <b className="text-brand-700">{r.con_ton}</b> : <So v={null} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card title={<CardTitle icon="nguoi">Theo người tiếp nhận</CardTitle>}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <p className="max-w-3xl text-xs text-ink-soft">
            Cùng khoảng ngày và bộ lọc của báo cáo theo ngày. Chỉ hiện người có tiếp nhận ca trong khoảng. <b>Tự mở mới</b> / <b>Nguồn khác</b>: ca mở
            trong khoảng (tự tạo & nhận luôn / người khác tạo, bấm Tiếp nhận). <b>Tồn cũ</b>: ca mở trước khoảng, được nhận trong khoảng.
            Tỷ lệ = (tự mở mới + nguồn khác) ÷ tổng ca mở mới mọi nguồn
            {nguoiTn ? <> (<b className="text-ink">{nguoiTn.tong_ca_moi}</b> ca)</> : null} — tồn cũ không tính vào tỷ lệ.
            TB giờ TN tính các ca bấm Tiếp nhận (nguồn khác + tồn cũ).
          </p>
          <Legend items={TN_PARTS.map((p) => ({ label: p.label, color: p.color }))} />
        </div>
        {theoNguoiTnQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {nguoiTn && (
          <>
            <div className="flex flex-col gap-2 md:hidden">
              <TheoNguoiTnCard ten="Toàn hệ thống" v={nguoiTn.tong} tong max={Math.max(1, nguoiTn.tong.tong_tiep_nhan)} />
              {nguoiTn.rows.map((r) => <TheoNguoiTnCard key={r.email} ten={r.ten || r.email} v={r} max={maxTn} />)}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
              <table className="w-full min-w-[820px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-left font-semibold text-ink-soft">
                    <th className="whitespace-nowrap px-2.5 py-2">Người tiếp nhận</th>
                    <th className="w-[28%] whitespace-nowrap px-2.5 py-2">Cơ cấu tiếp nhận</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Tự mở mới</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Nguồn khác</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Tồn cũ</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Tổng tiếp nhận</th>
                    <th className="whitespace-nowrap px-2.5 py-2">Tỷ lệ TN</th>
                    <th className="whitespace-nowrap px-2.5 py-2">TB giờ TN</th>
                  </tr>
                </thead>
                <tbody>
                  {[{ key: "__tong__", ten: "Toàn hệ thống", v: nguoiTn.tong, tong: true },
                    ...nguoiTn.rows.map((r) => ({ key: r.email, ten: r.ten || r.email, v: r as TheoNguoiTnSo, tong: false }))].map((x) => (
                    <tr key={x.key} className={`border-b border-line text-ink-body last:border-0 ${x.tong ? "bg-accent-soft font-semibold text-ink" : "hover:bg-accent-soft/50"}`}>
                      <td className="whitespace-nowrap px-2.5 py-2 font-semibold text-ink">{x.ten}</td>
                      <td className="px-2.5 py-2">
                        <InlineStackedBar parts={tnParts(x.v)} max={x.tong ? Math.max(1, x.v.tong_tiep_nhan) : maxTn} />
                      </td>
                      <td className="px-2.5 py-2"><So v={x.v.tu_mo} /></td>
                      <td className="px-2.5 py-2"><So v={x.v.tu_nguon_khac} /></td>
                      <td className="px-2.5 py-2"><So v={x.v.ton_cu} /></td>
                      <td className="px-2.5 py-2 text-sm font-bold text-ink">{x.v.tong_tiep_nhan}</td>
                      <td className="px-2.5 py-2"><TyLePill v={x.v.ty_le} /></td>
                      <td className="px-2.5 py-2">{fmtGio(x.v.tb_gio_tiep_nhan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nguoiTn.rows.length === 0 && (
              <p className="py-2 text-center text-sm text-ink-soft">Chưa có ai tiếp nhận ca trong khoảng này.</p>
            )}
          </>
        )}
      </Card>

      <Card title={<CardTitle icon="tocDo">Tốc độ xử lý toàn hệ thống</CardTitle>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <PillGroup value={tdKy} options={KY_OPTIONS as { value: "ngay" | "tuan" | "thang"; label: string }[]} onChange={setTdKy} />
          <FilterSelect className={selCls} value={tdPhanLoai} onChange={(v) => { setTdPhanLoai(v); setMoNhom(new Set()); }}
            allLabel="Không phân loại" options={PHAN_LOAI_OPTIONS} />
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <label className="flex min-w-0 items-center gap-1 text-sm text-ink-soft lg:text-xs">
              Từ <input type="date" className={`${selCls} min-w-0 flex-1`} value={tdTu} max={tdDen} onChange={(e) => setTdTu(e.target.value)} />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-sm text-ink-soft lg:text-xs">
              đến <input type="date" className={`${selCls} min-w-0 flex-1`} value={tdDen} min={tdTu} onChange={(e) => setTdDen(e.target.value)} />
            </label>
          </div>
        </div>
        <p className="mb-3 text-xs text-ink-soft">
          Mỗi mốc tính từ lúc <b>mở ca</b> đến khi mốc đó xảy ra, xếp vào kỳ theo <b>ngày xảy ra mốc</b>. Không tính ca đã hủy.
          {td && (td.tu_ngay !== tdTu || td.den_ngay !== tdDen) && (
            <> Khoảng ngày được giới hạn còn <b className="text-ink">{dmy(td.tu_ngay)} – {dmy(td.den_ngay)}</b> cho kiểu kỳ này.</>
          )}
        </p>
        {tocDoQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {td && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4 xl:gap-3">
              {TOC_DO_MOC_COLS.map((c, i) => (
                <div key={c.key} className="relative overflow-hidden rounded-xl border border-line bg-surface p-3 shadow-card" title={c.hint}>
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: SERIES[i] }} />
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-body">
                    <i className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i] }} />
                    TB đến {c.label.charAt(0).toLowerCase() + c.label.slice(1)}
                  </p>
                  <p className="mt-1 text-xl font-extrabold leading-none text-ink sm:text-2xl">{fmtGio(td.tong[c.key].tb_gio)}</p>
                  <p className="mt-1 text-[11px] text-ink-soft">{td.tong[c.key].sl} ca · cả khoảng</p>
                  {tdRowsTang.length > 1 && (
                    <div className="mt-2">
                      <LineChart
                        compact
                        height={52}
                        labels={tdRowsTang.map((r) => r.ky)}
                        tipLabels={tdRowsTang.map((r) => kyLabel(td.ky, r.ky))}
                        fmt={(v) => fmtGio(v)}
                        series={[{ key: c.key, label: `TB ${c.label}`, color: SERIES[i], area: true, values: tdRowsTang.map((r) => (r[c.key].sl > 0 ? r[c.key].tb_gio : null)) }]}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMoBangTocDo((v) => !v)}
              className="mb-2 w-full rounded-lg border border-line-strong py-2.5 text-sm font-semibold text-ink-body hover:bg-accent-soft hover:text-accent-ink md:hidden"
            >
              {moBangTocDo ? "Ẩn bảng chi tiết theo kỳ" : "Xem bảng chi tiết theo kỳ"}
            </button>
            <div className={`${moBangTocDo ? "block" : "hidden"} overflow-x-auto rounded-xl border border-line md:block`}>
              <table className="w-full min-w-[720px] border-collapse text-sm lg:text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-left font-semibold text-ink-soft">
                    <th className="sticky left-0 whitespace-nowrap bg-surface-2 px-2 py-2">Kỳ</th>
                    {TOC_DO_MOC_COLS.map((c, i) => (
                      <th key={c.key} className="whitespace-nowrap px-2 py-2" title={c.hint}>
                        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} />TB {c.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-accent-soft">
                    <td className="sticky left-0 whitespace-nowrap bg-accent-soft px-2 py-2 font-bold text-ink">Cả khoảng</td>
                    <TocDoCells v={td.tong} bold />
                  </tr>
                  {td.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-2 py-6 text-center text-ink-soft">Không có dữ liệu</td></tr>
                  )}
                  {td.rows.map((r) => {
                    const mo = moNhom.has(r.ky);
                    const coNhom = r.nhom.length > 0;
                    return (
                      <Fragment key={r.ky}>
                        <tr className="border-b border-line text-ink-body hover:bg-accent-soft/50">
                          <td className="sticky left-0 whitespace-nowrap bg-surface px-2 py-2 font-semibold text-ink">
                            {coNhom ? (
                              <button type="button" onClick={() => toggleNhom(r.ky)} className="flex items-center gap-1 hover:text-accent">
                                <span className="inline-block w-3 text-ink-soft">{mo ? "▾" : "▸"}</span>
                                {kyLabel(td.ky, r.ky)}
                                <span className="text-xs font-normal text-ink-faint">({r.nhom.length})</span>
                              </button>
                            ) : (
                              kyLabel(td.ky, r.ky)
                            )}
                          </td>
                          <TocDoCells v={r} />
                        </tr>
                        {mo && r.nhom.map((g) => (
                          <tr key={`${r.ky}-${g.key}`} className="border-b border-line bg-surface-2/60 text-ink-body">
                            <td className="sticky left-0 whitespace-nowrap bg-surface-2 py-2 pl-7 pr-2 text-ink-soft">
                              {td.phan_loai === "nguon" ? nguonLabel(g.key) : g.nhan}
                            </td>
                            <TocDoCells v={g} />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tdPhanLoai && td.rows.some((r) => r.nhom.length > 0) && (
              <p className="mt-2 text-xs text-ink-soft">Bấm vào từng kỳ để xem chi tiết theo phân loại.</p>
            )}
          </>
        )}
      </Card>

      <Card title={<CardTitle icon="lap" tone="red">Ca trùng lặp / tái phát theo ID Lada</CardTitle>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {tl && <Badge tone="violet">{tl.tong_nhom} nhóm</Badge>}
          {tl && tl.tong_tai_phat_7_ngay > 0 && <Badge tone="red" dot>{tl.tong_tai_phat_7_ngay} tái phát &lt; 7 ngày</Badge>}
          <span className="text-xs text-ink-soft">Theo <b className="text-ink">{thangNhan}</b> (bộ lọc tháng ở phần Tổng quan).</span>
        </div>
        {trungLapQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">Đang tải...</p>}
        {tl && tl.groups.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-soft">Không có ca trùng lặp theo ID Truy xuất/ID Lada trong khoảng lọc này.</p>
        )}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {tl?.groups.map((g) => (
            <div
              key={[...g.id_truy_van_ids, ...g.lada_ids].join("+")}
              className={`rounded-xl border border-l-4 p-3 shadow-card ${g.tai_phat_trong_7_ngay ? "border-red-200 border-l-red-500 bg-red-50/40" : "border-line border-l-brand-300 bg-surface"}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {g.tai_phat_trong_7_ngay ? (
                  <Badge tone="red" dot>Tái phát trong {g.khoang_cach_ngan_nhat} ngày</Badge>
                ) : (
                  <Badge tone="gray">Cách nhau {g.khoang_cach_ngan_nhat} ngày</Badge>
                )}
                <span className="text-sm font-semibold text-ink lg:text-xs">{g.so_lan} lần phản ánh</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {g.id_truy_van_ids.length > 0 && (
                  <span className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs text-ink-body">ID Truy xuất: {g.id_truy_van_ids.join(" → ")}</span>
                )}
                {g.lada_ids.length > 0 && (
                  <span className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs text-ink-body">ID Lada: {g.lada_ids.join(" → ")}</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setDetailId(it.id)}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent-soft sm:flex-nowrap lg:py-1.5 lg:text-xs"
                  >
                    <span className="min-w-0 basis-full truncate text-ink-body sm:flex-1 sm:basis-auto">
                      <span className="font-mono font-semibold text-link">{it.id}</span> · {it.ten_khach ?? "—"} ·{" "}
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
