import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AppUser, DanhGia3, KhieuNai, LichSu, TienTrinh } from "../api/types";
import { fmtVN, translateDanhGia } from "../lib/formatVN";
import { mucDoTone, MUC_DO_BG, camCoBorderClass, sortMucDoOptions } from "../lib/severity";
import { useCreateSettingsOption, useSettingsOptions } from "../api/useSettingsOptions";
import { Btn } from "../components/ui/Btn";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Combobox } from "../components/ui/Combobox";
import { StatusBadge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";
import { Timeline, type TimelineEvent } from "../components/ui/Timeline";
import { Tabs, type TabItem } from "../components/ui/Tabs";
import { NGUON_OPTIONS, NGUON_LABEL } from "./KhieuNaiForm";

interface RelatedItem {
  id: string;
  ngay_tiep_nhan: string;
  trang_thai: string;
  ten_khach: string | null;
  van_de_dau_vao: string | null;
  nhom_van_de: string | null;
  id_crm_karofi: string | null;
  id_lada: string | null;
  id_lada_phat_sinh: string | null;
}

interface DetailResponse {
  khieuNai: KhieuNai;
  tienTrinh: TienTrinh[];
  lichSu: LichSu[];
  giaiTrinhDeadline: { overdue: boolean; deadline: string } | null;
  related: RelatedItem[];
}

const DANH_GIA_OPTIONS = [
  { value: "Chua danh gia", label: "Chưa đánh giá" },
  { value: "Khong", label: "Không" },
  { value: "Co", label: "Có" },
];

const CAM_CO_OPTIONS = [
  { value: "Khong co", label: "Không cờ" },
  { value: "Co vang", label: "Cờ vàng" },
  { value: "Co do", label: "Cờ đỏ" },
];

const KET_QUA_DOI_MAY_OPTIONS = [
  { value: "Khong co", label: "Không có" },
  { value: "Dang xu ly", label: "Đang xử lý" },
  { value: "Doi thanh cong", label: "Đổi thành công" },
  { value: "Huy bo", label: "Hủy bỏ" },
  { value: "Doi khong thanh cong", label: "Đổi không thành công" },
];

const LY_DO_HUY_OPTIONS = [
  "Trùng lặp với đơn khác",
  "Khách hàng rút phản ánh",
  "Nhập nhầm / sai hệ thống",
  "Không liên hệ được khách",
  "Không thuộc phạm vi xử lý",
  "Lý do khác",
];

// Dịch giá trị mã hoá sang nhãn hiển thị (dùng cho cả chế độ đọc). Hai nhóm có value trùng
// ("Khong co") nên phải tra riêng theo từng nhóm.
function labelFrom(opts: { value: string; label: string }[], v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  return opts.find((o) => o.value === v)?.label ?? v;
}
const camCoLabel = (v: string | null | undefined) => labelFrom(CAM_CO_OPTIONS, v);
const ketQuaDoiMayLabel = (v: string | null | undefined) => labelFrom(KET_QUA_DOI_MAY_OPTIONS, v);

const CRM_WARNING_MESSAGES: Record<string, string> = {
  DVBH_NOT_FOUND: "Không tìm thấy case trên CRM Karofi",
  DVBH_LOOKUP_FAILED: "Không thể kết nối CRM Karofi lúc này",
  CASE_CLOSED: "Phản ánh đã kết thúc, không thể đồng bộ lại",
  RESYNC_TOO_SOON: "Vui lòng đợi ít nhất 5 giây giữa 2 lần đồng bộ",
  CHUA_TIEP_NHAN: "Phản ánh chưa được CSKH tiếp nhận",
};

// yyyy-mm-dd hh:mm:ss (naive, gio VN) -> epoch ms, dung tinh khoang cach giua 2 moc cho Timeline.
function parseVnNaive(s: string | null | undefined): number {
  if (!s) return 0;
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

interface DvbhGiaiTrinhRow { ly_do_cham: string; noi_dung: string | null; ngay_giai_trinh: string; nguoi_giai_trinh?: string; }

function parseGiaiTrinhDvbh(json: string | null): DvbhGiaiTrinhRow[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function giaiTrinhDvbhEvents(kn: KhieuNai): TimelineEvent[] {
  return parseGiaiTrinhDvbh(kn.giai_trinh_dvbh_json).map((g, i) => ({
    key: `gt-${i}`,
    tone: "teal",
    badge: "GT tồn",
    time: fmtVN.dateTime(g.ngay_giai_trinh),
    sortMs: parseVnNaive(g.ngay_giai_trinh),
    actor: g.nguoi_giai_trinh ?? null,
    summary: g.noi_dung ? `${g.ly_do_cham}: ${g.noi_dung}` : g.ly_do_cham,
  }));
}

function ReadField({ label, value }: { label: string; value: string | number | null | undefined }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="leading-tight">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`text-[13px] ${empty ? "text-ink-faint" : "text-ink"}`}>{empty ? "—" : value}</p>
    </div>
  );
}

// ---------- Bố cục Chi tiết: vùng dữ liệu có màu, ô dữ liệu khoá nổi bật ----------

const ICON: Record<string, ReactNode> = {
  doc: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2h9l5 5v15H6z" /><path d="M15 2v5h5M9 13h6M9 17h6" /></svg>,
  log: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>,
  sync: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg>,
  swap: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>,
  scale: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z" /></svg>,
  check: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>,
};

type Accent = "slate" | "violet" | "teal" | "amber" | "rose" | "green";
// Mỗi vùng dữ liệu = 1 màu riêng: viền trái đậm + thanh tiêu đề tô nền màu nhạt
// + icon nền màu. Thân vùng để trắng để các ô nhập (nền lõm) nổi bật lên trên đó.
const ZONE_ACCENT: Record<Accent, { bar: string; head: string; chip: string; ring: string }> = {
  slate: { bar: "border-l-slate-500", head: "bg-slate-50 text-slate-800 border-slate-200", chip: "bg-slate-600 text-white", ring: "ring-slate-200" },
  violet: { bar: "border-l-violet-500", head: "bg-violet-50 text-violet-800 border-violet-200", chip: "bg-violet-600 text-white", ring: "ring-violet-200" },
  teal: { bar: "border-l-teal-500", head: "bg-teal-50 text-teal-800 border-teal-200", chip: "bg-teal-600 text-white", ring: "ring-teal-200" },
  amber: { bar: "border-l-amber-500", head: "bg-amber-50 text-amber-900 border-amber-200", chip: "bg-amber-500 text-white", ring: "ring-amber-200" },
  rose: { bar: "border-l-rose-500", head: "bg-rose-50 text-rose-800 border-rose-200", chip: "bg-rose-600 text-white", ring: "ring-rose-200" },
  green: { bar: "border-l-green-600", head: "bg-green-50 text-green-800 border-green-200", chip: "bg-green-600 text-white", ring: "ring-green-200" },
};

function Zone({
  accent, icon, title, actions, children, collapsible, defaultOpen = true,
}: {
  accent: Accent;
  icon: ReactNode;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const a = ZONE_ACCENT[accent];
  return (
    <section className={`overflow-hidden rounded-lg border border-l-4 border-line ${a.bar} bg-surface shadow-sm ring-1 ring-inset ${a.ring}`}>
      <header className={`flex items-center gap-2 border-b px-3 py-1.5 ${a.head}`}>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${a.chip}`}>{icon}</span>
        <h3 className="text-[13px] font-bold uppercase tracking-wide">{title}</h3>
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          {collapsible && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold opacity-80 hover:opacity-100">
              {open ? "Thu gọn" : "Mở rộng"}
            </button>
          )}
        </div>
      </header>
      {open && <div className="px-3 py-2.5">{children}</div>}
    </section>
  );
}

const TILE_TONE: Record<string, string> = {
  gray: "bg-gray-50 text-ink ring-gray-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  green: "bg-green-50 text-green-800 ring-green-200",
};
function KeyTile({
  label, value, tone = "gray", strong, mono,
}: {
  label: string;
  value: string | null | undefined;
  tone?: keyof typeof TILE_TONE;
  strong?: boolean;
  mono?: boolean;
}) {
  const empty = !value || value === "";
  return (
    <div className={`rounded-md px-2.5 py-1 ring-1 ring-inset ${TILE_TONE[tone] ?? TILE_TONE.gray} ${empty ? "opacity-45" : ""}`}>
      <span className="block text-[10px] font-medium uppercase leading-none tracking-wide opacity-70">{label}</span>
      <span className={`block leading-tight ${strong ? "text-sm font-semibold" : "text-[13px] font-medium"} ${mono ? "font-mono" : ""}`}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function NextStepChip({ kn }: { kn: KhieuNai }) {
  let text = "";
  let cls = "bg-gray-100 text-ink-soft";
  if (kn.trang_thai === "Dang xu ly") {
    const du =
      kn.loi_nha_san_xuat !== "Chua danh gia" &&
      kn.loi_lap_dat !== "Chua danh gia" &&
      kn.loi_thai_do_ktv !== "Chua danh gia" &&
      kn.loi_quy_trinh_nskx !== "Chua danh gia" &&
      (kn.ket_luan_khieu_nai ?? "Chua danh gia") !== "Chua danh gia";
    if (du) { text = "Bước kế: TN CSKH đóng ca"; cls = "bg-blue-100 text-blue-800"; }
    else { text = "Bước kế: đánh giá đủ 4 lỗi + kết luận"; cls = "bg-amber-100 text-amber-900"; }
  } else if (kn.trang_thai === "Cho chot ket thuc") {
    text = "Bước kế: QL chốt kết thúc"; cls = "bg-violet-100 text-violet-800";
  } else if (kn.trang_thai === "Da ket thuc") {
    text = "Đã hoàn tất"; cls = "bg-green-100 text-green-800";
  } else if (kn.trang_thai === "Huy") {
    text = `Đã hủy${kn.ly_do_huy ? ": " + kn.ly_do_huy : ""}`; cls = "bg-gray-200 text-ink-soft";
  } else if (kn.trang_thai === "Cho tiep nhan") {
    text = "Bước kế: CSKH tiếp nhận"; cls = "bg-red-100 text-red-800";
  }
  return <span className={`rounded-md px-2 py-1 text-xs font-semibold ${cls}`}>{text}</span>;
}

function FlagBadge({ value }: { value: string | null | undefined }) {
  if (value === "Co do") return <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">⚑ CỜ ĐỎ</span>;
  if (value === "Co vang") return <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">⚑ CỜ VÀNG</span>;
  return null;
}

function CamCoButtons({ kn, canEdit, onSaved }: { kn: KhieuNai; canEdit: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const m = useMutation({
    mutationFn: (v: string) => api.patch(`/khieu-nai/${kn.id}`, { cam_co: v }),
    onSuccess: (_d, v) => {
      showToast(v === "Khong co" ? "Đã bỏ cờ" : "Đã cắm cờ", "success");
      onSaved();
    },
    onError: (e) => showToast(e instanceof ApiError ? `Lỗi: ${e.code}` : "Không cập nhật được cờ", "error"),
  });
  const cur = kn.cam_co ?? "Khong co";
  if (!canEdit) return <FlagBadge value={cur} />;

  const base = "rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors disabled:opacity-50";
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs font-medium text-ink-soft">Cắm cờ:</span>
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate("Co vang")}
        className={`${base} ${cur === "Co vang" ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-amber-700 ring-amber-400 hover:bg-amber-50"}`}
      >
        ⚑ Cờ vàng
      </button>
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate("Co do")}
        className={`${base} ${cur === "Co do" ? "bg-red-600 text-white ring-red-600" : "bg-white text-red-700 ring-red-400 hover:bg-red-50"}`}
      >
        ⚑ Cờ đỏ
      </button>
      {cur !== "Khong co" && (
        <button
          type="button"
          disabled={m.isPending}
          onClick={() => m.mutate("Khong co")}
          className={`${base} bg-white text-ink-soft ring-line hover:bg-gray-50`}
        >
          Bỏ cờ
        </button>
      )}
    </span>
  );
}

type WarnTone = "red" | "amber" | "gray";
interface WarnItem {
  tone: WarnTone;
  content: ReactNode;
}
const WARN_BG: Record<WarnTone, string> = {
  red: "bg-red-50 text-red-900",
  amber: "bg-amber-50 text-amber-900",
  gray: "bg-gray-100 text-ink-soft",
};
const WARN_BELL_CLS: Record<WarnTone, string> = {
  red: "bg-red-100 text-red-700 ring-red-300",
  amber: "bg-amber-100 text-amber-800 ring-amber-300",
  gray: "bg-gray-100 text-ink-soft ring-line",
};

// Gop tat ca banner canh bao (cho tiep nhan / chua du dieu kien dong ca / qua han giai trinh /
// da dong ca) vao 1 icon (!) thu gon tren thanh tieu de - bam moi mo popover xem chi tiet, thay
// vi de nhieu dai mau chiem het chieu cao header nhu truoc.
function WarningBell({ warnings }: { warnings: WarnItem[] }) {
  const [open, setOpen] = useState(false);
  if (warnings.length === 0) return null;
  const worst: WarnTone = warnings.some((w) => w.tone === "red")
    ? "red"
    : warnings.some((w) => w.tone === "amber")
      ? "amber"
      : "gray";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Xem cảnh báo"
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ring-1 ring-inset ${WARN_BELL_CLS[worst]}`}
      >
        ⚠ {warnings.length}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 w-[22rem] max-w-[90vw] overflow-hidden rounded-md border border-line bg-white shadow-lg">
            {warnings.map((w, i) => (
              <div key={i} className={`px-3 py-2 text-xs ${i > 0 ? "border-t border-line" : ""} ${WARN_BG[w.tone]}`}>
                {w.content}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function dongCaChecklist(kn: KhieuNai) {
  return [
    { label: "Lỗi NSX", ok: kn.loi_nha_san_xuat !== "Chua danh gia" },
    { label: "Lỗi lắp đặt", ok: kn.loi_lap_dat !== "Chua danh gia" },
    { label: "Lỗi thái độ KTV", ok: kn.loi_thai_do_ktv !== "Chua danh gia" },
    { label: "Lỗi quy trình NSKX", ok: kn.loi_quy_trinh_nskx !== "Chua danh gia" },
    { label: "Kết luận", ok: kn.ket_luan_khieu_nai !== "Chua danh gia" && kn.ket_luan_khieu_nai !== null },
  ];
}

type EditKey = "khach" | "log" | "crm" | "doimay" | "loi" | "ql";
type RightTabKey = "tien-trinh" | "crm" | "doi-may" | "ket-luan";

export function KhieuNaiDetail({
  id,
  user,
  onClose,
  onChanged,
  onNavigate,
}: {
  id: string;
  user: AppUser;
  onClose: () => void;
  onChanged: () => void;
  onNavigate?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const nameOf = useNameMap();
  const [editing, setEditing] = useState<EditKey | null>(null);
  const [rightTab, setRightTab] = useState<RightTabKey>("tien-trinh");

  const detail = useQuery({
    queryKey: ["khieu-nai", id],
    queryFn: () => api.get<DetailResponse>(`/khieu-nai/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["khieu-nai", id] });
    onChanged();
  };
  const savedAndClose = () => {
    invalidate();
    setEditing(null);
  };

  if (detail.isLoading) return <p className="p-8 text-center text-sm text-ink-soft">Đang tải...</p>;
  if (detail.isError || !detail.data) return <p className="p-8 text-center text-sm text-red-600">Không tải được phản ánh.</p>;

  const kn = detail.data.khieuNai;
  const tienTrinh = detail.data.tienTrinh;
  const lichSu = detail.data.lichSu ?? [];
  const related = detail.data.related ?? [];
  const overdue = detail.data.giaiTrinhDeadline?.overdue ?? false;
  const giaiTrinhDeadline = detail.data.giaiTrinhDeadline?.deadline;

  const isClosed = kn.trang_thai === "Da ket thuc";
  const chuaTiepNhan = kn.trang_thai === "Cho tiep nhan";
  // TN CSKH/QL duoc mo rong full quyen nhu CSKH tu 2026-09 (danh gia + dong ca + tiep nhan) - xem
  // backend/src/routes/khieuNai.ts (PATCH /:id allowed-fields, POST /:id/tiep-nhan requireRole).
  const isCskh =
    ["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "") && !isClosed && !overdue && !chuaTiepNhan;
  const isQl = (user.vai_tro === "QL" || user.vai_tro === "Admin") && !isClosed && !overdue && !chuaTiepNhan;
  const canDanhGia4Loi = isCskh;
  const canXuLyDoiMay = canDanhGia4Loi;
  const canThemTienTrinh = ["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "") && !isClosed && !chuaTiepNhan;
  const canPhuTrach =
    ["CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "") && !isClosed && !chuaTiepNhan;
  const canTiepNhan = ["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "") && chuaTiepNhan;

  const copyId = () => {
    navigator.clipboard?.writeText(kn.id).then(
      () => showToast(`Đã sao chép mã đơn ${kn.id}`, "success"),
      () => showToast("Không sao chép được", "error"),
    );
  };

  const checklist = dongCaChecklist(kn);
  const dongCaBlocked =
    (user.vai_tro === "TN CSKH" || user.vai_tro === "Admin") &&
    kn.trang_thai === "Dang xu ly" &&
    !checklist.every((c) => c.ok);
  // Số lượng dữ liệu mỗi tab bên phải (item 4) — chỉ hiện badge khi > 0, giống phong cách tab dvbh.
  const giaiTrinhDvbhCount = giaiTrinhDvbhEvents(kn).length;
  const tabCounts: Record<RightTabKey, number> = {
    "tien-trinh": tienTrinh.length + lichSu.length,
    crm: [kn.ngay_tiep_nhan_crm, kn.ket_qua_crm, kn.thong_tin_xu_ly_crm, kn.ngay_ktv_hoan_thanh].filter(Boolean).length + giaiTrinhDvbhCount,
    "doi-may": [
      kn.bo_phan_ban_giao, kn.ma_duyet_doi_linh_kien, kn.id_lada_phat_sinh,
      kn.ngay_ghi_nhan_doi_may, kn.ket_qua_doi_may,
      kn.cam_co && kn.cam_co !== "Khong co" ? kn.cam_co : null,
    ].filter(Boolean).length,
    "ket-luan": [
      kn.loi_nha_san_xuat, kn.loi_lap_dat, kn.loi_thai_do_ktv, kn.loi_quy_trinh_nskx,
    ].filter((v) => v && v !== "Chua danh gia").length
      + (kn.ket_luan_khieu_nai && kn.ket_luan_khieu_nai !== "Chua danh gia" ? 1 : 0)
      + (kn.danh_gia_ql ? 1 : 0),
  };
  const rightTabs: TabItem[] = [
    { key: "tien-trinh", label: "Tiến trình & lịch sử", count: tabCounts["tien-trinh"] },
    { key: "crm", label: "Đồng bộ CRM Karofi", count: tabCounts.crm },
    { key: "doi-may", label: "Thông tin khác", count: tabCounts["doi-may"] },
    { key: "ket-luan", label: "Kết luận & đánh giá", count: tabCounts["ket-luan"] },
  ];

  // Kết quả ngắn gọn cho tiêu đề
  const ketLuanDone = kn.ket_luan_khieu_nai && kn.ket_luan_khieu_nai !== "Chua danh gia";
  const ketQua =
    kn.trang_thai === "Huy"
      ? `Hủy${kn.ly_do_huy ? " · " + kn.ly_do_huy : ""}`
      : kn.ket_qua_crm
        ? kn.ket_qua_crm
        : ketLuanDone
          ? `Kết luận: ${translateDanhGia(kn.ket_luan_khieu_nai)}`
          : "Chưa có kết quả";
  const tocDo = fmtVN.gioXuLy(kn.ngay_tiep_nhan, isClosed ? kn.ngay_ket_thuc : null);
  const severityBg = MUC_DO_BG[mucDoTone(kn.muc_do)];
  const flagBorder = camCoBorderClass(kn.cam_co);

  // Item: gop toan bo banner canh bao vao WarningBell (icon !) thu gon tren tieu de, thay vi de
  // nhieu dai mau rieng chiem het chieu cao header nhu truoc.
  const warnings: WarnItem[] = [];
  if (chuaTiepNhan) {
    // Nut "Tiep nhan" thuc su nam luon ngoai tieu de (ml-auto, canh ActionBar - xem ben duoi) de de
    // thay hon thay vi chi hien sau khi bam mo WarningBell; o day chi giu dong thong tin ly do khoa.
    warnings.push({
      tone: "red",
      content: (
        <span>
          <span className="font-semibold">⚠ Chờ tiếp nhận</span> — phản ánh chưa được sửa/cập nhật cho đến khi được tiếp nhận.
          {!canTiepNhan && <span className="italic text-red-800"> Đang chờ CSKH/TN CSKH/QL tiếp nhận…</span>}
        </span>
      ),
    });
  }
  if (dongCaBlocked) {
    warnings.push({
      tone: "amber",
      content: (
        <>
          <span className="font-semibold">Chưa đủ điều kiện đóng ca:</span>{" "}
          {checklist.map((c) => (
            <span key={c.label} className={`mr-2 inline-block ${c.ok ? "text-green-700" : "font-medium"}`}>
              {c.ok ? "✓" : "✗"} {c.label}
            </span>
          ))}
        </>
      ),
    });
  }
  if (overdue && !isClosed) {
    warnings.push({
      tone: "red",
      content: (
        <>
          <span className="font-semibold">⚠ Quá hạn giải trình lý do chậm</span>
          {giaiTrinhDeadline && <span> (mốc {fmtVN.dateTime(giaiTrinhDeadline)})</span>} — mọi mục sửa khác đã bị khoá.
          Bấm <span className="font-semibold">“+ Ghi chú”</span> ở khu Tiến trình &amp; lịch sử, điền đủ{" "}
          <span className="font-semibold">Nội dung ghi chép</span> và <span className="font-semibold">Lý do xử lý chậm</span> để mở khoá lại.
        </>
      ),
    });
  }
  if (isClosed) {
    warnings.push({
      tone: "gray",
      content: (
        <div className="flex items-center justify-between gap-2">
          <span>Ca đã kết thúc — chỉ xem. Mọi thay đổi đã bị khoá.</span>
          {user.vai_tro === "Admin" && <MoLaiButton id={id} onDone={invalidate} onError={(m) => showToast(m, "error")} />}
        </div>
      ),
    });
  }

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-lg ${severityBg} ${flagBorder}`}>
      {/* ===== TIÊU ĐỀ: trạng thái · kết quả · tốc độ · nút xử lý ===== */}
      <div className="shrink-0 border-b border-line-strong bg-surface">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
          <StatusBadge trangThai={kn.trang_thai} />
          <FlagBadge value={kn.cam_co} />
          <button
            type="button"
            onClick={copyId}
            className="rounded border border-line px-2 py-0.5 font-mono text-xs text-ink-soft hover:bg-gray-50"
            title="Sao chép mã đơn — gửi cho người cần xem"
          >
            {kn.id} ⧉
          </button>
          <span className="text-sm">
            <span className="text-ink-soft">Kết quả: </span>
            <span className="font-semibold text-ink">{ketQua}</span>
          </span>
          <span className="text-sm">
            <span className="text-ink-soft">Tốc độ: </span>
            <span className="font-semibold text-ink">{tocDo}</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <WarningBell warnings={warnings} />
            {canTiepNhan && <TiepNhanButton id={id} onDone={invalidate} onError={(m) => showToast(m, "error")} />}
            <ActionBar kn={kn} user={user} onDone={invalidate} onError={(m) => showToast(m, "error")} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded p-1 text-ink-soft hover:bg-gray-100 hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-1.5 text-xs">
          <NextStepChip kn={kn} />
          <NguoiPhuTrachInline kn={kn} user={user} canEdit={canPhuTrach} onSaved={invalidate} nameOf={nameOf} />
          <span className="text-ink-soft">· Tiếp nhận {fmtVN.dateTime(kn.ngay_tiep_nhan)}</span>
          <span className="text-ink-soft">· Cập nhật {fmtVN.relative(kn.ngay_thay_doi)}</span>
          <div className="ml-auto">
            <CamCoButtons kn={kn} canEdit={canXuLyDoiMay} onSaved={invalidate} />
          </div>
        </div>
      </div>

      {/* ===== THÂN: trái = thông tin tiếp nhận cố định, phải = tab chuyển đổi (item 4, học theo dvbh) ===== */}
      <div className={`min-h-0 flex-1 overflow-y-auto ${severityBg} p-2.5`}>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(280px,38%)_1fr]">
          <div className="flex min-w-0 flex-col gap-2">
            <Zone
              accent="slate"
              icon={ICON.doc}
              title="Thông tin đầu vào"
              actions={isCskh && <ZoneBtn onClick={() => setEditing("khach")}>Sửa</ZoneBtn>}
            >
              <CustomerInfoSection kn={kn} editable={false} onSaved={invalidate} />
            </Zone>
            {related.length > 0 && <RelatedList items={related} onNavigate={onNavigate} />}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <Tabs tabs={rightTabs} active={rightTab} onChange={(k) => setRightTab(k as RightTabKey)} />

            {rightTab === "tien-trinh" && (
              <Zone
                accent="violet"
                icon={ICON.log}
                title="Tiến trình & lịch sử"
                actions={canThemTienTrinh && <ZoneBtn onClick={() => setEditing("log")}>+ Ghi chú</ZoneBtn>}
              >
                <TienTrinhSection id={id} items={tienTrinh} lichSu={lichSu} canThem={false} onSaved={invalidate} />
              </Zone>
            )}

            {rightTab === "crm" && (
              <Zone
                accent="teal"
                icon={ICON.sync}
                title="Đồng bộ CRM Karofi"
                actions={isCskh && <ZoneBtn onClick={() => setEditing("crm")}>Sửa ID CRM</ZoneBtn>}
              >
                <CrmSection kn={kn} user={user} onSaved={invalidate} forceEditable={false} />
              </Zone>
            )}

            {rightTab === "doi-may" && (
              <Zone
                accent="amber"
                icon={ICON.swap}
                title="Thông tin khác"
                actions={canXuLyDoiMay && <ZoneBtn onClick={() => setEditing("doimay")}>Sửa</ZoneBtn>}
              >
                <DoiMaySection kn={kn} editable={false} onSaved={invalidate} />
              </Zone>
            )}

            {rightTab === "ket-luan" && (
              <Zone
                accent="rose"
                icon={ICON.scale}
                title="Kết luận & đánh giá"
                actions={
                  <>
                    {canDanhGia4Loi && <ZoneBtn onClick={() => setEditing("loi")}>Đánh giá lỗi</ZoneBtn>}
                    {isQl && <ZoneBtn onClick={() => setEditing("ql")}>Đánh giá QL</ZoneBtn>}
                  </>
                }
              >
                <div className="space-y-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Nguyên nhân lỗi · điều kiện đóng ca</p>
                    <TnCskhSection kn={kn} editable={false} onSaved={invalidate} />
                  </div>
                  <div className="border-t border-line pt-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Đánh giá QL · điều kiện chốt</p>
                    <QlSection kn={kn} editable={false} onSaved={invalidate} />
                  </div>
                </div>
              </Zone>
            )}
          </div>
        </div>
      </div>

      {/* ===== POPUP NHẬP LIỆU RIÊNG TỪNG MỤC ===== */}
      {editing === "khach" && (
        <EditDialog title="Sửa thông tin đầu vào" onClose={() => setEditing(null)}>
          <CustomerInfoSection kn={kn} editable onSaved={savedAndClose} />
        </EditDialog>
      )}
      {editing === "log" && (
        <EditDialog title="Thêm ghi chú tiến trình" onClose={() => setEditing(null)}>
          <TienTrinhSection id={id} items={tienTrinh} lichSu={lichSu} canThem addOnly overdue={overdue} onSaved={savedAndClose} />
        </EditDialog>
      )}
      {editing === "crm" && (
        <EditDialog title="Sửa ID CRM Karofi" onClose={() => setEditing(null)}>
          <CrmSection kn={kn} user={user} onSaved={savedAndClose} forceEditable />
        </EditDialog>
      )}
      {editing === "doimay" && (
        <EditDialog title="Thông tin khác" onClose={() => setEditing(null)}>
          <DoiMaySection kn={kn} editable onSaved={savedAndClose} />
        </EditDialog>
      )}
      {editing === "loi" && (
        <EditDialog title="Đánh giá nguyên nhân lỗi" onClose={() => setEditing(null)}>
          <TnCskhSection kn={kn} editable onSaved={savedAndClose} />
        </EditDialog>
      )}
      {editing === "ql" && (
        <EditDialog title="Đánh giá QL" onClose={() => setEditing(null)}>
          <QlSection kn={kn} editable onSaved={savedAndClose} />
        </EditDialog>
      )}
    </div>
  );
}

function ZoneBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-black/10 bg-white/95 px-2 py-0.5 text-xs font-semibold shadow-sm hover:bg-white"
    >
      ✎ {children}
    </button>
  );
}

// Cac don khac cung ID CRM Karofi hoac cung "hanh trinh" ID Lada (id_lada/id_lada_phat_sinh
// giao nhau) - giup nguoi xu ly phat hien nhanh cac ca lien quan (vd may da doi van bi khieu nai
// lai, hoac cung 1 case CRM tach nhieu phan anh).
function RelatedList({ items, onNavigate }: { items: RelatedItem[]; onNavigate?: (id: string) => void }) {
  return (
    <section className="overflow-hidden rounded-lg border border-l-4 border-line border-l-gray-400 bg-surface shadow-sm">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-1.5">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">Đơn liên quan ({items.length})</h3>
      </header>
      <div className="flex flex-col divide-y divide-line px-1 py-1">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            disabled={!onNavigate}
            onClick={() => onNavigate?.(it.id)}
            className={`flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs ${onNavigate ? "hover:bg-gray-50" : ""}`}
          >
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-mono text-ink-soft">{it.id}</span>
              <span className="block truncate text-ink">{it.ten_khach ?? "—"} · {it.van_de_dau_vao ?? it.nhom_van_de ?? "—"}</span>
            </span>
            <span className="shrink-0 text-right leading-tight">
              <span className="block text-ink-faint">{fmtVN.date(it.ngay_tiep_nhan)}</span>
              <StatusBadge trangThai={it.trang_thai} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function EditDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-lg bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded p-1 text-ink-soft hover:bg-gray-100 hover:text-ink">
            ✕
          </button>
        </div>
        <div className="max-h-[76vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function NguoiPhuTrachInline({
  kn, user, canEdit, onSaved, nameOf,
}: {
  kn: KhieuNai;
  user: AppUser;
  canEdit: boolean;
  onSaved: () => void;
  nameOf: (e: string | null | undefined) => string;
}) {
  const { showToast } = useToast();
  const m = useMutation({
    mutationFn: (email: string | null) => api.post(`/khieu-nai/${kn.id}/phu-trach`, { email }),
    onSuccess: () => { showToast("Đã cập nhật người phụ trách", "success"); onSaved(); },
    onError: (e) => showToast(e instanceof ApiError ? `Lỗi: ${e.code}` : "Lỗi", "error"),
  });
  const mine = kn.nguoi_phu_trach === user.email;
  // Item: lam noi bat nguoi phu trach (PT) - ai cung de dang thay ngay ai dang xu ly ca nay, thay
  // vi chu nho mau xam nhu truoc.
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2 text-xs font-semibold ring-1 ring-inset ${
        kn.nguoi_phu_trach ? "bg-accent-soft text-accent ring-accent/30" : "bg-gray-100 text-ink-soft ring-line"
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/70 text-[10px]">👤</span>
      {kn.nguoi_phu_trach ? nameOf(kn.nguoi_phu_trach) : "Chưa có người phụ trách"}
      {canEdit && !mine && (
        <button type="button" disabled={m.isPending} onClick={() => m.mutate(user.email)} className="rounded border border-accent/40 bg-white px-1.5 py-0.5 font-medium text-accent hover:bg-accent-soft">
          Nhận
        </button>
      )}
      {canEdit && kn.nguoi_phu_trach && (
        <button type="button" disabled={m.isPending} onClick={() => m.mutate(null)} className="text-ink-faint hover:text-ink">Gỡ</button>
      )}
    </span>
  );
}

function TiepNhanButton({ id, onDone, onError }: { id: string; onDone: () => void; onError: (m: string) => void }) {
  const m = useMutation({
    mutationFn: () => api.post<{ khieuNai: KhieuNai }>(`/khieu-nai/${id}/tiep-nhan`),
    onSuccess: onDone,
    onError: (e) => onError(e instanceof ApiError ? `Tiếp nhận thất bại: ${e.code}` : "Tiếp nhận thất bại"),
  });
  return (
    <Btn variant="primary" size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
      {m.isPending ? "Đang tiếp nhận..." : "✓ Tiếp nhận phản ánh"}
    </Btn>
  );
}

function MoLaiButton({ id, onDone, onError }: { id: string; onDone: () => void; onError: (m: string) => void }) {
  const m = useMutation({
    mutationFn: (ly_do: string) => api.post(`/khieu-nai/${id}/mo-lai`, { ly_do }),
    onSuccess: onDone,
    onError: (e) => onError(e instanceof ApiError ? `Mở lại thất bại: ${e.code}` : "Mở lại thất bại"),
  });
  return (
    <button
      type="button"
      className="rounded border border-line bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-gray-50"
      onClick={() => {
        const ly_do = window.prompt("Lý do mở lại ca (bắt buộc):");
        if (ly_do && ly_do.trim()) m.mutate(ly_do.trim());
      }}
    >
      Mở lại ca
    </button>
  );
}

// ---------- Thông tin khách hàng ----------

function CustomerInfoSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const mucDoOpts = useSettingsOptions("muc_do");
  const nhomYeuCauOpts = useSettingsOptions("nhom_yeu_cau");
  const phanLoaiKhOpts = useSettingsOptions("phan_loai_kh");
  const nhomVanDeOpts = useSettingsOptions("nhom_van_de");
  const vanDeDauVaoOpts = useSettingsOptions("van_de_dau_vao");
  const saleKhuVucOpts = useSettingsOptions("sale_khu_vuc");
  const modelOpts = useSettingsOptions("model");
  const hangOpts = useSettingsOptions("hang");
  const tinhOpts = useSettingsOptions("tinh");
  const tinhMoiOpts = useSettingsOptions("tinh_moi");
  const createSaleKhuVuc = useCreateSettingsOption("sale_khu_vuc");
  const createHang = useCreateSettingsOption("hang");
  const createTinh = useCreateSettingsOption("tinh");
  const createQuanHuyen = useCreateSettingsOption("quan_huyen");
  const createPhuongXa = useCreateSettingsOption("phuong_xa");
  const createTinhMoi = useCreateSettingsOption("tinh_moi");
  const createPhuongXaMoi = useCreateSettingsOption("phuong_xa_moi");

  const [form, setForm] = useState({
    ten_khach: kn.ten_khach ?? "",
    sdt_khach: kn.sdt_khach ?? "",
    id_lada: kn.id_lada ?? "",
    nguon: kn.nguon ?? "",
    sale_khu_vuc: kn.sale_khu_vuc ?? "",
    tinh: kn.tinh ?? "",
    quan_huyen: kn.quan_huyen ?? "",
    phuong_xa: kn.phuong_xa ?? "",
    tinh_moi: kn.tinh_moi ?? "",
    phuong_xa_moi: kn.phuong_xa_moi ?? "",
    model: kn.model ?? "",
    hang: kn.hang ?? "",
    thong_tin_ban_dau: kn.thong_tin_ban_dau ?? "",
    nguoi_bao: kn.nguoi_bao ?? "",
    muc_do: kn.muc_do ?? "",
    nhom_yeu_cau: kn.nhom_yeu_cau ?? "",
    nhom_van_de: kn.nhom_van_de ?? "",
    van_de_dau_vao: kn.van_de_dau_vao ?? "",
    phan_loai_kh: kn.phan_loai_kh ?? "",
    ghi_chu_nguoi_tao: kn.ghi_chu_nguoi_tao ?? "",
  });

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  // Địa lý cascading: huyện theo tỉnh, xã theo huyện (địa chính cũ); tỉnh mới → xã mới.
  const quanHuyenOpts = useSettingsOptions("quan_huyen", form.tinh);
  const phuongXaOpts = useSettingsOptions("phuong_xa", form.quan_huyen);
  const phuongXaMoiOpts = useSettingsOptions("phuong_xa_moi", form.tinh_moi);

  const serverForm = {
    ten_khach: kn.ten_khach ?? "", sdt_khach: kn.sdt_khach ?? "", id_lada: kn.id_lada ?? "",
    nguon: kn.nguon ?? "",
    sale_khu_vuc: kn.sale_khu_vuc ?? "", tinh: kn.tinh ?? "", quan_huyen: kn.quan_huyen ?? "",
    phuong_xa: kn.phuong_xa ?? "", tinh_moi: kn.tinh_moi ?? "", phuong_xa_moi: kn.phuong_xa_moi ?? "",
    model: kn.model ?? "", hang: kn.hang ?? "",
    thong_tin_ban_dau: kn.thong_tin_ban_dau ?? "", nguoi_bao: kn.nguoi_bao ?? "",
    muc_do: kn.muc_do ?? "", nhom_yeu_cau: kn.nhom_yeu_cau ?? "", nhom_van_de: kn.nhom_van_de ?? "",
    van_de_dau_vao: kn.van_de_dau_vao ?? "", phan_loai_kh: kn.phan_loai_kh ?? "",
    ghi_chu_nguoi_tao: kn.ghi_chu_nguoi_tao ?? "",
  };
  const isDirty = editable && JSON.stringify(form) !== JSON.stringify(serverForm);

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) body[k] = v.trim() === "" ? null : v.trim();
      return api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, body);
    },
    onSuccess: () => {
      showToast("Đã lưu thông tin khách hàng", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const filteredVanDeDauVao = (vanDeDauVaoOpts.data ?? []).filter(
    (o) => !form.nhom_van_de || o.parent === form.nhom_van_de,
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          <ReadField label="Tên khách hàng" value={kn.ten_khach} />
          <ReadField label="Số điện thoại" value={kn.sdt_khach} />
          <ReadField label="ID Lada" value={kn.id_lada} />
          <ReadField label="Nguồn" value={kn.nguon ? (NGUON_LABEL[kn.nguon] ?? kn.nguon) : null} />
          <ReadField label="Sale khu vực" value={kn.sale_khu_vuc} />
          <ReadField label="Người báo" value={kn.nguoi_bao} />
          <ReadField label="Tỉnh (cũ)" value={kn.tinh} />
          <ReadField label="Quận/Huyện (cũ)" value={kn.quan_huyen} />
          <ReadField label="Phường/Xã (cũ)" value={kn.phuong_xa} />
          <ReadField label="Tỉnh (mới)" value={kn.tinh_moi} />
          <ReadField label="Phường/Xã (mới)" value={kn.phuong_xa_moi} />
          <ReadField label="Model" value={kn.model} />
          <ReadField label="Hãng" value={kn.hang} />
          <ReadField label="Mức độ" value={kn.muc_do} />
          <ReadField label="Nhóm yêu cầu" value={kn.nhom_yeu_cau} />
          <ReadField label="Phân loại KH" value={kn.phan_loai_kh} />
          <ReadField label="Nhóm vấn đề" value={kn.nhom_van_de} />
          <ReadField label="Vấn đề đầu vào" value={kn.van_de_dau_vao} />
        </div>
        <div className="mt-2">
          <ReadField label="Thông tin ban đầu" value={kn.thong_tin_ban_dau} />
        </div>
        <div className="mt-2">
          <ReadField label="Ghi chú người tạo" value={kn.ghi_chu_nguoi_tao} />
        </div>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
        <Field label="Tên khách hàng">
          <Input value={form.ten_khach} onChange={(e) => setField("ten_khach", e.target.value)} />
        </Field>
        <Field label="Số điện thoại">
          <Input value={form.sdt_khach} onChange={(e) => setField("sdt_khach", e.target.value)} inputMode="tel" />
        </Field>
        <Field label="ID Lada">
          <Input value={form.id_lada} onChange={(e) => setField("id_lada", e.target.value)} />
        </Field>
        <Field label="Nguồn">
          <Select
            options={NGUON_OPTIONS}
            placeholder="— Chọn —"
            value={form.nguon}
            onChange={(e) => setField("nguon", e.target.value)}
          />
        </Field>
        <Field label="Sale khu vực">
          <Combobox
            options={(saleKhuVucOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.sale_khu_vuc}
            onChange={(v) => setField("sale_khu_vuc", v)}
            creatable
            onCreate={createSaleKhuVuc}
          />
        </Field>
        <Field label="Người báo">
          <Input value={form.nguoi_bao} onChange={(e) => setField("nguoi_bao", e.target.value)} />
        </Field>
        <Field label="Tỉnh (cũ)">
          <Combobox
            options={(tinhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.tinh}
            onChange={(v) => setForm((p) => ({ ...p, tinh: v, quan_huyen: "", phuong_xa: "" }))}
            creatable
            onCreate={createTinh}
          />
        </Field>
        <Field label="Quận/Huyện (cũ)">
          <Combobox
            options={(quanHuyenOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.quan_huyen}
            onChange={(v) => setForm((p) => ({ ...p, quan_huyen: v, phuong_xa: "" }))}
            disabled={!form.tinh}
            creatable
            onCreate={(v) => createQuanHuyen(v, form.tinh)}
          />
        </Field>
        <Field label="Phường/Xã (cũ)">
          <Combobox
            options={(phuongXaOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.phuong_xa}
            onChange={(v) => setField("phuong_xa", v)}
            disabled={!form.quan_huyen}
            creatable
            onCreate={(v) => createPhuongXa(v, form.quan_huyen)}
          />
        </Field>
        <Field label="Tỉnh (mới)">
          <Combobox
            options={(tinhMoiOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.tinh_moi}
            onChange={(v) => setForm((p) => ({ ...p, tinh_moi: v, phuong_xa_moi: "" }))}
            creatable
            onCreate={createTinhMoi}
          />
        </Field>
        <Field label="Phường/Xã (mới)">
          <Combobox
            options={(phuongXaMoiOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.phuong_xa_moi}
            onChange={(v) => setField("phuong_xa_moi", v)}
            disabled={!form.tinh_moi}
            creatable
            onCreate={(v) => createPhuongXaMoi(v, form.tinh_moi)}
          />
        </Field>
        <Field label="Model">
          <Combobox
            options={(modelOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.model}
            onChange={(v) => setField("model", v)}
          />
        </Field>
        <Field label="Hãng">
          <Combobox
            options={(hangOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.hang}
            onChange={(v) => setField("hang", v)}
            creatable
            onCreate={createHang}
          />
        </Field>
        <Field label="Mức độ">
          <Combobox
            options={sortMucDoOptions(mucDoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.muc_do}
            onChange={(v) => setField("muc_do", v)}
          />
        </Field>
        <Field label="Nhóm yêu cầu">
          <Combobox
            options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.nhom_yeu_cau}
            onChange={(v) => setField("nhom_yeu_cau", v)}
          />
        </Field>
        <Field label="Phân loại KH">
          <Combobox
            options={(phanLoaiKhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.phan_loai_kh}
            onChange={(v) => setField("phan_loai_kh", v)}
          />
        </Field>
        <Field label="Nhóm vấn đề">
          <Combobox
            options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.nhom_van_de}
            onChange={(v) => {
              setField("nhom_van_de", v);
              setField("van_de_dau_vao", "");
            }}
          />
        </Field>
        <Field label="Vấn đề đầu vào">
          <Combobox
            options={filteredVanDeDauVao.map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.van_de_dau_vao}
            onChange={(v) => setField("van_de_dau_vao", v)}
            disabled={!form.nhom_van_de}
          />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Thông tin ban đầu">
            <Textarea rows={2} value={form.thong_tin_ban_dau} onChange={(e) => setField("thong_tin_ban_dau", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Ghi chú người tạo">
            <Textarea rows={2} value={form.ghi_chu_nguoi_tao} onChange={(e) => setField("ghi_chu_nguoi_tao", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-3 flex justify-end">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu..." : "Lưu thông tin khách hàng"}
          </Btn>
        </div>
      </form>
    </>
  );
}

// ---------- CRM Karofi ----------

function CrmSection({
  kn, user, onSaved, forceEditable,
}: { kn: KhieuNai; user: AppUser; onSaved: () => void; forceEditable?: boolean }) {
  const { showToast } = useToast();
  const editable = forceEditable ?? (user.vai_tro === "CSKH" || user.vai_tro === "Admin");
  const canResync =
    forceEditable !== true && !!user.vai_tro && user.vai_tro !== "Viewer" && kn.trang_thai !== "Da ket thuc";
  const [crmId, setCrmId] = useState(kn.id_crm_karofi ?? "");

  useEffect(() => setCrmId(kn.id_crm_karofi ?? ""), [kn.id_crm_karofi]);

  const saveId = useMutation({
    mutationFn: () => api.patch<{ khieuNai: KhieuNai; crm_sync_warning?: string }>(`/khieu-nai/${kn.id}`, { id_crm_karofi: crmId.trim() === "" ? null : crmId.trim() }),
    onSuccess: (data) => {
      if (data.crm_sync_warning) {
        showToast(CRM_WARNING_MESSAGES[data.crm_sync_warning] ?? data.crm_sync_warning, "error");
      } else {
        showToast("Đã lưu ID CRM Karofi", "success");
      }
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const resync = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/dong-bo-crm`),
    onSuccess: () => {
      showToast("Đã đồng bộ lại dữ liệu CRM", "success");
      onSaved();
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : "ERROR";
      showToast(CRM_WARNING_MESSAGES[code] ?? `Đồng bộ thất bại: ${code}`, "error");
    },
  });

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-end gap-2">
        <div className="w-36">
          <Field label="ID CRM Karofi">
            {editable ? (
              <Input value={crmId} onChange={(e) => setCrmId(e.target.value)} placeholder="Chưa có" />
            ) : (
              <p className="text-sm text-ink">{kn.id_crm_karofi ?? "—"}</p>
            )}
          </Field>
        </div>
        {editable && (
          <Btn variant="secondary" size="sm" disabled={saveId.isPending || crmId === (kn.id_crm_karofi ?? "")} onClick={() => saveId.mutate()}>
            {saveId.isPending ? "Đang lưu..." : "Lưu ID"}
          </Btn>
        )}
        {canResync && (
          <Btn
            variant="secondary"
            size="sm"
            disabled={!kn.id_crm_karofi || resync.isPending}
            title={kn.trang_thai === "Da ket thuc" ? "Phản ánh đã kết thúc, không thể đồng bộ lại" : undefined}
            onClick={() => resync.mutate()}
          >
            {resync.isPending ? "Đang đồng bộ..." : "Đồng bộ lại"}
          </Btn>
        )}
        <span
          className={`ml-auto inline-block rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            kn.ngay_ktv_hoan_thanh ? "bg-green-50 text-green-700 ring-green-300" : "bg-amber-50 text-amber-700 ring-amber-300"
          }`}
        >
          {kn.ngay_ktv_hoan_thanh ? `Đã hoàn thành: ${kn.ngay_ktv_hoan_thanh}` : "Chưa hoàn thành"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-3">
        <ReadField label="Ngày tiếp nhận CRM" value={kn.ngay_tiep_nhan_crm} />
        <ReadField label="Kết quả CRM" value={kn.ket_qua_crm} />
        <ReadField label="Thông tin xử lý CRM" value={kn.thong_tin_xu_ly_crm} />
      </div>
      <div className="mt-2">
        <p className="mb-1 text-xs font-medium text-ink-soft">Giải trình ĐVBH</p>
        <Timeline events={giaiTrinhDvbhEvents(kn)} />
      </div>
    </>
  );
}

// ---------- Đánh giá lỗi (TN CSKH) ----------

function TnCskhSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const [form, setForm] = useState<{
    loi_nha_san_xuat: DanhGia3;
    loi_lap_dat: DanhGia3;
    loi_thai_do_ktv: DanhGia3;
    loi_quy_trinh_nskx: DanhGia3;
    ket_luan_khieu_nai: DanhGia3;
  }>({
    loi_nha_san_xuat: kn.loi_nha_san_xuat,
    loi_lap_dat: kn.loi_lap_dat,
    loi_thai_do_ktv: kn.loi_thai_do_ktv,
    loi_quy_trinh_nskx: kn.loi_quy_trinh_nskx,
    ket_luan_khieu_nai: kn.ket_luan_khieu_nai ?? "Chua danh gia",
  });

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const serverForm = {
    loi_nha_san_xuat: kn.loi_nha_san_xuat, loi_lap_dat: kn.loi_lap_dat,
    loi_thai_do_ktv: kn.loi_thai_do_ktv, loi_quy_trinh_nskx: kn.loi_quy_trinh_nskx,
    ket_luan_khieu_nai: kn.ket_luan_khieu_nai ?? "Chua danh gia",
  };
  const isDirty = editable && JSON.stringify(form) !== JSON.stringify(serverForm);

  const mutation = useMutation({
    mutationFn: () => api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, form),
    onSuccess: () => {
      showToast("Đã lưu đánh giá lỗi", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          <ReadField label="Lỗi nhà sản xuất" value={translateDanhGia(kn.loi_nha_san_xuat)} />
          <ReadField label="Lỗi lắp đặt" value={translateDanhGia(kn.loi_lap_dat)} />
          <ReadField label="Lỗi thái độ KTV" value={translateDanhGia(kn.loi_thai_do_ktv)} />
          <ReadField label="Lỗi quy trình NSKX" value={translateDanhGia(kn.loi_quy_trinh_nskx)} />
          <ReadField label="Kết luận phản ánh" value={translateDanhGia(kn.ket_luan_khieu_nai)} />
        </div>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <DanhGiaRow label="Lỗi nhà sản xuất" value={form.loi_nha_san_xuat} onChange={(v) => setField("loi_nha_san_xuat", v)} />
        <DanhGiaRow label="Lỗi lắp đặt" value={form.loi_lap_dat} onChange={(v) => setField("loi_lap_dat", v)} />
        <DanhGiaRow label="Lỗi thái độ KTV" value={form.loi_thai_do_ktv} onChange={(v) => setField("loi_thai_do_ktv", v)} />
        <DanhGiaRow label="Lỗi quy trình NSKX" value={form.loi_quy_trinh_nskx} onChange={(v) => setField("loi_quy_trinh_nskx", v)} />
        <DanhGiaRow label="Kết luận phản ánh" value={form.ket_luan_khieu_nai} onChange={(v) => setField("ket_luan_khieu_nai", v)} />
        <div className="flex items-center justify-end pt-1">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu..." : "Lưu đánh giá lỗi"}
          </Btn>
        </div>
      </form>
    </>
  );
}

// Chi 3 lua chon co dinh -> nut bam thay vi dropdown, xep tung dong tu tren xuong de bam nhanh.
function DanhGiaRow({ label, value, onChange }: { label: string; value: DanhGia3; onChange: (v: DanhGia3) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
      <span className="min-w-[150px] flex-1 text-sm font-medium text-ink">{label}</span>
      <div className="flex gap-1">
        {DANH_GIA_OPTIONS.map((o) => {
          const active = value === o.value;
          const cls =
            o.value === "Co"
              ? active ? "bg-red-600 text-white ring-red-600" : "bg-white text-red-700 ring-red-300 hover:bg-red-50"
              : o.value === "Khong"
                ? active ? "bg-green-600 text-white ring-green-600" : "bg-white text-green-700 ring-green-300 hover:bg-green-50"
                : active ? "bg-gray-500 text-white ring-gray-500" : "bg-white text-ink-soft ring-line hover:bg-gray-50";
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value as DanhGia3)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${cls}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}


// ---------- Đánh giá QL ----------

function QlSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const danhGiaQlOpts = useSettingsOptions("danh_gia_cskh");

  const [form, setForm] = useState({
    danh_gia_ql: kn.danh_gia_ql ?? "",
    ql_chon_ngay_hen: kn.ql_chon_ngay_hen ?? "",
    ql_chon_ly_do: kn.ql_chon_ly_do ?? "",
  });

  // D4: giờ xử lý do hệ thống tính (tiếp nhận -> kết thúc | hiện tại), không nhập tay.
  const gioXuLy = fmtVN.gioXuLy(kn.ngay_tiep_nhan, kn.trang_thai === "Da ket thuc" ? kn.ngay_ket_thuc : null);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const serverForm = {
    danh_gia_ql: kn.danh_gia_ql ?? "",
    ql_chon_ngay_hen: kn.ql_chon_ngay_hen ?? "",
    ql_chon_ly_do: kn.ql_chon_ly_do ?? "",
  };
  const isDirty = editable && JSON.stringify(form) !== JSON.stringify(serverForm);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, {
        danh_gia_ql: form.danh_gia_ql.trim() === "" ? null : form.danh_gia_ql.trim(),
        ql_chon_ngay_hen: form.ql_chon_ngay_hen.trim() === "" ? null : form.ql_chon_ngay_hen.trim(),
        ql_chon_ly_do: form.ql_chon_ly_do.trim() === "" ? null : form.ql_chon_ly_do.trim(),
      }),
    onSuccess: () => {
      showToast("Đã lưu đánh giá QL", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          <ReadField label="Đánh giá QL" value={kn.danh_gia_ql} />
          <ReadField label="Giờ xử lý (hệ thống)" value={kn.ql_gio_xu_ly_he_thong ?? gioXuLy} />
          <ReadField label="Ngày hẹn" value={kn.ql_chon_ngay_hen} />
          <ReadField label="Lý do" value={kn.ql_chon_ly_do} />
          <ReadField label="Người đánh giá" value={kn.ql_nguoi_danh_gia} />
          <ReadField label="Ngày đánh giá" value={fmtVN.dateTime(kn.ngay_ql_danh_gia)} />
        </div>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
        <Field label="Đánh giá QL">
          <Select
            options={(danhGiaQlOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder="— Chọn —"
            value={form.danh_gia_ql}
            onChange={(e) => setField("danh_gia_ql", e.target.value)}
          />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-soft">Giờ xử lý (hệ thống)</p>
          <p className="rounded-md border border-line bg-gray-50 px-2.5 py-1.5 text-sm text-ink">{gioXuLy}</p>
          <p className="mt-1 text-xs text-ink-soft">Tự tính từ ngày tiếp nhận đến khi kết thúc.</p>
        </div>
        <Field label="Ngày hẹn">
          <Input type="date" value={form.ql_chon_ngay_hen} onChange={(e) => setField("ql_chon_ngay_hen", e.target.value)} />
        </Field>
        <Field label="Lý do" hint="Free text - vì sao có ngày hẹn này">
          <Input value={form.ql_chon_ly_do} onChange={(e) => setField("ql_chon_ly_do", e.target.value)} />
        </Field>
        <ReadField label="Người đánh giá" value={kn.ql_nguoi_danh_gia} />
        <ReadField label="Ngày đánh giá" value={kn.ngay_ql_danh_gia} />
        <div className="col-span-2 flex items-end justify-end sm:col-span-3">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu..." : "Lưu đánh giá QL"}
          </Btn>
        </div>
      </form>
    </>
  );
}

// ---------- Nhánh đổi máy ----------

function DoiMaySection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const lyDoChamOpts = useSettingsOptions("ly_do_cham");
  const boPhanBanGiaoOpts = useSettingsOptions("bo_phan_ban_giao");
  const [form, setForm] = useState({
    bo_phan_ban_giao: kn.bo_phan_ban_giao ?? "",
    ma_duyet_doi_linh_kien: kn.ma_duyet_doi_linh_kien ?? "",
    id_lada_phat_sinh: kn.id_lada_phat_sinh ?? "",
    ngay_ghi_nhan_doi_may: kn.ngay_ghi_nhan_doi_may ?? "",
    ngay_dong_doi_may: kn.ngay_dong_doi_may ?? "",
    giai_trinh_cham_doi_may: kn.giai_trinh_cham_doi_may ?? "",
    ket_qua_doi_may: kn.ket_qua_doi_may ?? "",
    nguoi_xac_nhan_doi_may: kn.nguoi_xac_nhan_doi_may ?? "",
  });

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const serverForm = {
    bo_phan_ban_giao: kn.bo_phan_ban_giao ?? "", ma_duyet_doi_linh_kien: kn.ma_duyet_doi_linh_kien ?? "",
    id_lada_phat_sinh: kn.id_lada_phat_sinh ?? "", ngay_ghi_nhan_doi_may: kn.ngay_ghi_nhan_doi_may ?? "",
    ngay_dong_doi_may: kn.ngay_dong_doi_may ?? "", giai_trinh_cham_doi_may: kn.giai_trinh_cham_doi_may ?? "",
    ket_qua_doi_may: kn.ket_qua_doi_may ?? "", nguoi_xac_nhan_doi_may: kn.nguoi_xac_nhan_doi_may ?? "",
  };
  const isDirty = editable && JSON.stringify(form) !== JSON.stringify(serverForm);

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) body[k] = v.trim() === "" ? null : v.trim();
      return api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, body);
    },
    onSuccess: () => {
      showToast("Đã lưu thông tin đổi máy", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Đổi máy</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          <ReadField label="ID Lada phát sinh" value={kn.id_lada_phat_sinh} />
          <ReadField label="Mã duyệt đổi linh kiện" value={kn.ma_duyet_doi_linh_kien} />
          <ReadField label="Ngày ghi nhận đổi máy" value={kn.ngay_ghi_nhan_doi_may} />
          <ReadField label="Ngày đóng đổi máy" value={kn.ngay_dong_doi_may} />
          <ReadField label="Kết quả đổi máy" value={ketQuaDoiMayLabel(kn.ket_qua_doi_may)} />
          <ReadField label="Người xác nhận đổi máy" value={kn.nguoi_xac_nhan_doi_may} />
        </div>
        <div className="mt-2">
          <ReadField label="Giải trình chậm đổi máy" value={kn.giai_trinh_cham_doi_may} />
        </div>

        <p className="mb-1.5 mt-3 border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Khác</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          <ReadField label="Bộ phận bàn giao" value={kn.bo_phan_ban_giao} />
          <ReadField label="Cảm cờ" value={camCoLabel(kn.cam_co)} />
        </div>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset className="rounded-lg border border-line bg-white p-2.5">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Đổi máy</legend>
          <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
            <Field label="ID Lada phát sinh">
              <Input value={form.id_lada_phat_sinh} onChange={(e) => setField("id_lada_phat_sinh", e.target.value)} />
            </Field>
            <Field label="Mã duyệt đổi linh kiện">
              <Input value={form.ma_duyet_doi_linh_kien} onChange={(e) => setField("ma_duyet_doi_linh_kien", e.target.value)} />
            </Field>
            <Field label="Kết quả đổi máy">
              <Select
                options={KET_QUA_DOI_MAY_OPTIONS}
                placeholder="— Chọn —"
                value={form.ket_qua_doi_may}
                onChange={(e) => setField("ket_qua_doi_may", e.target.value)}
              />
            </Field>
            <Field label="Ngày ghi nhận đổi máy">
              <Input type="date" value={form.ngay_ghi_nhan_doi_may} onChange={(e) => setField("ngay_ghi_nhan_doi_may", e.target.value)} />
            </Field>
            <Field label="Ngày đóng đổi máy">
              <Input type="date" value={form.ngay_dong_doi_may} onChange={(e) => setField("ngay_dong_doi_may", e.target.value)} />
            </Field>
            <Field label="Người xác nhận đổi máy">
              <Input value={form.nguoi_xac_nhan_doi_may} onChange={(e) => setField("nguoi_xac_nhan_doi_may", e.target.value)} />
            </Field>
            <div className="sm:col-span-3">
              <Field label="Giải trình chậm đổi máy" hint="Báo cáo chậm #2 — lý do chậm riêng của nhánh đổi máy (từ danh mục)">
                <Combobox
                  options={(lyDoChamOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                  value={form.giai_trinh_cham_doi_may}
                  onChange={(v) => setField("giai_trinh_cham_doi_may", v)}
                />
              </Field>
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-white p-2.5">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Khác</legend>
          <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
            <Field label="Bộ phận bàn giao">
              <Combobox
                options={(boPhanBanGiaoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.bo_phan_ban_giao}
                onChange={(v) => setField("bo_phan_ban_giao", v)}
              />
            </Field>
            <div className="text-xs text-ink-soft">
              <span className="mb-1 block font-medium">Cắm cờ</span>
              <span>Dùng nút cắm cờ ở đầu popup.</span>
            </div>
          </div>
        </fieldset>

        <div className="flex justify-end">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu..." : "Lưu thông tin đổi máy"}
          </Btn>
        </div>
      </form>
    </>
  );
}

// ---------- Tiến trình & lịch sử ----------

function useNameMap() {
  const q = useQuery({
    queryKey: ["nguoi-directory"],
    queryFn: () => api.get<{ items: { email: string; ten: string | null }[] }>("/auth/nguoi-directory"),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const m = new Map<string, string>();
    (q.data?.items ?? []).forEach((r) => { if (r.ten) m.set(r.email, r.ten); });
    return (email: string | null | undefined) => (email ? m.get(email) ?? email : "—");
  }, [q.data]);
}

const LS_LABEL: Record<string, string> = {
  tao_moi: "Tạo phản ánh",
  cap_nhat: "Cập nhật thông tin",
  chuyen_trang_thai: "Chuyển trạng thái",
  danh_gia_loi: "Đánh giá nguyên nhân lỗi",
  danh_gia_ql: "Đánh giá QL",
  huy: "Hủy phản ánh",
  mo_lai: "Mở lại ca",
  phu_trach: "Đổi người phụ trách",
  tiep_nhan: "Tiếp nhận",
};

// Nhãn field ngắn gọn cho log "cập nhật 1 trường" (item: badge cụ thể thay vì chung chung).
const LICH_SU_FIELD_LABEL: Record<string, string> = {
  id_crm_karofi: "ID CRM", id_lada: "ID Lada", nguon: "Nguồn", ten_khach: "Tên khách", sdt_khach: "SĐT",
  muc_do: "Mức độ", nhom_van_de: "Nhóm vấn đề", van_de_dau_vao: "Vấn đề đầu vào",
  cam_co: "Cắm cờ", trang_thai: "Trạng thái", nguoi_phu_trach: "Người phụ trách",
  loi_nha_san_xuat: "Lỗi nhà sản xuất", loi_lap_dat: "Lỗi lắp đặt",
  loi_thai_do_ktv: "Lỗi thái độ KTV", loi_quy_trinh_nskx: "Lỗi quy trình NSKX",
};

type LsTone = "blue" | "violet" | "teal" | "amber" | "green" | "red" | "gray";

// Học theo phong cách timeline "GT tồn" — mỗi hành động hệ thống có 1 badge riêng, cụ thể
// (vd "Cập nhật ID CRM" thay vì chung chung "Cập nhật thông tin") thay vì show mỗi
// LS_LABEL[hanh_dong] như trước.
function lichSuBadge(l: LichSu): { badge: string; tone: LsTone } {
  switch (l.hanh_dong) {
    case "tao_moi":
      return { badge: "Tạo phản ánh", tone: "green" };
    case "cap_nhat": {
      const fields = (l.truong ?? "").split(",").filter(Boolean);
      if (fields.length === 1) {
        const label = LICH_SU_FIELD_LABEL[fields[0]] ?? fields[0];
        return { badge: `Cập nhật ${label}`, tone: fields[0] === "id_crm_karofi" ? "teal" : fields[0] === "id_lada" ? "violet" : "blue" };
      }
      return { badge: "Cập nhật thông tin", tone: "blue" };
    }
    case "danh_gia_loi":
      return { badge: "Chốt lỗi", tone: "amber" };
    case "danh_gia_ql":
      return { badge: "Đánh giá QL", tone: "amber" };
    case "chuyen_trang_thai":
      return l.gia_tri_moi === "Da ket thuc"
        ? { badge: "Chốt kết thúc", tone: "green" }
        : { badge: "Đóng ca", tone: "blue" };
    case "mo_lai":
      return { badge: "Mở lại ca", tone: "amber" };
    case "huy":
      return { badge: "Hủy phản ánh", tone: "red" };
    case "phu_trach":
      return { badge: "Đổi người phụ trách", tone: "gray" };
    case "tiep_nhan":
      return { badge: "Tiếp nhận", tone: "green" };
    default:
      return { badge: LS_LABEL[l.hanh_dong] ?? l.hanh_dong, tone: "gray" };
  }
}

function lichSuSummary(l: LichSu): string {
  if (l.hanh_dong === "danh_gia_loi") {
    const label = LICH_SU_FIELD_LABEL[l.truong ?? ""] ?? l.truong ?? "";
    return `${label}: ${translateDanhGia((l.gia_tri_moi ?? null) as DanhGia3 | null)}`;
  }
  return l.gia_tri_moi ?? "";
}

function TienTrinhSection({
  id,
  items,
  lichSu,
  canThem,
  onSaved,
  addOnly,
  overdue,
}: {
  id: string;
  items: TienTrinh[];
  lichSu: LichSu[];
  canThem: boolean;
  onSaved: () => void;
  addOnly?: boolean;
  overdue?: boolean;
}) {
  const { showToast } = useToast();
  const nameOf = useNameMap();
  const lyDoChamOpts = useSettingsOptions("ly_do_cham");
  const [noiDung, setNoiDung] = useState("");
  const [lyDo, setLyDo] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ tienTrinh: TienTrinh }>(`/khieu-nai/${id}/tien-trinh`, {
        noi_dung_ghi_chep: noiDung.trim() === "" ? undefined : noiDung.trim(),
        ly_do_xu_ly_cham: lyDo.trim() === "" ? undefined : lyDo.trim(),
      }),
    onSuccess: () => {
      setNoiDung("");
      setLyDo("");
      showToast("Đã thêm ghi chú tiến trình", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Thêm ghi chú thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (overdue) {
      if (!noiDung.trim() || !lyDo.trim()) {
        showToast("Quá hạn giải trình — cần điền cả Nội dung ghi chép và Lý do xử lý chậm", "error");
        return;
      }
    } else if (!noiDung.trim() && !lyDo.trim()) {
      return;
    }
    mutation.mutate();
  };

  const events: TimelineEvent[] = [
    ...items.map((t) => ({
      key: `t-${t.id}`,
      tone: "violet" as LsTone,
      badge: "Ghi chú tiến trình",
      time: fmtVN.dateTime(t.ngay_tao),
      sortMs: parseVnNaive(t.ngay_tao),
      actor: nameOf(t.nguoi_tao),
      summary: [t.noi_dung_ghi_chep, t.ly_do_xu_ly_cham ? `Lý do chậm: ${t.ly_do_xu_ly_cham}` : null].filter(Boolean).join("\n"),
    })),
    ...lichSu.map((l) => {
      const { badge, tone } = lichSuBadge(l);
      return {
        key: `l-${l.id}`,
        tone,
        badge,
        time: fmtVN.dateTime(l.thoi_diem),
        sortMs: parseVnNaive(l.thoi_diem),
        actor: nameOf(l.nguoi),
        summary: lichSuSummary(l),
      };
    }),
  ].sort((a, b) => b.sortMs - a.sortMs);

  const addForm = (
    <form onSubmit={submit} className="mb-4 flex flex-col gap-2">
      <Field label="Nội dung ghi chép">
        <Textarea rows={addOnly ? 4 : 2} value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="Ghi chú xử lý..." autoFocus={addOnly} />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Lý do xử lý chậm (nếu có)">
            <Combobox
              options={(lyDoChamOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={lyDo}
              onChange={setLyDo}
            />
          </Field>
        </div>
        <Btn type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Đang lưu..." : "Thêm ghi chú"}
        </Btn>
      </div>
    </form>
  );

  if (addOnly) return addForm;

  return (
    <>
      {canThem && addForm}

      <Timeline events={events} />
    </>
  );
}

// ---------- Action bar ----------

function ActionBar({
  kn,
  user,
  onDone,
  onError,
}: {
  kn: KhieuNai;
  user: AppUser;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [confirmChot, setConfirmChot] = useState(false);
  const [huyOpen, setHuyOpen] = useState(false);
  const [lyDoHuy, setLyDoHuy] = useState(LY_DO_HUY_OPTIONS[0]);
  const [ghiChuHuy, setGhiChuHuy] = useState("");

  const canDongCa = (user.vai_tro === "TN CSKH" || user.vai_tro === "Admin") && kn.trang_thai === "Dang xu ly";
  const dongCaReady = dongCaChecklist(kn).every((c) => c.ok);

  // QL/Admin duoc chot thang tu "Dang xu ly" - bo qua buoc "Dong ca" cua TN CSKH (yeu cau ra soat
  // 2026-09) - nhung van phai du 4 loi + ket luan (dieu kien von do "Dong ca" dam nhan).
  const chotTrucTiep = kn.trang_thai === "Dang xu ly";
  const canChot = (user.vai_tro === "QL" || user.vai_tro === "Admin") && (kn.trang_thai === "Cho chot ket thuc" || chotTrucTiep);
  const chotReady = !chotTrucTiep || dongCaChecklist(kn).every((c) => c.ok);
  const canHuy =
    (user.vai_tro === "CSKH" || user.vai_tro === "TN CSKH" || user.vai_tro === "QL" || user.vai_tro === "Admin") &&
    kn.trang_thai !== "Da ket thuc";

  const dongCa = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/dong-ca`),
    onSuccess: onDone,
    onError: (err) => onError(err instanceof ApiError ? mapDongCaError(err.code) : "Đóng ca thất bại"),
  });
  const chot = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/chot`),
    onSuccess: () => { setConfirmChot(false); onDone(); },
    onError: (err) => {
      setConfirmChot(false);
      onError(
        err instanceof ApiError
          ? err.code === "CAN_DANH_GIA_QL"
            ? "Cần nhập Đánh giá QL trước khi chốt"
            : err.code === "CAN_DANH_GIA_DAY_DU"
              ? "Cần đánh giá đủ 4 lỗi + kết luận trước khi chốt"
              : err.code === "QUA_HAN_GIAI_TRINH"
                ? "Quá hạn giải trình lý do chậm — thêm ghi chú tiến trình trước khi chốt"
                : `Chốt thất bại: ${err.code}`
          : "Chốt thất bại",
      );
    },
  });
  const huy = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/huy`, { ly_do_huy: lyDoHuy, ghi_chu: ghiChuHuy.trim() || undefined }),
    onSuccess: () => { setHuyOpen(false); onDone(); },
    onError: (err) => onError(err instanceof ApiError ? `Hủy thất bại: ${err.code}` : "Hủy thất bại"),
  });

  if (!canDongCa && !canChot && !canHuy) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canDongCa && (
        <Btn
          variant="primary"
          size="sm"
          disabled={!dongCaReady || dongCa.isPending}
          title={!dongCaReady ? "Cần đánh giá đủ 4 lỗi + kết luận" : undefined}
          onClick={() => dongCa.mutate()}
        >
          {dongCa.isPending ? "Đang đóng ca..." : "Đóng ca"}
        </Btn>
      )}
      {canChot && (
        <Btn
          variant="primary"
          size="sm"
          disabled={chot.isPending || !chotReady}
          title={!chotReady ? "Cần đánh giá đủ 4 lỗi + kết luận trước khi chốt" : undefined}
          onClick={() => setConfirmChot(true)}
        >
          Chốt
        </Btn>
      )}
      {canHuy && (
        <Btn variant="danger" size="sm" disabled={huy.isPending} onClick={() => setHuyOpen(true)}>
          Hủy phản ánh
        </Btn>
      )}

      {confirmChot && (
        <ConfirmBox
          title="Xác nhận chốt phản ánh"
          body={
            <>
              <p>Mã đơn: <span className="font-mono">{kn.id}</span></p>
              <p>Kết luận phản ánh: <b>{translateDanhGia(kn.ket_luan_khieu_nai)}</b></p>
              <p>Đánh giá QL: <b>{kn.danh_gia_ql || "(chưa nhập — không chốt được)"}</b></p>
              {chotTrucTiep && (
                <p className="mt-1 text-amber-700">Chốt thẳng từ "Đang xử lý" — bỏ qua bước "Đóng ca" của TN CSKH.</p>
              )}
              <p className="mt-1 text-ink-soft">Sau khi chốt, ca chuyển sang “Đã kết thúc” và bị khoá.</p>
            </>
          }
          confirmLabel={chot.isPending ? "Đang chốt..." : "Chốt"}
          confirmDisabled={chot.isPending || !kn.danh_gia_ql || !chotReady}
          onConfirm={() => chot.mutate()}
          onCancel={() => setConfirmChot(false)}
        />
      )}

      {huyOpen && (
        <ConfirmBox
          title="Hủy phản ánh"
          body={
            <div className="flex flex-col gap-2">
              <p>Mã đơn: <span className="font-mono">{kn.id}</span></p>
              <label className="text-xs font-medium text-ink-soft">Lý do hủy *</label>
              <Select
                options={LY_DO_HUY_OPTIONS.map((v) => ({ value: v, label: v }))}
                value={lyDoHuy}
                onChange={(e) => setLyDoHuy(e.target.value)}
              />
              <label className="text-xs font-medium text-ink-soft">Ghi chú thêm</label>
              <Textarea rows={2} value={ghiChuHuy} onChange={(e) => setGhiChuHuy(e.target.value)} />
            </div>
          }
          confirmLabel={huy.isPending ? "Đang hủy..." : "Xác nhận hủy"}
          confirmDisabled={huy.isPending || !lyDoHuy}
          danger
          onConfirm={() => huy.mutate()}
          onCancel={() => setHuyOpen(false)}
        />
      )}
    </div>
  );
}

function ConfirmBox({
  title, body, confirmLabel, confirmDisabled, danger, onConfirm, onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
        <div className="space-y-1 text-sm text-ink">{body}</div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={onCancel}>Không</Btn>
          <Btn variant={danger ? "danger" : "primary"} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function mapDongCaError(code: string): string {
  if (code === "CAN_DANH_GIA_DAY_DU") return "Cần đánh giá đầy đủ 4 lỗi và kết luận trước khi đóng ca";
  if (code === "INVALID_STATE") return "Trạng thái hiện tại không cho phép đóng ca";
  if (code === "QUA_HAN_GIAI_TRINH") return "Quá hạn giải trình lý do chậm — thêm ghi chú tiến trình trước khi đóng ca";
  return `Đóng ca thất bại: ${code}`;
}
