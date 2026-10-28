import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AppUser, DanhGia3, KhieuNai, KhieuNaiDinhKem, LichSu, TienTrinh } from "../api/types";
import { fmtVN, translateDanhGia } from "../lib/formatVN";
import { mucDoTone, MUC_DO_BG, camCoBorderClass, sortMucDoOptions } from "../lib/severity";
import { useCreateSettingsOption, useSettingsOptions } from "../api/useSettingsOptions";
import { Btn } from "../components/ui/Btn";
import { Modal } from "../components/ui/Modal";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Combobox } from "../components/ui/Combobox";
import { StatusBadge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";
import { Timeline, type TimelineEvent } from "../components/ui/Timeline";
import { Tabs, type TabItem } from "../components/ui/Tabs";
import { NGUON_OPTIONS, NGUON_LABEL } from "./KhieuNaiForm";
import { CRM_SAI_SAU_GIO, chuanHoaIdCrm, laChoCrmMoi, laIdCrmSai } from "../lib/crm";
import {
  DINH_KEM_ERROR_MESSAGES, DINH_KEM_MAX_ANH, DINH_KEM_MAX_VIDEO, VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_S,
  compressImage, driveViewUrl, readVideoDuration,
} from "../lib/dinhKem";

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
  dinhKem: KhieuNaiDinhKem[];
  giaiTrinhDeadline: { overdue: boolean; deadline: string } | null;
  related: RelatedItem[];
}

type TFn = (k: string, o?: Record<string, unknown>) => string;

function getDanhGiaOptions(t: TFn) {
  return [
    { value: "Chua danh gia", label: t("detail.danhGia.chuaDanhGia") },
    { value: "Khong", label: t("detail.danhGia.khong") },
    { value: "Co", label: t("detail.danhGia.co") },
  ];
}

function getCamCoOptions(t: TFn) {
  return [
    { value: "Khong co", label: t("detail.camCoOptions.khongCo") },
    { value: "Co vang", label: t("detail.camCoOptions.coVang") },
    { value: "Co do", label: t("detail.camCoOptions.coDo") },
  ];
}

function getKetQuaDoiMayOptions(t: TFn) {
  return [
    { value: "Khong co", label: t("detail.doiMay.options.khongCo") },
    { value: "Dang xu ly", label: t("detail.doiMay.options.dangXuLy") },
    { value: "Doi thanh cong", label: t("detail.doiMay.options.doiThanhCong") },
    { value: "Huy bo", label: t("detail.doiMay.options.huyBo") },
    { value: "Doi khong thanh cong", label: t("detail.doiMay.options.doiKhongThanhCong") },
  ];
}

function getLyDoHuyOptions(t: TFn) {
  return [
    t("detail.action.lyDoHuyOptions.trungLap"),
    t("detail.action.lyDoHuyOptions.khachRut"),
    t("detail.action.lyDoHuyOptions.nhapNham"),
    t("detail.action.lyDoHuyOptions.khongLienHe"),
    t("detail.action.lyDoHuyOptions.khongThuocPhamVi"),
    t("detail.action.lyDoHuyOptions.khac"),
  ];
}

// Dịch giá trị mã hoá sang nhãn hiển thị (dùng cho cả chế độ đọc). Hai nhóm có value trùng
// ("Khong co") nên phải tra riêng theo từng nhóm.
function labelFrom(opts: { value: string; label: string }[], v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  return opts.find((o) => o.value === v)?.label ?? v;
}
const camCoLabel = (t: TFn, v: string | null | undefined) => labelFrom(getCamCoOptions(t), v);
const ketQuaDoiMayLabel = (t: TFn, v: string | null | undefined) => labelFrom(getKetQuaDoiMayOptions(t), v);

const isKtvLikeRole = (v: string | null) => v === "NV Sale" || v === "Tổng đài viên";

function getCrmWarningMessages(t: TFn): Record<string, string> {
  return {
    DVBH_NOT_FOUND: t("detail.crm.warning.DVBH_NOT_FOUND"),
    DVBH_LOOKUP_FAILED: t("detail.crm.warning.DVBH_LOOKUP_FAILED"),
    CASE_CLOSED: t("detail.crm.warning.CASE_CLOSED"),
    RESYNC_TOO_SOON: t("detail.crm.warning.RESYNC_TOO_SOON"),
    CHUA_TIEP_NHAN: t("detail.crm.warning.CHUA_TIEP_NHAN"),
  };
}

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

function giaiTrinhDvbhEvents(t: TFn, kn: KhieuNai): TimelineEvent[] {
  return parseGiaiTrinhDvbh(kn.giai_trinh_dvbh_json).map((g, i) => ({
    key: `gt-${i}`,
    tone: "teal",
    badge: t("detail.crmModal.gtTonBadge"),
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
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint lg:text-[11px]">{label}</p>
      <p className={`text-base lg:text-[13px] ${empty ? "text-ink-faint" : "text-ink"}`}>{empty ? "—" : value}</p>
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
  media: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="m3 15 5-5 4 4 3-3 6 6" /><circle cx="8" cy="9" r="1.5" /></svg>,
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const a = ZONE_ACCENT[accent];
  return (
    <section className={`overflow-hidden rounded-lg border border-l-4 border-line ${a.bar} bg-surface shadow-card ring-1 ring-inset ${a.ring}`}>
      <header className={`flex items-center gap-2 border-b px-3 py-2 lg:py-1.5 ${a.head}`}>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${a.chip}`}>{icon}</span>
        <h3 className="text-sm font-bold uppercase tracking-wide lg:text-[13px]">{title}</h3>
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          {collapsible && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded px-2 py-1 text-sm font-semibold opacity-80 hover:bg-black/5 hover:opacity-100 lg:px-0 lg:py-0 lg:text-xs"
            >
              {open ? t("detail.zone.collapse") : t("detail.zone.expand")}
            </button>
          )}
        </div>
      </header>
      {open && <div className="px-3 py-3 lg:py-2.5">{children}</div>}
    </section>
  );
}

const TILE_TONE: Record<string, string> = {
  gray: "bg-surface-2 text-ink ring-line",
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
    <div className={`rounded-lg px-2.5 py-1.5 ring-1 ring-inset lg:py-1 ${TILE_TONE[tone] ?? TILE_TONE.gray} ${empty ? "opacity-45" : ""}`}>
      <span className="block text-xs font-medium uppercase leading-none tracking-wide opacity-70 lg:text-[10px]">{label}</span>
      <span className={`block leading-tight ${strong ? "text-base font-semibold lg:text-sm" : "text-base font-medium lg:text-[13px]"} ${mono ? "font-mono" : ""}`}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function NextStepChip({ kn }: { kn: KhieuNai }) {
  const { t } = useTranslation();
  let text = "";
  let cls = "bg-gray-100 text-ink-soft";
  if (kn.trang_thai === "Dang xu ly") {
    const du =
      kn.loi_nha_san_xuat !== "Chua danh gia" &&
      kn.loi_lap_dat !== "Chua danh gia" &&
      kn.loi_thai_do_ktv !== "Chua danh gia" &&
      kn.loi_quy_trinh_nskx !== "Chua danh gia" &&
      (kn.ket_luan_khieu_nai ?? "Chua danh gia") !== "Chua danh gia";
    if (du) { text = t("detail.nextStep.tnCskhDongCa"); cls = "bg-blue-100 text-blue-800"; }
    else { text = t("detail.nextStep.danhGiaDu4Loi"); cls = "bg-amber-100 text-amber-900"; }
  } else if (kn.trang_thai === "Cho chot ket thuc") {
    text = t("detail.nextStep.qlChotKetThuc"); cls = "bg-violet-100 text-violet-800";
  } else if (kn.trang_thai === "Da ket thuc") {
    text = t("detail.nextStep.daHoanTat"); cls = "bg-green-100 text-green-800";
  } else if (kn.trang_thai === "Huy") {
    text = kn.ly_do_huy ? t("detail.nextStep.daHuyWithReason", { reason: kn.ly_do_huy }) : t("detail.nextStep.daHuy"); cls = "bg-gray-200 text-ink-soft";
  } else if (kn.trang_thai === "Cho tiep nhan") {
    text = t("detail.nextStep.cskhTiepNhan"); cls = "bg-red-100 text-red-800";
  }
  return <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${cls}`}>{text}</span>;
}

function FlagBadge({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation();
  if (value === "Co do") return <span className="rounded-lg bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{t("detail.flag.coDo")}</span>;
  if (value === "Co vang") return <span className="rounded-lg bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{t("detail.flag.coVang")}</span>;
  return null;
}

function CamCoButtons({ kn, canEdit, onSaved }: { kn: KhieuNai; canEdit: boolean; onSaved: () => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const m = useMutation({
    mutationFn: (v: string) => api.patch(`/khieu-nai/${kn.id}`, { cam_co: v }),
    onSuccess: (_d, v) => {
      showToast(v === "Khong co" ? t("detail.camCo.toastBoCo") : t("detail.camCo.toastCamCo"), "success");
      onSaved();
    },
    onError: (e) => showToast(e instanceof ApiError ? t("detail.camCo.toastErrorCode", { code: e.code }) : t("detail.camCo.toastErrorDefault"), "error"),
  });
  const cur = kn.cam_co ?? "Khong co";
  if (!canEdit) return <FlagBadge value={cur} />;

  const base = "rounded-lg px-2 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors disabled:opacity-50";
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs font-medium text-ink-soft">{t("detail.camCo.label")}</span>
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate("Co vang")}
        className={`${base} ${cur === "Co vang" ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-amber-700 ring-amber-400 hover:bg-amber-50"}`}
      >
        {t("detail.camCo.vang")}
      </button>
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate("Co do")}
        className={`${base} ${cur === "Co do" ? "bg-red-600 text-white ring-red-600" : "bg-white text-red-700 ring-red-400 hover:bg-red-50"}`}
      >
        {t("detail.camCo.do")}
      </button>
      {cur !== "Khong co" && (
        <button
          type="button"
          disabled={m.isPending}
          onClick={() => m.mutate("Khong co")}
          className={`${base} bg-white text-ink-soft ring-line hover:bg-surface-2`}
        >
          {t("detail.camCo.bo")}
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
  const { t } = useTranslation();
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
        title={t("detail.warningBell.title")}
        className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ring-1 ring-inset ${WARN_BELL_CLS[worst]}`}
      >
        ⚠ {warnings.length}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 w-[22rem] max-w-[90vw] overflow-hidden rounded-lg border border-line bg-white shadow-lg">
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

function dongCaChecklist(t: TFn, kn: KhieuNai) {
  return [
    { label: t("detail.checklist.loiNsx"), ok: kn.loi_nha_san_xuat !== "Chua danh gia" },
    { label: t("detail.checklist.loiLapDat"), ok: kn.loi_lap_dat !== "Chua danh gia" },
    { label: t("detail.checklist.loiThaiDoKtv"), ok: kn.loi_thai_do_ktv !== "Chua danh gia" },
    { label: t("detail.checklist.loiQuyTrinhNskx"), ok: kn.loi_quy_trinh_nskx !== "Chua danh gia" },
    { label: t("detail.checklist.ketLuan"), ok: kn.ket_luan_khieu_nai !== "Chua danh gia" && kn.ket_luan_khieu_nai !== null },
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
  const { t } = useTranslation();
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

  if (detail.isLoading) return <p className="p-8 text-center text-sm text-ink-soft">{t("detail.loading")}</p>;
  if (detail.isError || !detail.data) return <p className="p-8 text-center text-sm text-red-600">{t("detail.loadError")}</p>;

  const kn = detail.data.khieuNai;
  const tienTrinh = detail.data.tienTrinh;
  const lichSu = detail.data.lichSu ?? [];
  const dinhKem = detail.data.dinhKem ?? [];
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
  // Sua thong tin don goc (CSKH_FIELDS: ten khach, SDT, dia chi, model...) KHONG bi khoa "qua han
  // giai trinh" - khoa do chi ap dung cho danh gia loi/QL (xem backend PATCH /:id, touchesEvaluation).
  // Cho phep CSKH/TN CSKH sua truoc khi don duoc chot ket thuc du dang qua han giai trinh (yeu cau ra
  // soat 2026-09-21) - dung rieng bien nay cho nut "Sua" o Thong tin dau vao, KHONG dung isCskh.
  const canEditThongTin =
    ["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "") && !isClosed && !chuaTiepNhan;
  const canDanhGia4Loi = isCskh;
  const canXuLyDoiMay = canDanhGia4Loi;
  const canThemTienTrinh = ["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "") && !isClosed && !chuaTiepNhan;
  // NV Sale/Tong dai vien xem duoc ca nguoi khac (quyen "Xem tat ca ca") nhung CHI XEM.
  const laCaNguoiKhacChiXem = isKtvLikeRole(user.vai_tro) && kn.nguoi_tao !== user.email;
  const canPhuTrach =
    ["CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "") && !isClosed && !chuaTiepNhan && !laCaNguoiKhacChiXem;
  const canTiepNhan = ["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "") && chuaTiepNhan;
  // Anh/video dinh kem: nguoi tao (thuong la NV Sale/Tong dai vien bao ca hien truong - 2 vai tro
  // nay KHONG co quyen sua gi khac sau khi tao, xem canEditThongTin o tren) + CSKH/TN CSKH/QL/Admin.
  const canDinhKem = (kn.nguoi_tao === user.email || ["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "")) && kn.trang_thai !== "Huy" && !isClosed;

  const copyId = () => {
    navigator.clipboard?.writeText(kn.id).then(
      () => showToast(t("detail.header.copiedToast", { id: kn.id }), "success"),
      () => showToast(t("detail.header.copyFailedToast"), "error"),
    );
  };

  const checklist = dongCaChecklist(t, kn);
  const dongCaBlocked =
    (user.vai_tro === "TN CSKH" || user.vai_tro === "Admin") &&
    kn.trang_thai === "Dang xu ly" &&
    !checklist.every((c) => c.ok);
  // Số lượng dữ liệu mỗi tab bên phải (item 4) — chỉ hiện badge khi > 0, giống phong cách tab dvbh.
  const giaiTrinhDvbhCount = giaiTrinhDvbhEvents(t, kn).length;
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
    { key: "tien-trinh", label: t("detail.zone.tienTrinhLichSu"), count: tabCounts["tien-trinh"] },
    { key: "crm", label: t("detail.zone.dongBoCrm"), count: tabCounts.crm },
    { key: "doi-may", label: t("detail.zone.thongTinKhac"), count: tabCounts["doi-may"] },
    { key: "ket-luan", label: t("detail.zone.ketLuanDanhGia"), count: tabCounts["ket-luan"] },
  ];

  // Kết quả ngắn gọn cho tiêu đề
  const ketLuanDone = kn.ket_luan_khieu_nai && kn.ket_luan_khieu_nai !== "Chua danh gia";
  const ketQua =
    kn.trang_thai === "Huy"
      ? kn.ly_do_huy
        ? t("detail.header.ketQuaHuyWithReason", { reason: kn.ly_do_huy })
        : t("detail.header.ketQuaHuyNoReason")
      : kn.ket_qua_crm
        ? kn.ket_qua_crm
        : ketLuanDone
          ? t("detail.header.ketQuaKetLuan", { value: translateDanhGia(kn.ket_luan_khieu_nai) })
          : t("detail.header.ketQuaChuaCo");
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
          <span className="font-semibold">{t("detail.warnings.choTiepNhanBold")}</span>{t("detail.warnings.choTiepNhanPost")}
          {!canTiepNhan && <span className="italic text-red-800">{t("detail.warnings.dangChoTiepNhan")}</span>}
        </span>
      ),
    });
  }
  if (dongCaBlocked) {
    warnings.push({
      tone: "amber",
      content: (
        <>
          <span className="font-semibold">{t("detail.warnings.chuaDuDieuKienBold")}</span>{" "}
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
          <span className="font-semibold">{t("detail.warnings.quaHanBold")}</span>
          {giaiTrinhDeadline && <span>{t("detail.warnings.quaHanMoc", { date: fmtVN.dateTime(giaiTrinhDeadline) })}</span>}{t("detail.warnings.quaHanPre")}
          <span className="font-semibold">{t("detail.warnings.quaHanGhiChuBold")}</span>{t("detail.warnings.quaHanMid1")}
          <span className="font-semibold">{t("detail.warnings.quaHanNoiDungBold")}</span>{t("detail.warnings.quaHanMid2")}<span className="font-semibold">{t("detail.warnings.quaHanLyDoBold")}</span>{t("detail.warnings.quaHanPost")}
        </>
      ),
    });
  }
  if (isClosed) {
    warnings.push({
      tone: "gray",
      content: (
        <div className="flex items-center justify-between gap-2">
          <span>{t("detail.warnings.daKetThuc")}</span>
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
            className="rounded border border-line px-2 py-0.5 font-mono text-xs text-ink-soft hover:bg-surface-2"
            title={t("detail.header.copyIdTitle")}
          >
            {kn.id} ⧉
          </button>
          <span className="text-sm">
            <span className="text-ink-soft">{t("detail.header.ketQuaLabel")}</span>
            <span className="font-semibold text-ink">{ketQua}</span>
          </span>
          <span className="text-sm">
            <span className="text-ink-soft">{t("detail.header.tocDoLabel")}</span>
            <span className="font-semibold text-ink">{tocDo}</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <WarningBell warnings={warnings} />
            {canTiepNhan && <TiepNhanButton id={id} onDone={invalidate} onError={(m) => showToast(m, "error")} />}
            <ActionBar kn={kn} user={user} onDone={invalidate} onError={(m) => showToast(m, "error")} />
            <button
              type="button"
              onClick={onClose}
              aria-label={t("detail.header.close")}
              className="rounded p-1 text-ink-soft hover:bg-accent-soft hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-1.5 text-xs">
          <NextStepChip kn={kn} />
          <NguoiPhuTrachInline kn={kn} user={user} canEdit={canPhuTrach} onSaved={invalidate} nameOf={nameOf} />
          <span className="text-ink-soft">{t("detail.header.tiepNhanAt", { date: fmtVN.dateTime(kn.ngay_tiep_nhan) })}</span>
          <span className="text-ink-soft">{t("detail.header.capNhatAt", { date: fmtVN.relative(kn.ngay_thay_doi) })}</span>
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
              title={t("detail.zone.thongTinDauVao")}
              actions={canEditThongTin && <ZoneBtn onClick={() => setEditing("khach")}>{t("detail.actions.sua")}</ZoneBtn>}
            >
              <CustomerInfoSection kn={kn} editable={false} onSaved={invalidate} />
            </Zone>
            <Zone accent="green" icon={ICON.media} title={t("detail.zone.anhVideoCount", { n: dinhKem.length })}>
              <DinhKemSection khieuNaiId={id} items={dinhKem} canEdit={canDinhKem} onSaved={invalidate} />
            </Zone>
            {related.length > 0 && <RelatedList items={related} onNavigate={onNavigate} />}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            {/* Desktop (lg+): giữ nguyên tab như cũ - nhân viên văn phòng không đổi thói quen thao
                tác (chốt với người dùng 2026-09-22). Mobile: bỏ tab hẳn, xem khối lg:hidden bên dưới. */}
            <div className="hidden lg:block">
              <Tabs tabs={rightTabs} active={rightTab} onChange={(k) => setRightTab(k as RightTabKey)} />

              {rightTab === "tien-trinh" && (
                <Zone
                  accent="violet"
                  icon={ICON.log}
                  title={t("detail.zone.tienTrinhLichSu")}
                  actions={canThemTienTrinh && <ZoneBtn onClick={() => setEditing("log")}>{t("detail.actions.themGhiChu")}</ZoneBtn>}
                >
                  <TienTrinhSection id={id} items={tienTrinh} lichSu={lichSu} canThem={false} onSaved={invalidate} />
                </Zone>
              )}

              {rightTab === "crm" && (
                <Zone
                  accent="teal"
                  icon={ICON.sync}
                  title={t("detail.zone.dongBoCrm")}
                  actions={isCskh && <ZoneBtn onClick={() => setEditing("crm")}>{t("detail.actions.suaIdCrm")}</ZoneBtn>}
                >
                  <CrmSection kn={kn} user={user} onSaved={invalidate} forceEditable={false} />
                </Zone>
              )}

              {rightTab === "doi-may" && (
                <Zone
                  accent="amber"
                  icon={ICON.swap}
                  title={t("detail.zone.thongTinKhac")}
                  actions={canXuLyDoiMay && <ZoneBtn onClick={() => setEditing("doimay")}>{t("detail.actions.sua")}</ZoneBtn>}
                >
                  <DoiMaySection kn={kn} editable={false} onSaved={invalidate} />
                </Zone>
              )}

              {rightTab === "ket-luan" && (
                <Zone
                  accent="rose"
                  icon={ICON.scale}
                  title={t("detail.zone.ketLuanDanhGia")}
                  actions={
                    <>
                      {canDanhGia4Loi && <ZoneBtn onClick={() => setEditing("loi")}>{t("detail.actions.danhGiaLoi")}</ZoneBtn>}
                      {isQl && <ZoneBtn onClick={() => setEditing("ql")}>{t("detail.actions.danhGiaQl")}</ZoneBtn>}
                    </>
                  }
                >
                  <div className="space-y-2">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t("detail.zone.nguyenNhanLoi")}</p>
                      <TnCskhSection kn={kn} editable={false} onSaved={invalidate} />
                    </div>
                    <div className="border-t border-line pt-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t("detail.zone.danhGiaQlDieuKien")}</p>
                      <QlSection kn={kn} editable={false} onSaved={invalidate} />
                    </div>
                  </div>
                </Zone>
              )}
            </div>

            {/* Mobile (<lg): không dùng tab - xếp dọc cả 4 khối, dùng collapsible sẵn có của Zone
                (defaultOpen/collapsible) thay vì ẩn/hiện qua lại giữa các tab (2026-09-22). */}
            <div className="flex flex-col gap-2 lg:hidden">
              <Zone
                accent="violet"
                icon={ICON.log}
                title={t("detail.zone.tienTrinhLichSu")}
                collapsible
                defaultOpen
                actions={
                  <>
                    {tabCounts["tien-trinh"] > 0 && <ZoneCountBadge n={tabCounts["tien-trinh"]} />}
                    {canThemTienTrinh && <ZoneBtn onClick={() => setEditing("log")}>{t("detail.actions.themGhiChu")}</ZoneBtn>}
                  </>
                }
              >
                <TienTrinhSection id={id} items={tienTrinh} lichSu={lichSu} canThem={false} onSaved={invalidate} />
              </Zone>

              <Zone
                accent="teal"
                icon={ICON.sync}
                title={t("detail.zone.dongBoCrm")}
                collapsible
                defaultOpen={false}
                actions={
                  <>
                    {tabCounts.crm > 0 && <ZoneCountBadge n={tabCounts.crm} />}
                    {isCskh && <ZoneBtn onClick={() => setEditing("crm")}>{t("detail.actions.suaIdCrm")}</ZoneBtn>}
                  </>
                }
              >
                <CrmSection kn={kn} user={user} onSaved={invalidate} forceEditable={false} />
              </Zone>

              <Zone
                accent="amber"
                icon={ICON.swap}
                title={t("detail.zone.thongTinKhac")}
                collapsible
                defaultOpen={false}
                actions={
                  <>
                    {tabCounts["doi-may"] > 0 && <ZoneCountBadge n={tabCounts["doi-may"]} />}
                    {canXuLyDoiMay && <ZoneBtn onClick={() => setEditing("doimay")}>{t("detail.actions.sua")}</ZoneBtn>}
                  </>
                }
              >
                <DoiMaySection kn={kn} editable={false} onSaved={invalidate} />
              </Zone>

              <Zone
                accent="rose"
                icon={ICON.scale}
                title={t("detail.zone.ketLuanDanhGia")}
                collapsible
                defaultOpen
                actions={
                  <>
                    {tabCounts["ket-luan"] > 0 && <ZoneCountBadge n={tabCounts["ket-luan"]} />}
                    {canDanhGia4Loi && <ZoneBtn onClick={() => setEditing("loi")}>{t("detail.actions.danhGiaLoi")}</ZoneBtn>}
                    {isQl && <ZoneBtn onClick={() => setEditing("ql")}>{t("detail.actions.danhGiaQl")}</ZoneBtn>}
                  </>
                }
              >
                <div className="space-y-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t("detail.zone.nguyenNhanLoi")}</p>
                    <TnCskhSection kn={kn} editable={false} onSaved={invalidate} />
                  </div>
                  <div className="border-t border-line pt-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t("detail.zone.danhGiaQlDieuKien")}</p>
                    <QlSection kn={kn} editable={false} onSaved={invalidate} />
                  </div>
                </div>
              </Zone>
            </div>
          </div>
        </div>
      </div>

      {/* ===== POPUP NHẬP LIỆU RIÊNG TỪNG MỤC ===== */}
      {editing === "khach" && (
        <EditDialog title={t("detail.editDialog.suaThongTinDauVao")} onClose={() => setEditing(null)}>
          <CustomerInfoSection kn={kn} editable onSaved={savedAndClose} />
        </EditDialog>
      )}
      {editing === "log" && (
        <EditDialog title={t("detail.editDialog.themGhiChuTienTrinh")} onClose={() => setEditing(null)}>
          <TienTrinhSection id={id} items={tienTrinh} lichSu={lichSu} canThem addOnly overdue={overdue} onSaved={savedAndClose} />
        </EditDialog>
      )}
      {editing === "crm" && (
        <EditDialog title={t("detail.editDialog.suaIdCrmKarofi")} onClose={() => setEditing(null)}>
          <CrmSection kn={kn} user={user} onSaved={savedAndClose} forceEditable />
        </EditDialog>
      )}
      {editing === "doimay" && (
        <EditDialog title={t("detail.editDialog.thongTinKhac")} onClose={() => setEditing(null)}>
          <DoiMaySection kn={kn} editable onSaved={savedAndClose} />
        </EditDialog>
      )}
      {editing === "loi" && (
        <EditDialog title={t("detail.editDialog.danhGiaNguyenNhanLoi")} onClose={() => setEditing(null)}>
          <TnCskhSection kn={kn} editable onSaved={savedAndClose} />
        </EditDialog>
      )}
      {editing === "ql" && (
        <EditDialog title={t("detail.editDialog.danhGiaQl")} onClose={() => setEditing(null)}>
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
      className="rounded-lg border border-black/10 bg-white/95 px-2 py-0.5 text-xs font-semibold shadow-card hover:bg-white"
    >
      ✎ {children}
    </button>
  );
}

// Badge số đếm chuyển từ tab (mobile: 4 khối xếp dọc không còn tab để hiện count).
function ZoneCountBadge({ n }: { n: number }) {
  return (
    <span className="rounded-full border border-black/10 bg-white/95 px-2 py-0.5 text-xs font-semibold shadow-card">
      {n}
    </span>
  );
}

// ---------- Ảnh / video đính kèm (Google Drive) ----------

function DinhKemSection({
  khieuNaiId, items, canEdit, onSaved,
}: {
  khieuNaiId: string;
  items: KhieuNaiDinhKem[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const anhItems = items.filter((i) => i.loai === "anh");
  const videoItems = items.filter((i) => i.loai === "video");

  const uploadMutation = useMutation({
    mutationFn: ({ file, loai }: { file: File; loai: "anh" | "video" }) => {
      const form = new FormData();
      form.set("file", file);
      form.set("loai", loai);
      return api.postForm<{ dinhKem: KhieuNaiDinhKem }>(`/khieu-nai/${khieuNaiId}/dinh-kem`, form);
    },
    onSuccess: () => onSaved(),
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : "UPLOAD_FAILED";
      showToast(DINH_KEM_ERROR_MESSAGES[code] ?? t("detail.dinhKem.toastUploadFailedDefault"), "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (dinhKemId: string) => api.delete(`/khieu-nai/${khieuNaiId}/dinh-kem/${dinhKemId}`),
    onSuccess: () => {
      showToast(t("detail.dinhKem.toastDaXoa"), "success");
      onSaved();
    },
    onError: () => showToast(t("detail.dinhKem.toastXoaThatBai"), "error"),
  });

  const handleAnhChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const remain = DINH_KEM_MAX_ANH - anhItems.length;
    if (remain <= 0) {
      showToast(t("detail.dinhKem.toastMaxAnh", { max: DINH_KEM_MAX_ANH }), "error");
      return;
    }
    setBusy(true);
    try {
      for (const file of files.slice(0, remain)) {
        const compressed = await compressImage(file);
        await uploadMutation.mutateAsync({ file: compressed, loai: "anh" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVideoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const remain = DINH_KEM_MAX_VIDEO - videoItems.length;
    if (remain <= 0) {
      showToast(t("detail.dinhKem.toastMaxVideo", { max: DINH_KEM_MAX_VIDEO }), "error");
      return;
    }
    setBusy(true);
    try {
      for (const file of files.slice(0, remain)) {
        if (file.size > VIDEO_MAX_BYTES) {
          showToast(t("detail.dinhKem.toastVideoQuaLon", { name: file.name, mb: Math.round(VIDEO_MAX_BYTES / 1024 / 1024) }), "error");
          continue;
        }
        try {
          const duration = await readVideoDuration(file);
          if (duration > VIDEO_MAX_DURATION_S) {
            showToast(t("detail.dinhKem.toastVideoQuaDai", { name: file.name, s: VIDEO_MAX_DURATION_S }), "error");
            continue;
          }
        } catch {
          // Khong doc duoc thoi luong (trinh duyet la/dinh dang khong ho tro) - van cho upload,
          // server van chan theo dung luong.
        }
        await uploadMutation.mutateAsync({ file, loai: "video" });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit && items.length === 0) {
    return <p className="text-[13px] text-ink-faint">{t("detail.dinhKem.khongCo")}</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {t("detail.dinhKem.anhCount", { n: anhItems.length, max: DINH_KEM_MAX_ANH })}
          </p>
          {canEdit && anhItems.length < DINH_KEM_MAX_ANH && (
            <label className="cursor-pointer rounded-lg border border-line bg-white px-2 py-0.5 text-xs font-semibold shadow-card hover:bg-surface-2">
              {t("detail.dinhKem.themAnh")}
              <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={handleAnhChange} />
            </label>
          )}
        </div>
        {anhItems.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {anhItems.map((item) => (
              <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-2">
                <a href={item.url} target="_blank" rel="noreferrer">
                  <img src={item.url} alt={item.ten_file ?? ""} className="h-full w-full object-cover" />
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-ink-faint">{t("detail.dinhKem.chuaCoAnh")}</p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {t("detail.dinhKem.videoCount", { n: videoItems.length, max: DINH_KEM_MAX_VIDEO })}
          </p>
          {canEdit && videoItems.length < DINH_KEM_MAX_VIDEO && (
            <label className="cursor-pointer rounded-lg border border-line bg-white px-2 py-0.5 text-xs font-semibold shadow-card hover:bg-surface-2">
              {t("detail.dinhKem.themVideo")}
              <input type="file" accept="video/*" multiple className="hidden" disabled={busy} onChange={handleVideoChange} />
            </label>
          )}
        </div>
        {videoItems.length > 0 ? (
          <div className="space-y-1.5">
            {videoItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2 py-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-green-600 text-white">{ICON.media}</span>
                <a
                  href={driveViewUrl(item.drive_file_id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 truncate text-[13px] text-accent hover:underline"
                >
                  {item.ten_file ?? t("detail.dinhKem.videoFallbackName")}
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    {t("detail.dinhKem.xoa")}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-ink-faint">{t("detail.dinhKem.chuaCoVideo")}</p>
        )}
      </div>
      {busy && <p className="text-[12px] text-accent">{t("detail.dinhKem.dangTaiLen")}</p>}
    </div>
  );
}

// Cac don khac cung ID CRM Karofi hoac cung "hanh trinh" ID Lada (id_lada/id_lada_phat_sinh
// giao nhau) - giup nguoi xu ly phat hien nhanh cac ca lien quan (vd may da doi van bi khieu nai
// lai, hoac cung 1 case CRM tach nhieu phan anh).
function RelatedList({ items, onNavigate }: { items: RelatedItem[]; onNavigate?: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <section className="overflow-hidden rounded-lg border border-l-4 border-line border-l-gray-400 bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-1.5">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">{t("detail.related.title", { n: items.length })}</h3>
      </header>
      <div className="flex flex-col divide-y divide-line px-1 py-1">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            disabled={!onNavigate}
            onClick={() => onNavigate?.(it.id)}
            className={`flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs ${onNavigate ? "hover:bg-surface-2" : ""}`}
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
  const { t } = useTranslation();
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
          <button type="button" onClick={onClose} aria-label={t("detail.header.close")} className="rounded p-1 text-ink-soft hover:bg-accent-soft hover:text-ink">
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
  const { t } = useTranslation();
  const { showToast } = useToast();
  const m = useMutation({
    mutationFn: (email: string | null) => api.post(`/khieu-nai/${kn.id}/phu-trach`, { email }),
    onSuccess: () => { showToast(t("detail.phuTrach.toastSuccess"), "success"); onSaved(); },
    onError: (e) => showToast(e instanceof ApiError ? t("detail.phuTrach.toastErrorCode", { code: e.code }) : t("detail.phuTrach.toastErrorDefault"), "error"),
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
      {kn.nguoi_phu_trach ? nameOf(kn.nguoi_phu_trach) : t("detail.phuTrach.chuaCo")}
      {canEdit && !mine && (
        <button type="button" disabled={m.isPending} onClick={() => m.mutate(user.email)} className="rounded border border-accent/40 bg-white px-1.5 py-0.5 font-medium text-accent hover:bg-accent-soft">
          {t("detail.phuTrach.nhan")}
        </button>
      )}
      {canEdit && kn.nguoi_phu_trach && (
        <button type="button" disabled={m.isPending} onClick={() => m.mutate(null)} className="text-ink-faint hover:text-ink">{t("detail.phuTrach.go")}</button>
      )}
    </span>
  );
}

function TiepNhanButton({ id, onDone, onError }: { id: string; onDone: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: () => api.post<{ khieuNai: KhieuNai }>(`/khieu-nai/${id}/tiep-nhan`),
    onSuccess: onDone,
    onError: (e) => onError(e instanceof ApiError ? t("detail.tiepNhan.failedCode", { code: e.code }) : t("detail.tiepNhan.failedDefault")),
  });
  return (
    <Btn variant="primary" size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
      {m.isPending ? t("detail.tiepNhan.buttonLoading") : t("detail.tiepNhan.button")}
    </Btn>
  );
}

function MoLaiButton({ id, onDone, onError }: { id: string; onDone: () => void; onError: (m: string) => void }) {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: (ly_do: string) => api.post(`/khieu-nai/${id}/mo-lai`, { ly_do }),
    onSuccess: onDone,
    onError: (e) => onError(e instanceof ApiError ? t("detail.moLai.failedCode", { code: e.code }) : t("detail.moLai.failedDefault")),
  });
  return (
    <button
      type="button"
      className="rounded border border-line bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-surface-2"
      onClick={() => {
        const ly_do = window.prompt(t("detail.moLai.promptLyDo"));
        if (ly_do && ly_do.trim()) m.mutate(ly_do.trim());
      }}
    >
      {t("detail.moLai.button")}
    </button>
  );
}

// ---------- Thông tin khách hàng ----------

function CustomerInfoSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { t } = useTranslation();
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
    id_truy_van: kn.id_truy_van ?? "",
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
    id_truy_van: kn.id_truy_van ?? "",
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
      showToast(t("detail.customerInfo.toastSuccess"), "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? t("detail.customerInfo.toastErrorCode", { code: err.code }) : t("detail.customerInfo.toastErrorDefault"), "error"),
  });

  const filteredVanDeDauVao = (vanDeDauVaoOpts.data ?? []).filter(
    (o) => !form.nhom_van_de || o.parent === form.nhom_van_de,
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const groupLabelCls = "mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint lg:text-[11px]";
  const groupLabelClsNotFirst = `mt-3 border-t border-line pt-3 ${groupLabelCls}`;

  if (!editable) {
    return (
      <>
        <p className={groupLabelCls}>{t("detail.customerInfo.heading")}</p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
          <ReadField label={t("detail.customerInfo.phanLoaiKh")} value={kn.phan_loai_kh} />
          <ReadField label={t("detail.customerInfo.tenKhach")} value={kn.ten_khach} />
          <ReadField label={t("detail.customerInfo.sdt")} value={kn.sdt_khach} />
          <ReadField label={t("detail.customerInfo.idLada")} value={kn.id_lada} />
          <ReadField label={t("detail.customerInfo.idTruyXuat")} value={kn.id_truy_van} />
        </div>

        <p className={groupLabelClsNotFirst}>{t("detail.customerInfo.headingDiaChi")}</p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
          <ReadField label={t("detail.customerInfo.tinhCu")} value={kn.tinh} />
          <ReadField label={t("detail.customerInfo.quanHuyenCu")} value={kn.quan_huyen} />
          <ReadField label={t("detail.customerInfo.phuongXaCu")} value={kn.phuong_xa} />
          <ReadField label={t("detail.customerInfo.tinhMoi")} value={kn.tinh_moi} />
          <ReadField label={t("detail.customerInfo.phuongXaMoi")} value={kn.phuong_xa_moi} />
        </div>

        <p className={groupLabelClsNotFirst}>{t("detail.customerInfo.headingNguon")}</p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
          <ReadField label={t("detail.customerInfo.nguoiBao")} value={kn.nguoi_bao} />
          <ReadField label={t("detail.customerInfo.nguon")} value={kn.nguon ? (NGUON_LABEL[kn.nguon] ?? kn.nguon) : null} />
          <ReadField label={t("detail.customerInfo.saleKhuVuc")} value={kn.sale_khu_vuc} />
        </div>

        <p className={groupLabelClsNotFirst}>{t("detail.customerInfo.headingSanPham")}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <ReadField label={t("detail.customerInfo.model")} value={kn.model} />
          <ReadField label={t("detail.customerInfo.hang")} value={kn.hang} />
        </div>

        <p className={groupLabelClsNotFirst}>{t("detail.customerInfo.headingPhanAnh")}</p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
          <ReadField label={t("detail.customerInfo.nhomVanDe")} value={kn.nhom_van_de} />
          <ReadField label={t("detail.customerInfo.nhomYeuCau")} value={kn.nhom_yeu_cau} />
          <ReadField label={t("detail.customerInfo.mucDo")} value={kn.muc_do} />
          <ReadField label={t("detail.customerInfo.vanDeDauVao")} value={kn.van_de_dau_vao} />
        </div>
        <div className="mt-2">
          <ReadField label={t("detail.customerInfo.thongTinBanDau")} value={kn.thong_tin_ban_dau} />
        </div>
        <div className="mt-2">
          <ReadField label={t("detail.customerInfo.ghiChuNguoiTao")} value={kn.ghi_chu_nguoi_tao} />
        </div>
      </>
    );
  }

  const legendCls = "px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint lg:text-[11px]";
  const fieldsetCls = "rounded-lg border border-line bg-white p-2.5";
  const fieldGridCls = "grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3";

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset className={fieldsetCls}>
          <legend className={legendCls}>{t("detail.customerInfo.heading")}</legend>
          <div className={fieldGridCls}>
            <Field label={t("detail.customerInfo.phanLoaiKh")}>
              <Combobox
                options={(phanLoaiKhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.phan_loai_kh}
                onChange={(v) => setField("phan_loai_kh", v)}
              />
            </Field>
            <Field label={t("detail.customerInfo.tenKhach")}>
              <Input value={form.ten_khach} onChange={(e) => setField("ten_khach", e.target.value)} />
            </Field>
            <Field label={t("detail.customerInfo.sdt")}>
              <Input value={form.sdt_khach} onChange={(e) => setField("sdt_khach", e.target.value)} inputMode="tel" />
            </Field>
            <Field label={t("detail.customerInfo.idLada")}>
              <Input value={form.id_lada} onChange={(e) => setField("id_lada", e.target.value)} />
            </Field>
            <Field label={t("detail.customerInfo.idTruyXuat")}>
              <Input value={form.id_truy_van} onChange={(e) => setField("id_truy_van", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className={fieldsetCls}>
          <legend className={legendCls}>{t("detail.customerInfo.headingDiaChi")}</legend>
          <div className={fieldGridCls}>
            <Field label={t("detail.customerInfo.tinhCu")}>
              <Combobox
                options={(tinhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.tinh}
                onChange={(v) => setForm((p) => ({ ...p, tinh: v, quan_huyen: "", phuong_xa: "" }))}
                creatable
                onCreate={createTinh}
              />
            </Field>
            <Field label={t("detail.customerInfo.quanHuyenCu")}>
              <Combobox
                options={(quanHuyenOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.quan_huyen}
                onChange={(v) => setForm((p) => ({ ...p, quan_huyen: v, phuong_xa: "" }))}
                disabled={!form.tinh}
                creatable
                onCreate={(v) => createQuanHuyen(v, form.tinh)}
              />
            </Field>
            <Field label={t("detail.customerInfo.phuongXaCu")}>
              <Combobox
                options={(phuongXaOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.phuong_xa}
                onChange={(v) => setField("phuong_xa", v)}
                disabled={!form.quan_huyen}
                creatable
                onCreate={(v) => createPhuongXa(v, form.quan_huyen)}
              />
            </Field>
            <Field label={t("detail.customerInfo.tinhMoi")}>
              <Combobox
                options={(tinhMoiOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.tinh_moi}
                onChange={(v) => setForm((p) => ({ ...p, tinh_moi: v, phuong_xa_moi: "" }))}
                creatable
                onCreate={createTinhMoi}
              />
            </Field>
            <Field label={t("detail.customerInfo.phuongXaMoi")}>
              <Combobox
                options={(phuongXaMoiOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.phuong_xa_moi}
                onChange={(v) => setField("phuong_xa_moi", v)}
                disabled={!form.tinh_moi}
                creatable
                onCreate={(v) => createPhuongXaMoi(v, form.tinh_moi)}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className={fieldsetCls}>
          <legend className={legendCls}>{t("detail.customerInfo.headingNguon")}</legend>
          <div className={fieldGridCls}>
            <Field label={t("detail.customerInfo.nguoiBao")}>
              <Input value={form.nguoi_bao} onChange={(e) => setField("nguoi_bao", e.target.value)} />
            </Field>
            <Field label={t("detail.customerInfo.nguon")}>
              <Select
                options={NGUON_OPTIONS}
                placeholder={t("detail.customerInfo.choosePlaceholder")}
                value={form.nguon}
                onChange={(e) => setField("nguon", e.target.value)}
              />
            </Field>
            <Field label={t("detail.customerInfo.saleKhuVuc")}>
              <Combobox
                options={(saleKhuVucOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.sale_khu_vuc}
                onChange={(v) => setField("sale_khu_vuc", v)}
                creatable
                onCreate={createSaleKhuVuc}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className={fieldsetCls}>
          <legend className={legendCls}>{t("detail.customerInfo.headingSanPham")}</legend>
          <div className={fieldGridCls}>
            <Field label={t("detail.customerInfo.model")}>
              <Combobox
                options={(modelOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.model}
                onChange={(v) => setField("model", v)}
              />
            </Field>
            <Field label={t("detail.customerInfo.hang")}>
              <Combobox
                options={(hangOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.hang}
                onChange={(v) => setField("hang", v)}
                creatable
                onCreate={createHang}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className={fieldsetCls}>
          <legend className={legendCls}>{t("detail.customerInfo.headingPhanAnh")}</legend>
          <div className={fieldGridCls}>
            <Field label={t("detail.customerInfo.nhomVanDe")}>
              <Combobox
                options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.nhom_van_de}
                onChange={(v) => {
                  setField("nhom_van_de", v);
                  setField("van_de_dau_vao", "");
                }}
              />
            </Field>
            <Field label={t("detail.customerInfo.nhomYeuCau")}>
              <Combobox
                options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.nhom_yeu_cau}
                onChange={(v) => setField("nhom_yeu_cau", v)}
              />
            </Field>
            <Field label={t("detail.customerInfo.mucDo")}>
              <Combobox
                options={sortMucDoOptions(mucDoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.muc_do}
                onChange={(v) => setField("muc_do", v)}
              />
            </Field>
            <Field label={t("detail.customerInfo.vanDeDauVao")}>
              <Combobox
                options={filteredVanDeDauVao.map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.van_de_dau_vao}
                onChange={(v) => setField("van_de_dau_vao", v)}
                disabled={!form.nhom_van_de}
              />
            </Field>
            <div className="sm:col-span-3">
              <Field label={t("detail.customerInfo.thongTinBanDau")}>
                <Textarea rows={2} value={form.thong_tin_ban_dau} onChange={(e) => setField("thong_tin_ban_dau", e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label={t("detail.customerInfo.ghiChuNguoiTao")}>
                <Textarea rows={2} value={form.ghi_chu_nguoi_tao} onChange={(e) => setField("ghi_chu_nguoi_tao", e.target.value)} />
              </Field>
            </div>
          </div>
        </fieldset>

        <div className="flex justify-end">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? t("detail.customerInfo.dangLuu") : t("detail.customerInfo.luuButton")}
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
  const { t } = useTranslation();
  const { showToast } = useToast();
  const editable = forceEditable ?? (user.vai_tro === "CSKH" || user.vai_tro === "Admin");
  const canResync =
    forceEditable !== true && !!user.vai_tro && user.vai_tro !== "Viewer" &&
    // Ca da ket thuc van cho dong bo lai neu dang bi co "ID CRM sai" (CRM import case cham hon luc dong ca).
    (kn.trang_thai !== "Da ket thuc" || kn.crm_tra_cuu === "SAI_ID") &&
    !(isKtvLikeRole(user.vai_tro) && kn.nguoi_tao !== user.email);
  const [crmId, setCrmId] = useState(kn.id_crm_karofi ?? "");
  const [showCaseDetail, setShowCaseDetail] = useState(false);

  useEffect(() => setCrmId(kn.id_crm_karofi ?? ""), [kn.id_crm_karofi]);

  const saveId = useMutation({
    mutationFn: () => api.patch<{ khieuNai: KhieuNai; crm_sync_warning?: string }>(`/khieu-nai/${kn.id}`, { id_crm_karofi: crmId === "" ? null : crmId }),
    onSuccess: (data) => {
      if (data.crm_sync_warning) {
        showToast(getCrmWarningMessages(t)[data.crm_sync_warning] ?? data.crm_sync_warning, "error");
      } else {
        showToast(t("detail.crm.toastSavedId"), "success");
      }
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? t("detail.crm.toastErrorCode", { code: err.code }) : t("detail.crm.toastSaveFailed"), "error"),
  });

  const resync = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/dong-bo-crm`),
    onSuccess: () => {
      showToast(t("detail.crm.toastResyncSuccess"), "success");
      onSaved();
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : "ERROR";
      showToast(getCrmWarningMessages(t)[code] ?? t("detail.crm.toastResyncFailed", { code }), "error");
      if (code === "DVBH_NOT_FOUND") onSaved(); // server da danh dau "ID CRM sai" -> tai lai de hien canh bao
    },
  });

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-end gap-2">
        <div className="w-full lg:w-36">
          <Field label={t("detail.crm.idCrmLabel")}>
            {editable ? (
              <div className="flex flex-col gap-0.5">
                <Input value={crmId} onChange={(e) => setCrmId(chuanHoaIdCrm(e.target.value))} placeholder={t("detail.crm.placeholder")} autoCapitalize="characters" />
                {kn.id_crm_karofi && (
                  <button
                    type="button"
                    onClick={() => setShowCaseDetail(true)}
                    className="self-start text-[11px] font-semibold text-link underline hover:text-sky-800"
                  >
                    {t("detail.crm.xemChiTiet")}
                  </button>
                )}
              </div>
            ) : kn.id_crm_karofi ? (
              <button
                type="button"
                onClick={() => setShowCaseDetail(true)}
                className="text-sm font-semibold text-link underline hover:text-sky-800"
              >
                {kn.id_crm_karofi}
              </button>
            ) : (
              <p className="text-sm text-ink">—</p>
            )}
            {kn.id_crm_karofi && laIdCrmSai(kn) && (
              <p className="mt-0.5 text-xs font-semibold text-red-600">{t("detail.crm.idSai")}</p>
            )}
            {kn.id_crm_karofi && laChoCrmMoi(kn) && (
              <p className="mt-0.5 text-xs text-amber-700">
                {t("detail.crm.choDongBo", { gio: CRM_SAI_SAU_GIO })}
              </p>
            )}
          </Field>
        </div>
        {showCaseDetail && kn.id_crm_karofi && (
          <CrmCaseDetailModal idCrm={kn.id_crm_karofi} onClose={() => setShowCaseDetail(false)} />
        )}
        {editable && (
          <Btn variant="secondary" size="sm" disabled={saveId.isPending || crmId === (kn.id_crm_karofi ?? "")} onClick={() => saveId.mutate()}>
            {saveId.isPending ? t("detail.crm.dangLuu") : t("detail.crm.luuId")}
          </Btn>
        )}
        {canResync && (
          <Btn
            variant="secondary"
            size="sm"
            disabled={!kn.id_crm_karofi || resync.isPending}
            title={kn.trang_thai === "Da ket thuc" ? t("detail.crm.daKetThucTitle") : undefined}
            onClick={() => resync.mutate()}
          >
            {resync.isPending ? t("detail.crm.dangDongBo") : t("detail.crm.dongBoLai")}
          </Btn>
        )}
        <span
          className={`ml-auto inline-block rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            kn.ngay_ktv_hoan_thanh ? "bg-green-50 text-green-700 ring-green-300" : "bg-amber-50 text-amber-700 ring-amber-300"
          }`}
        >
          {kn.ngay_ktv_hoan_thanh ? t("detail.crm.daHoanThanh", { date: kn.ngay_ktv_hoan_thanh }) : t("detail.crm.chuaHoanThanh")}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
        <ReadField label={t("detail.crm.ngayTiepNhanCrm")} value={kn.ngay_tiep_nhan_crm} />
        <ReadField label={t("detail.crm.ketQuaCrm")} value={kn.ket_qua_crm} />
        <ReadField label={t("detail.crm.thongTinXuLyCrm")} value={kn.thong_tin_xu_ly_crm} />
      </div>
      <div className="mt-2">
        <p className="mb-1 text-xs font-medium text-ink-soft">{t("detail.crm.giaiTrinhDvbh")}</p>
        <Timeline events={giaiTrinhDvbhEvents(t, kn)} />
      </div>
    </>
  );
}

// Xem nhanh dữ liệu case bên ĐVBH (tương tự app "vi phạm") - bấm ID CRM mở modal, tra cứu SỐNG
// (khong cache local) qua chinh /tra-cuu?id_crm= da co san (backend goi API "case-lookup" cua DVBH,
// endpoint nay THIET KE cho tra cuu real-time tung ban ghi - khong ap rate-limit export hang loat,
// xem partnerApi.ts ben he dvbh) - khong can them bang cache/rate-limit rieng nhu vi-pham-app.
interface CrmCaseDetailPreview {
  khach_hang: string | null; ky_thuat_vien: string | null; seri_san_pham: string | null;
  khu_vuc: string | null; tinh: string | null; quan_huyen: string | null; hang: string | null;
  san_pham_bao_hanh: string | null; tien_do_hoan_thanh: string | null; mo_ta_loi: string | null;
  nhom_san_pham: string | null; nhom_yeu_cau: string | null; loai_yeu_cau: string | null;
  hinh_thuc_bao_hanh: string | null; ngay_mua: string | null;
  thoi_gian_cskh_tiep_nhan: string | null; thoi_gian_hen_xu_ly: string | null; thoi_gian_hoan_thanh: string | null;
  doi_tac: string | null; link_crm: string | null; noi_dung_xu_ly: string | null;
  luu_y_loi_linh_kien: string | null; cach_thuc_xu_ly: string | null;
  nganh: string | null; loai_nganh: string | null; nhom_kh: string | null;
  dt_san_pham: number | null; dt_linh_kien: number | null; dt_dich_vu: number | null;
  ly_do_qua_han: string | null; ngay_import: string | null; ngay_cap_nhat_gan_nhat: string | null;
  dung_han: string | null; xu_ly_24h_bucket: string | null; ly_do_huy: string | null;
  link_hinh_anh: string[] | null;
}
function tienVN(v: number | null | undefined): string | null {
  return v == null ? null : `${v.toLocaleString("vi-VN")} đ`;
}
// An ca nhom neu MOI truong con deu rong - tranh danh sach nhom toan gach ngang "—" gay roi mat.
function hasAny(...vals: (string | number | null | undefined)[]): boolean {
  return vals.some((v) => v != null && v !== "");
}
function CrmDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3 border-t border-line pt-2 first:mt-0 first:border-t-0 first:pt-0">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</p>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 lg:grid-cols-2">{children}</div>
    </div>
  );
}
interface CrmCaseDetailResponse {
  found: boolean;
  preview?: CrmCaseDetailPreview;
  giaiTrinh?: DvbhGiaiTrinhRow[];
  warning?: string;
}

function CrmCaseDetailModal({ idCrm, onClose }: { idCrm: string; onClose: () => void }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["crm-case-detail", idCrm],
    queryFn: () => api.get<CrmCaseDetailResponse>(`/khieu-nai/tra-cuu?id_crm=${encodeURIComponent(idCrm)}`),
  });
  const p = query.data?.preview;
  const giaiTrinhEvents: TimelineEvent[] = (query.data?.giaiTrinh ?? []).map((g, i) => ({
    key: `case-gt-${i}`,
    tone: "teal",
    badge: t("detail.crmModal.gtTonBadge"),
    time: fmtVN.dateTime(g.ngay_giai_trinh),
    sortMs: parseVnNaive(g.ngay_giai_trinh),
    actor: g.nguoi_giai_trinh ?? null,
    summary: g.noi_dung ? `${g.ly_do_cham}: ${g.noi_dung}` : g.ly_do_cham,
  }));

  return (
    <Modal open onClose={onClose} title={t("detail.crmModal.title", { id: idCrm })} width="lg">
      {query.isLoading ? (
        <p className="py-6 text-center text-sm text-ink-soft">{t("detail.crmModal.loading")}</p>
      ) : query.isError ? (
        <p className="py-6 text-center text-sm text-red-600">{t("detail.crmModal.error")}</p>
      ) : !query.data?.found ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          {getCrmWarningMessages(t)[query.data?.warning ?? ""] ?? t("detail.crmModal.notFoundDefault")}
        </p>
      ) : (
        <div className="text-sm">
          {hasAny(p?.khach_hang, p?.ky_thuat_vien, p?.seri_san_pham, p?.khu_vuc, p?.tinh, p?.quan_huyen) && (
            <CrmDetailSection title={t("detail.crmModal.sectionKhachHang")}>
              <ReadField label={t("detail.crmModal.khachHang")} value={p?.khach_hang} />
              <ReadField label={t("detail.crmModal.ktv")} value={p?.ky_thuat_vien} />
              <ReadField label={t("detail.crmModal.seri")} value={p?.seri_san_pham} />
              <ReadField label={t("detail.crmModal.khuVuc")} value={p?.khu_vuc} />
              <ReadField label={t("detail.crmModal.tinh")} value={p?.tinh} />
              <ReadField label={t("detail.crmModal.quanHuyen")} value={p?.quan_huyen} />
            </CrmDetailSection>
          )}
          {hasAny(p?.hang, p?.san_pham_bao_hanh, p?.nhom_san_pham, p?.nhom_yeu_cau, p?.loai_yeu_cau, p?.hinh_thuc_bao_hanh, p?.ngay_mua) && (
            <CrmDetailSection title={t("detail.crmModal.sectionSanPham")}>
              <ReadField label={t("detail.crmModal.hang")} value={p?.hang} />
              <ReadField label={t("detail.crmModal.sanPhamBaoHanh")} value={p?.san_pham_bao_hanh} />
              <ReadField label={t("detail.crmModal.nhomSanPham")} value={p?.nhom_san_pham} />
              <ReadField label={t("detail.crmModal.nhomYeuCau")} value={p?.nhom_yeu_cau} />
              <ReadField label={t("detail.crmModal.loaiYeuCau")} value={p?.loai_yeu_cau} />
              <ReadField label={t("detail.crmModal.hinhThucBaoHanh")} value={p?.hinh_thuc_bao_hanh} />
              <ReadField label={t("detail.crmModal.ngayMua")} value={p?.ngay_mua ? fmtVN.date(p.ngay_mua) : null} />
            </CrmDetailSection>
          )}
          {hasAny(p?.tien_do_hoan_thanh, p?.thoi_gian_cskh_tiep_nhan, p?.thoi_gian_hen_xu_ly, p?.thoi_gian_hoan_thanh, p?.dung_han, p?.xu_ly_24h_bucket, p?.ly_do_qua_han, p?.ly_do_huy, p?.ngay_import, p?.ngay_cap_nhat_gan_nhat) && (
            <CrmDetailSection title={t("detail.crmModal.sectionTienDo")}>
              <ReadField label={t("detail.crmModal.tienDoHoanThanh")} value={p?.tien_do_hoan_thanh} />
              <ReadField label={t("detail.crmModal.cskhTiepNhan")} value={p?.thoi_gian_cskh_tiep_nhan ? fmtVN.dateTime(p.thoi_gian_cskh_tiep_nhan) : null} />
              <ReadField label={t("detail.crmModal.henXuLy")} value={p?.thoi_gian_hen_xu_ly ? fmtVN.dateTime(p.thoi_gian_hen_xu_ly) : null} />
              <ReadField label={t("detail.crmModal.hoanThanh")} value={p?.thoi_gian_hoan_thanh ? fmtVN.dateTime(p.thoi_gian_hoan_thanh) : null} />
              <ReadField label={t("detail.crmModal.dungTreHan")} value={p?.dung_han} />
              <ReadField label={t("detail.crmModal.nhomXuLy24h")} value={p?.xu_ly_24h_bucket} />
              <ReadField label={t("detail.crmModal.lyDoQuaHan")} value={p?.ly_do_qua_han} />
              <ReadField label={t("detail.crmModal.lyDoHuy")} value={p?.ly_do_huy} />
              <ReadField label={t("detail.crmModal.ngayImport")} value={p?.ngay_import ? fmtVN.dateTime(p.ngay_import) : null} />
              <ReadField label={t("detail.crmModal.capNhatGanNhat")} value={p?.ngay_cap_nhat_gan_nhat ? fmtVN.dateTime(p.ngay_cap_nhat_gan_nhat) : null} />
            </CrmDetailSection>
          )}
          {hasAny(p?.doi_tac, p?.nganh, p?.loai_nganh, p?.nhom_kh, p?.cach_thuc_xu_ly) && (
            <CrmDetailSection title={t("detail.crmModal.sectionNghiepVu")}>
              <ReadField label={t("detail.crmModal.doiTac")} value={p?.doi_tac} />
              <ReadField label={t("detail.crmModal.nganhHang")} value={p?.nganh} />
              <ReadField label={t("detail.crmModal.loaiNganhHang")} value={p?.loai_nganh} />
              <ReadField label={t("detail.crmModal.nhomKh")} value={p?.nhom_kh} />
              <ReadField label={t("detail.crmModal.cachThucXuLy")} value={p?.cach_thuc_xu_ly} />
            </CrmDetailSection>
          )}
          {hasAny(p?.dt_san_pham, p?.dt_linh_kien, p?.dt_dich_vu) && (
            <CrmDetailSection title={t("detail.crmModal.sectionDinhGia")}>
              <ReadField label={t("detail.crmModal.dinhGiaSanPham")} value={tienVN(p?.dt_san_pham)} />
              <ReadField label={t("detail.crmModal.dinhGiaLinhKien")} value={tienVN(p?.dt_linh_kien)} />
              <ReadField label={t("detail.crmModal.dinhGiaDichVu")} value={tienVN(p?.dt_dich_vu)} />
            </CrmDetailSection>
          )}
          {p?.mo_ta_loi && (
            <p className="mt-3 whitespace-pre-wrap border-t border-line pt-2"><b>{t("detail.crmModal.moTaLoiBold")}</b>{p.mo_ta_loi}</p>
          )}
          {p?.noi_dung_xu_ly && (
            <p className="mt-2 whitespace-pre-wrap border-t border-line pt-2"><b>{t("detail.crmModal.noiDungXuLyBold")}</b>{p.noi_dung_xu_ly}</p>
          )}
          {p?.luu_y_loi_linh_kien && (
            <p className="mt-2 whitespace-pre-wrap border-t border-line pt-2"><b>{t("detail.crmModal.luuYLoiLinhKienBold")}</b>{p.luu_y_loi_linh_kien}</p>
          )}
          {p?.link_hinh_anh && p.link_hinh_anh.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="mb-1 text-xs font-semibold text-ink-soft">{t("detail.crmModal.hinhAnhCount", { n: p.link_hinh_anh.length })}</p>
              <div className="flex flex-wrap gap-2">
                {p.link_hinh_anh.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={t("detail.crmModal.hinhAnhAlt", { n: i + 1 })} className="h-20 w-20 rounded border border-line object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {p?.link_crm && (
            <p className="mt-2 border-t border-line pt-2">
              <a href={p.link_crm} target="_blank" rel="noreferrer" className="font-semibold text-link underline">
                {t("detail.crmModal.xemTrenCrm")}
              </a>
            </p>
          )}
          {giaiTrinhEvents.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <p className="mb-1 text-xs font-semibold text-ink-soft">{t("detail.crmModal.logGiaiTrinhCount", { n: giaiTrinhEvents.length })}</p>
              <Timeline events={giaiTrinhEvents} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------- Đánh giá lỗi (TN CSKH) ----------

function TnCskhSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { t } = useTranslation();
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
    mutationFn: (payload: typeof form) => api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, payload),
    onSuccess: () => {
      showToast(t("detail.tnCskh.toastSuccess"), "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? t("detail.tnCskh.toastErrorCode", { code: err.code }) : t("detail.tnCskh.toastErrorDefault"), "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  // "Xac nhan khong loi" 1 cham: dat ca 5 muc = Khong va luu luon. Hoi lai neu dang co muc "Co" (se bi ghi de).
  const xacNhanKhongLoi = () => {
    const tatCaKhong: typeof form = {
      loi_nha_san_xuat: "Khong", loi_lap_dat: "Khong", loi_thai_do_ktv: "Khong",
      loi_quy_trinh_nskx: "Khong", ket_luan_khieu_nai: "Khong",
    };
    if (Object.values(form).includes("Co") && !window.confirm(t("detail.tnCskh.khongLoiConfirm"))) return;
    setForm(tatCaKhong);
    mutation.mutate(tatCaKhong);
  };

  if (!editable) {
    return (
      <>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
          <ReadField label={t("detail.tnCskh.loiNsx")} value={translateDanhGia(kn.loi_nha_san_xuat)} />
          <ReadField label={t("detail.tnCskh.loiLapDat")} value={translateDanhGia(kn.loi_lap_dat)} />
          <ReadField label={t("detail.tnCskh.loiThaiDoKtv")} value={translateDanhGia(kn.loi_thai_do_ktv)} />
          <ReadField label={t("detail.tnCskh.loiQuyTrinhNskx")} value={translateDanhGia(kn.loi_quy_trinh_nskx)} />
          <ReadField label={t("detail.tnCskh.ketLuanPhanAnh")} value={translateDanhGia(kn.ket_luan_khieu_nai)} />
        </div>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <DanhGiaRow label={t("detail.tnCskh.loiNsx")} value={form.loi_nha_san_xuat} onChange={(v) => setField("loi_nha_san_xuat", v)} />
        <DanhGiaRow label={t("detail.tnCskh.loiLapDat")} value={form.loi_lap_dat} onChange={(v) => setField("loi_lap_dat", v)} />
        <DanhGiaRow label={t("detail.tnCskh.loiThaiDoKtv")} value={form.loi_thai_do_ktv} onChange={(v) => setField("loi_thai_do_ktv", v)} />
        <DanhGiaRow label={t("detail.tnCskh.loiQuyTrinhNskx")} value={form.loi_quy_trinh_nskx} onChange={(v) => setField("loi_quy_trinh_nskx", v)} />
        <DanhGiaRow label={t("detail.tnCskh.ketLuanPhanAnh")} value={form.ket_luan_khieu_nai} onChange={(v) => setField("ket_luan_khieu_nai", v)} />
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Btn
            type="button"
            disabled={mutation.isPending}
            onClick={xacNhanKhongLoi}
            title={t("detail.tnCskh.khongLoiTitle")}
            className="!border-green-300 !text-green-700 hover:!bg-green-50"
          >
            ✓ {t("detail.tnCskh.khongLoiButton")}
          </Btn>
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? t("detail.tnCskh.dangLuu") : t("detail.tnCskh.luuButton")}
          </Btn>
        </div>
      </form>
    </>
  );
}

// Chi 3 lua chon co dinh -> nut bam thay vi dropdown, xep tung dong tu tren xuong de bam nhanh.
function DanhGiaRow({ label, value, onChange }: { label: string; value: DanhGia3; onChange: (v: DanhGia3) => void }) {
  const { t } = useTranslation();
  const options = getDanhGiaOptions(t);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
      <span className="min-w-[150px] flex-1 text-sm font-medium text-ink">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => {
          const active = value === o.value;
          const cls =
            o.value === "Co"
              ? active ? "bg-red-600 text-white ring-red-600" : "bg-white text-red-700 ring-red-300 hover:bg-red-50"
              : o.value === "Khong"
                ? active ? "bg-green-600 text-white ring-green-600" : "bg-white text-green-700 ring-green-300 hover:bg-green-50"
                : active ? "bg-gray-500 text-white ring-gray-500" : "bg-white text-ink-soft ring-line hover:bg-surface-2";
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value as DanhGia3)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${cls}`}
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
  const { t } = useTranslation();
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
      showToast(t("detail.ql.toastSuccess"), "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? t("detail.ql.toastErrorCode", { code: err.code }) : t("detail.ql.toastErrorDefault"), "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
          <ReadField label={t("detail.ql.danhGiaQl")} value={kn.danh_gia_ql} />
          <ReadField label={t("detail.ql.gioXuLyHeThong")} value={kn.ql_gio_xu_ly_he_thong ?? gioXuLy} />
          <ReadField label={t("detail.ql.ngayHen")} value={kn.ql_chon_ngay_hen} />
          <ReadField label={t("detail.ql.lyDo")} value={kn.ql_chon_ly_do} />
          <ReadField label={t("detail.ql.nguoiDanhGia")} value={kn.ql_nguoi_danh_gia} />
          <ReadField label={t("detail.ql.ngayDanhGia")} value={fmtVN.dateTime(kn.ngay_ql_danh_gia)} />
        </div>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
        <Field label={t("detail.ql.danhGiaQl")}>
          <Select
            options={(danhGiaQlOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder={t("detail.ql.choosePlaceholder")}
            value={form.danh_gia_ql}
            onChange={(e) => setField("danh_gia_ql", e.target.value)}
          />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-soft">{t("detail.ql.gioXuLyHeThong")}</p>
          <p className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink">{gioXuLy}</p>
          <p className="mt-1 text-xs text-ink-soft">{t("detail.ql.gioXuLyHint")}</p>
        </div>
        <Field label={t("detail.ql.ngayHen")}>
          <Input type="date" value={form.ql_chon_ngay_hen} onChange={(e) => setField("ql_chon_ngay_hen", e.target.value)} />
        </Field>
        <Field label={t("detail.ql.lyDo")} hint={t("detail.ql.lyDoHint")}>
          <Input value={form.ql_chon_ly_do} onChange={(e) => setField("ql_chon_ly_do", e.target.value)} />
        </Field>
        <ReadField label={t("detail.ql.nguoiDanhGia")} value={kn.ql_nguoi_danh_gia} />
        <ReadField label={t("detail.ql.ngayDanhGia")} value={kn.ngay_ql_danh_gia} />
        <div className="col-span-2 flex items-end justify-end sm:col-span-3">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? t("detail.ql.dangLuu") : t("detail.ql.luuButton")}
          </Btn>
        </div>
      </form>
    </>
  );
}

// ---------- Nhánh đổi máy ----------

function DoiMaySection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { t } = useTranslation();
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
      showToast(t("detail.doiMay.toastSuccess"), "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? t("detail.doiMay.toastErrorCode", { code: err.code }) : t("detail.doiMay.toastErrorDefault"), "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint lg:text-[11px]">{t("detail.doiMay.headingDoiMay")}</p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3 lg:gap-y-1.5">
          <ReadField label={t("detail.doiMay.idLadaPhatSinh")} value={kn.id_lada_phat_sinh} />
          {kn.id_lada_phat_sinh && (
            <ReadField
              label={t("detail.doiMay.ladaPsChot")}
              value={kn.lada_ps_ngay_chot
                ? `${fmtVN.dateTime(kn.lada_ps_ngay_chot)}${kn.lada_ps_trang_thai ? ` · ${kn.lada_ps_trang_thai}` : ""}`
                : t("detail.doiMay.ladaPsChuaChot")}
            />
          )}
          <ReadField label={t("detail.doiMay.maDuyetDoiLinhKien")} value={kn.ma_duyet_doi_linh_kien} />
          <ReadField label={t("detail.doiMay.ngayGhiNhanDoiMay")} value={kn.ngay_ghi_nhan_doi_may} />
          <ReadField label={t("detail.doiMay.ngayDongDoiMay")} value={kn.ngay_dong_doi_may} />
          <ReadField label={t("detail.doiMay.ketQuaDoiMay")} value={ketQuaDoiMayLabel(t, kn.ket_qua_doi_may)} />
          <ReadField label={t("detail.doiMay.nguoiXacNhanDoiMay")} value={kn.nguoi_xac_nhan_doi_may} />
        </div>
        <div className="mt-2">
          <ReadField label={t("detail.doiMay.giaiTrinhChamDoiMay")} value={kn.giai_trinh_cham_doi_may} />
        </div>

        <p className="mb-1.5 mt-3 border-t border-line pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint lg:text-[11px]">{t("detail.doiMay.headingKhac")}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <ReadField label={t("detail.doiMay.boPhanBanGiao")} value={kn.bo_phan_ban_giao} />
          <ReadField label={t("detail.doiMay.camCoReadLabel")} value={camCoLabel(t, kn.cam_co)} />
        </div>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset className="rounded-lg border border-line bg-white p-2.5">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint lg:text-[11px]">{t("detail.doiMay.headingDoiMay")}</legend>
          <div className="grid grid-cols-1 gap-x-3 gap-y-2 lg:grid-cols-3">
            <Field label={t("detail.doiMay.idLadaPhatSinh")}>
              <Input value={form.id_lada_phat_sinh} onChange={(e) => setField("id_lada_phat_sinh", e.target.value)} />
            </Field>
            <Field label={t("detail.doiMay.maDuyetDoiLinhKien")}>
              <Input value={form.ma_duyet_doi_linh_kien} onChange={(e) => setField("ma_duyet_doi_linh_kien", e.target.value)} />
            </Field>
            <Field label={t("detail.doiMay.ketQuaDoiMay")}>
              <Select
                options={getKetQuaDoiMayOptions(t)}
                placeholder={t("detail.doiMay.choosePlaceholder")}
                value={form.ket_qua_doi_may}
                onChange={(e) => setField("ket_qua_doi_may", e.target.value)}
              />
            </Field>
            <Field label={t("detail.doiMay.ngayGhiNhanDoiMay")}>
              <Input type="date" value={form.ngay_ghi_nhan_doi_may} onChange={(e) => setField("ngay_ghi_nhan_doi_may", e.target.value)} />
            </Field>
            <Field label={t("detail.doiMay.ngayDongDoiMay")}>
              <Input type="date" value={form.ngay_dong_doi_may} onChange={(e) => setField("ngay_dong_doi_may", e.target.value)} />
            </Field>
            <Field label={t("detail.doiMay.nguoiXacNhanDoiMay")}>
              <Input value={form.nguoi_xac_nhan_doi_may} onChange={(e) => setField("nguoi_xac_nhan_doi_may", e.target.value)} />
            </Field>
            <div className="lg:col-span-3">
              <Field label={t("detail.doiMay.giaiTrinhChamDoiMay")} hint={t("detail.doiMay.giaiTrinhChamHint")}>
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
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint lg:text-[11px]">{t("detail.doiMay.headingKhac")}</legend>
          <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
            <Field label={t("detail.doiMay.boPhanBanGiao")}>
              <Combobox
                options={(boPhanBanGiaoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.bo_phan_ban_giao}
                onChange={(v) => setField("bo_phan_ban_giao", v)}
              />
            </Field>
            <div className="text-xs text-ink-soft">
              <span className="mb-1 block font-medium">{t("detail.doiMay.camCoEditLabel")}</span>
              <span>{t("detail.doiMay.camCoEditNote")}</span>
            </div>
          </div>
        </fieldset>

        <div className="flex justify-end">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? t("detail.doiMay.dangLuu") : t("detail.doiMay.luuButton")}
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

function getLsLabel(t: TFn): Record<string, string> {
  return {
    tao_moi: t("detail.tienTrinh.lsLabel.taoMoi"),
    cap_nhat: t("detail.tienTrinh.lsLabel.capNhat"),
    chuyen_trang_thai: t("detail.tienTrinh.lsLabel.chuyenTrangThai"),
    danh_gia_loi: t("detail.tienTrinh.lsLabel.danhGiaLoi"),
    danh_gia_ql: t("detail.tienTrinh.lsLabel.danhGiaQl"),
    huy: t("detail.tienTrinh.lsLabel.huy"),
    mo_lai: t("detail.tienTrinh.lsLabel.moLai"),
    phu_trach: t("detail.tienTrinh.lsLabel.phuTrach"),
    tiep_nhan: t("detail.tienTrinh.lsLabel.tiepNhan"),
  };
}

// Nhãn field ngắn gọn cho log "cập nhật 1 trường" (item: badge cụ thể thay vì chung chung).
function getLichSuFieldLabel(t: TFn): Record<string, string> {
  return {
    id_crm_karofi: t("detail.tienTrinh.fieldLabel.idCrmKarofi"),
    id_lada: t("detail.tienTrinh.fieldLabel.idLada"),
    id_truy_van: t("detail.tienTrinh.fieldLabel.idTruyXuat"),
    nguon: t("detail.tienTrinh.fieldLabel.nguon"),
    ten_khach: t("detail.tienTrinh.fieldLabel.tenKhach"),
    sdt_khach: t("detail.tienTrinh.fieldLabel.sdtKhach"),
    muc_do: t("detail.tienTrinh.fieldLabel.mucDo"),
    nhom_van_de: t("detail.tienTrinh.fieldLabel.nhomVanDe"),
    van_de_dau_vao: t("detail.tienTrinh.fieldLabel.vanDeDauVao"),
    cam_co: t("detail.tienTrinh.fieldLabel.camCo"),
    trang_thai: t("detail.tienTrinh.fieldLabel.trangThai"),
    nguoi_phu_trach: t("detail.tienTrinh.fieldLabel.nguoiPhuTrach"),
    loi_nha_san_xuat: t("detail.tienTrinh.fieldLabel.loiNhaSanXuat"),
    loi_lap_dat: t("detail.tienTrinh.fieldLabel.loiLapDat"),
    loi_thai_do_ktv: t("detail.tienTrinh.fieldLabel.loiThaiDoKtv"),
    loi_quy_trinh_nskx: t("detail.tienTrinh.fieldLabel.loiQuyTrinhNskx"),
  };
}

type LsTone = "blue" | "violet" | "teal" | "amber" | "green" | "red" | "gray";

// Học theo phong cách timeline "GT tồn" — mỗi hành động hệ thống có 1 badge riêng, cụ thể
// (vd "Cập nhật ID CRM" thay vì chung chung "Cập nhật thông tin") thay vì show mỗi
// LS_LABEL[hanh_dong] như trước.
function lichSuBadge(t: TFn, l: LichSu): { badge: string; tone: LsTone } {
  switch (l.hanh_dong) {
    case "tao_moi":
      return { badge: t("detail.tienTrinh.badge.taoPhanAnh"), tone: "green" };
    case "cap_nhat": {
      const fields = (l.truong ?? "").split(",").filter(Boolean);
      if (fields.length === 1) {
        const label = getLichSuFieldLabel(t)[fields[0]] ?? fields[0];
        return { badge: t("detail.tienTrinh.badge.capNhatField", { label }), tone: fields[0] === "id_crm_karofi" ? "teal" : fields[0] === "id_lada" ? "violet" : "blue" };
      }
      return { badge: t("detail.tienTrinh.badge.capNhatThongTin"), tone: "blue" };
    }
    case "danh_gia_loi":
      return { badge: t("detail.tienTrinh.badge.chotLoi"), tone: "amber" };
    case "danh_gia_ql":
      return { badge: t("detail.tienTrinh.badge.danhGiaQl"), tone: "amber" };
    case "chuyen_trang_thai":
      return l.gia_tri_moi === "Da ket thuc"
        ? { badge: t("detail.tienTrinh.badge.chotKetThuc"), tone: "green" }
        : { badge: t("detail.tienTrinh.badge.dongCa"), tone: "blue" };
    case "mo_lai":
      return { badge: t("detail.tienTrinh.badge.moLaiCa"), tone: "amber" };
    case "huy":
      return { badge: t("detail.tienTrinh.badge.huyPhanAnh"), tone: "red" };
    case "phu_trach":
      return { badge: t("detail.tienTrinh.badge.doiNguoiPhuTrach"), tone: "gray" };
    case "tiep_nhan":
      return { badge: t("detail.tienTrinh.badge.tiepNhan"), tone: "green" };
    default:
      return { badge: getLsLabel(t)[l.hanh_dong] ?? l.hanh_dong, tone: "gray" };
  }
}

function lichSuSummary(t: TFn, l: LichSu): string {
  if (l.hanh_dong === "danh_gia_loi") {
    const label = getLichSuFieldLabel(t)[l.truong ?? ""] ?? l.truong ?? "";
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
  const { t } = useTranslation();
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
      showToast(t("detail.tienTrinh.toastSuccess"), "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? t("detail.tienTrinh.toastErrorCode", { code: err.code }) : t("detail.tienTrinh.toastErrorDefault"), "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (overdue) {
      if (!noiDung.trim() || !lyDo.trim()) {
        showToast(t("detail.tienTrinh.validationQuaHan"), "error");
        return;
      }
    } else if (!noiDung.trim() && !lyDo.trim()) {
      return;
    }
    mutation.mutate();
  };

  const events: TimelineEvent[] = [
    ...items.map((item) => ({
      key: `t-${item.id}`,
      tone: "violet" as LsTone,
      badge: t("detail.tienTrinh.ghiChuTienTrinhBadge"),
      time: fmtVN.dateTime(item.ngay_tao),
      sortMs: parseVnNaive(item.ngay_tao),
      actor: nameOf(item.nguoi_tao),
      summary: [item.noi_dung_ghi_chep, item.ly_do_xu_ly_cham ? t("detail.tienTrinh.lyDoChamSummary", { reason: item.ly_do_xu_ly_cham }) : null].filter(Boolean).join("\n"),
    })),
    ...lichSu.map((l) => {
      const { badge, tone } = lichSuBadge(t, l);
      return {
        key: `l-${l.id}`,
        tone,
        badge,
        time: fmtVN.dateTime(l.thoi_diem),
        sortMs: parseVnNaive(l.thoi_diem),
        actor: nameOf(l.nguoi),
        summary: lichSuSummary(t, l),
      };
    }),
  ].sort((a, b) => b.sortMs - a.sortMs);

  const addForm = (
    <form onSubmit={submit} className="mb-4 flex flex-col gap-2">
      <Field label={t("detail.tienTrinh.noiDungGhiChep")}>
        <Textarea rows={addOnly ? 4 : 2} value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder={t("detail.tienTrinh.placeholderGhiChu")} autoFocus={addOnly} />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t("detail.tienTrinh.lyDoCham")}>
            <Combobox
              options={(lyDoChamOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={lyDo}
              onChange={setLyDo}
            />
          </Field>
        </div>
        <Btn type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? t("detail.tienTrinh.dangLuu") : t("detail.tienTrinh.themGhiChu")}
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
  const { t } = useTranslation();
  const lyDoHuyOptions = getLyDoHuyOptions(t);
  const [confirmChot, setConfirmChot] = useState(false);
  const [huyOpen, setHuyOpen] = useState(false);
  const [lyDoHuy, setLyDoHuy] = useState(lyDoHuyOptions[0]);
  const [ghiChuHuy, setGhiChuHuy] = useState("");

  const canDongCa = (user.vai_tro === "TN CSKH" || user.vai_tro === "Admin") && kn.trang_thai === "Dang xu ly";
  const dongCaReady = dongCaChecklist(t, kn).every((c) => c.ok);

  // QL/Admin duoc chot thang tu "Dang xu ly" - bo qua buoc "Dong ca" cua TN CSKH (yeu cau ra soat
  // 2026-09) - nhung van phai du 4 loi + ket luan (dieu kien von do "Dong ca" dam nhan).
  const chotTrucTiep = kn.trang_thai === "Dang xu ly";
  const canChot = (user.vai_tro === "QL" || user.vai_tro === "Admin") && (kn.trang_thai === "Cho chot ket thuc" || chotTrucTiep);
  const chotReady = !chotTrucTiep || dongCaChecklist(t, kn).every((c) => c.ok);
  const canHuy =
    (user.vai_tro === "CSKH" || user.vai_tro === "TN CSKH" || user.vai_tro === "QL" || user.vai_tro === "Admin") &&
    kn.trang_thai !== "Da ket thuc" && kn.trang_thai !== "Huy";

  const dongCa = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/dong-ca`),
    onSuccess: onDone,
    onError: (err) => onError(err instanceof ApiError ? mapDongCaError(t, err.code) : t("detail.action.dongCaFailedDefault")),
  });
  const chot = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/chot`),
    onSuccess: () => { setConfirmChot(false); onDone(); },
    onError: (err) => {
      setConfirmChot(false);
      onError(
        err instanceof ApiError
          ? err.code === "CAN_DANH_GIA_QL"
            ? t("detail.action.errorCanDanhGiaQl")
            : err.code === "CAN_DANH_GIA_DAY_DU"
              ? t("detail.action.errorCanDanhGiaDayDu")
              : err.code === "QUA_HAN_GIAI_TRINH"
                ? t("detail.action.errorQuaHanGiaiTrinhChot")
                : t("detail.action.chotFailedCode", { code: err.code })
          : t("detail.action.chotFailedDefault"),
      );
    },
  });
  const huy = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/huy`, { ly_do_huy: lyDoHuy, ghi_chu: ghiChuHuy.trim() || undefined }),
    onSuccess: () => { setHuyOpen(false); onDone(); },
    onError: (err) => onError(err instanceof ApiError ? t("detail.action.huyFailedCode", { code: err.code }) : t("detail.action.huyFailedDefault")),
  });

  if (!canDongCa && !canChot && !canHuy) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canDongCa && (
        <Btn
          variant="primary"
          size="sm"
          disabled={!dongCaReady || dongCa.isPending}
          title={!dongCaReady ? t("detail.action.dongCaTitle") : undefined}
          onClick={() => dongCa.mutate()}
        >
          {dongCa.isPending ? t("detail.action.dangDongCa") : t("detail.action.dongCa")}
        </Btn>
      )}
      {canChot && (
        <Btn
          variant="primary"
          size="sm"
          disabled={chot.isPending || !chotReady}
          title={!chotReady ? t("detail.action.chotTitle") : undefined}
          onClick={() => setConfirmChot(true)}
        >
          {t("detail.action.chot")}
        </Btn>
      )}
      {canHuy && (
        <Btn variant="danger" size="sm" disabled={huy.isPending} onClick={() => setHuyOpen(true)}>
          {t("detail.action.huyPhanAnh")}
        </Btn>
      )}

      {confirmChot && (
        <ConfirmBox
          title={t("detail.action.xacNhanChotTitle")}
          body={
            <>
              <p>{t("detail.action.maDon")}<span className="font-mono">{kn.id}</span></p>
              <p>{t("detail.action.ketLuanPhanAnhLabel")}<b>{translateDanhGia(kn.ket_luan_khieu_nai)}</b></p>
              <p>{t("detail.action.danhGiaQlLabel")}<b>{kn.danh_gia_ql || t("detail.action.danhGiaQlChuaNhap")}</b></p>
              {chotTrucTiep && (
                <p className="mt-1 text-amber-700">{t("detail.action.chotThangNote")}</p>
              )}
              <p className="mt-1 text-ink-soft">{t("detail.action.sauKhiChotNote")}</p>
            </>
          }
          confirmLabel={chot.isPending ? t("detail.action.dangChot") : t("detail.action.chot")}
          confirmDisabled={chot.isPending || !kn.danh_gia_ql || !chotReady}
          onConfirm={() => chot.mutate()}
          onCancel={() => setConfirmChot(false)}
        />
      )}

      {huyOpen && (
        <ConfirmBox
          title={t("detail.action.huyTitle")}
          body={
            <div className="flex flex-col gap-2">
              <p>{t("detail.action.maDon")}<span className="font-mono">{kn.id}</span></p>
              <label className="text-xs font-medium text-ink-soft">{t("detail.action.lyDoHuyLabel")}</label>
              <Select
                options={lyDoHuyOptions.map((v) => ({ value: v, label: v }))}
                value={lyDoHuy}
                onChange={(e) => setLyDoHuy(e.target.value)}
              />
              <label className="text-xs font-medium text-ink-soft">{t("detail.action.ghiChuThemLabel")}</label>
              <Textarea rows={2} value={ghiChuHuy} onChange={(e) => setGhiChuHuy(e.target.value)} />
            </div>
          }
          confirmLabel={huy.isPending ? t("detail.action.dangHuy") : t("detail.action.xacNhanHuy")}
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
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
        <div className="space-y-1 text-sm text-ink">{body}</div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={onCancel}>{t("detail.action.confirmBoxNo")}</Btn>
          <Btn variant={danger ? "danger" : "primary"} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function mapDongCaError(t: TFn, code: string): string {
  if (code === "CAN_DANH_GIA_DAY_DU") return t("detail.action.dongCaError.canDanhGiaDayDu");
  if (code === "INVALID_STATE") return t("detail.action.dongCaError.invalidState");
  if (code === "QUA_HAN_GIAI_TRINH") return t("detail.action.dongCaError.quaHanGiaiTrinh");
  return t("detail.action.dongCaError.default", { code });
}
