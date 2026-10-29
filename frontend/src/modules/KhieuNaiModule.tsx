import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api/client";
import type { AppUser, KhieuNai, KhieuNaiStats } from "../api/types";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { fmtVN } from "../lib/formatVN";
import { mucDoTone, MUC_DO_CARD_BG, MUC_DO_CARD_HOVER_BG, vipGlowClass, sortMucDoOptions } from "../lib/severity";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Table, type TableColumn } from "../components/ui/Table";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { KhieuNaiForm, type KhieuNaiFormHandle, type KhieuNaiFormHeaderState, NGUON_LABEL } from "./KhieuNaiForm";
import { KhieuNaiDetail } from "./KhieuNaiDetail";
import { KhieuNaiCard } from "./KhieuNaiCard";
import { FilterSelect } from "../components/ui/FilterSelect";
import { laIdCrmSai } from "../lib/crm";

function getStatusOptions(t: (k: string) => string) {
  return [
    { value: "Cho tiep nhan", label: t("list.statusOption.choTiepNhan") },
    { value: "Dang xu ly", label: t("list.statusOption.dangXuLy") },
    { value: "Cho chot ket thuc", label: t("list.statusOption.choChotKetThuc") },
    { value: "Da ket thuc", label: t("list.statusOption.daKetThuc") },
    { value: "Huy", label: t("list.statusOption.huy") },
  ];
}

function getSortOptions(t: (k: string) => string) {
  return [
    { value: "ngay_tiep_nhan|desc", label: t("list.sortOption.newest") },
    { value: "ngay_tiep_nhan|asc", label: t("list.sortOption.oldest") },
    { value: "ngay_thay_doi|desc", label: t("list.sortOption.updatedRecent") },
    { value: "muc_do|asc", label: t("list.sortOption.severityAsc") },
  ];
}

function getPageSizeOptions(t: (k: string, o?: Record<string, unknown>) => string) {
  return [
    { value: "20", label: t("list.pageSizeOption", { n: 20 }) },
    { value: "50", label: t("list.pageSizeOption", { n: 50 }) },
    { value: "100", label: t("list.pageSizeOption", { n: 100 }) },
  ];
}

const FILTER_KEY = "khieunai_list_filter";

interface ListResponse {
  items: KhieuNai[];
  total: number;
  totalIsApprox?: boolean;
  page: number;
  pageSize: number;
}

const NGUOI_TAO_VAI_TRO_OPTIONS = [
  { value: "NV Sale", label: "NV Sale" },
  { value: "Tổng đài viên", label: "Tổng đài viên" },
];

function getTonToiThieuOptions(t: (k: string, o?: Record<string, unknown>) => string) {
  return [
    { value: "3", label: t("list.tonToiThieuDays", { n: 3 }) },
    { value: "7", label: t("list.tonToiThieuDays", { n: 7 }) },
    { value: "14", label: t("list.tonToiThieuDays", { n: 14 }) },
    { value: "30", label: t("list.tonToiThieuDays", { n: 30 }) },
  ];
}

interface Filters {
  trangThai: string;
  nguon: string; // "" | "Lada" (NSKX) | "CRM" (3T) | "PLP" - cac nut loc nhanh tren toolbar
  loaiKh: string; // "" | "thuong" | "vip" | "vip6h" (VIP xu ly qua 6 gio, ke ca ca da dong)
  mucDo: string;
  nhomVanDe: string;
  nhomYeuCau: string;
  tuNgay: string;
  denNgay: string;
  chuaDongBo: string; // "" | "1" (tat ca ton CRM) | "cho" (cho dong bo) | "sai" (ID CRM sai)
  choTnCskh: boolean;
  quaHanGiaiTrinh: boolean;
  caCuaToi: boolean;
  nguoiTaoVaiTro: string;
  tonToiThieu: string;
  thangDong: string; // "YYYY-MM" - loc theo thang cua ngay_ket_thuc
  tinh: string; // khop ca tinh cu lan tinh moi
  quanHuyen: string; // quan/huyen cu hoac phuong/xa moi thuoc tinh dang chon
  loi: string; // loai loi da chot - xem getLoiOptions
  q: string;
  sort: string; // "field|dir"
  pageSize: string;
}

function getCrmTrangThaiOptions(t: (k: string) => string) {
  return [
    { value: "1", label: t("list.crmOption.all") },
    { value: "cho", label: t("list.crmOption.cho") },
    { value: "sai", label: t("list.crmOption.sai") },
  ];
}

// Loai loi da chot (ket luan khieu nai da danh gia) - khop tham so "loi" cua GET /khieu-nai.
function getLoiOptions(t: (k: string) => string) {
  return [
    { value: "da_chot", label: t("list.errOption.daChot") },
    { value: "co_loi", label: t("list.errOption.coLoi") },
    { value: "khong_loi", label: t("list.errOption.khongLoi") },
    { value: "nsx", label: t("list.errOption.nsx") },
    { value: "lap_dat", label: t("list.errOption.lapDat") },
    { value: "thai_do_ktv", label: t("list.errOption.thaiDoKtv") },
    { value: "quy_trinh_nskx", label: t("list.errOption.quyTrinhNskx") },
  ];
}

function getNguonQuickOptions(t: (k: string) => string) {
  return [
    { value: "", label: t("list.all") },
    { value: "Lada", label: t("congTyPicker.nskx") },
    { value: "CRM", label: t("congTyPicker.t3") },
    { value: "PLP", label: t("congTyPicker.plp") },
  ];
}

function getLoaiKhQuickOptions(t: (k: string) => string) {
  return [
    { value: "", label: t("list.all"), title: undefined },
    { value: "thuong", label: t("list.loaiKh.thuong"), title: undefined },
    { value: "vip", label: t("list.loaiKh.vip"), title: undefined },
    { value: "vip6h", label: t("list.loaiKh.vip6h"), title: t("list.loaiKh.vip6hTitle") },
  ];
}

// Gia tri gia (khong trung voi trang_thai that nao) danh cho nut "Tat ca ton" - map sang query
// param rieng "chua_dong" o backend (trang_thai NOT IN Da ket thuc/Huy) thay vi trang_thai = ?.
const TRANG_THAI_TON = "__ton__";
// Nut chua chon hien ten rut gon (short) cho thanh loc nam gon 1 dong; nut dang chon hien ten day du.
const TRANG_THAI_SHORT_KEY: Record<string, string> = {
  "": "all", [TRANG_THAI_TON]: "ton", "Cho tiep nhan": "choTiepNhan", "Dang xu ly": "dangXuLy",
  "Cho chot ket thuc": "choChot", "Da ket thuc": "daKetThuc", Huy: "huy",
};
function getTrangThaiQuickOptions(t: (k: string) => string) {
  return [
    { value: "", label: t("list.all") },
    { value: TRANG_THAI_TON, label: t("list.allTon") },
    ...getStatusOptions(t),
  ].map((o) => ({ ...o, short: t(`list.statusShort.${TRANG_THAI_SHORT_KEY[o.value]}`) }));
}

const EMPTY_FILTERS: Filters = {
  trangThai: "", nguon: "", loaiKh: "", mucDo: "", nhomVanDe: "", nhomYeuCau: "", tuNgay: "", denNgay: "",
  chuaDongBo: "", choTnCskh: false, quaHanGiaiTrinh: false, caCuaToi: false, nguoiTaoVaiTro: "", tonToiThieu: "", thangDong: "",
  tinh: "", quanHuyen: "", loi: "", q: "", sort: "ngay_tiep_nhan|desc", pageSize: "20",
};

// defaultNguon: cong ty nguoi dung da chon (user.cong_ty) - chi ap dung khi CHUA tung co bo loc
// luu trong may (lan dau mo man nay), khong ghi de bo loc nguoi dung da tu chon truoc do.
function loadFilters(defaultNguon: string): Filters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const saved = { ...EMPTY_FILTERS, ...JSON.parse(raw) };
      // Ban cu luu chuaDongBo dang boolean.
      if (typeof saved.chuaDongBo !== "string") saved.chuaDongBo = saved.chuaDongBo ? "1" : "";
      return saved;
    }
  } catch { /* ignore */ }
  return { ...EMPTY_FILTERS, nguon: defaultNguon };
}

function sanSangDongCa(r: KhieuNai): boolean {
  return (
    r.trang_thai === "Dang xu ly" &&
    r.loi_nha_san_xuat !== "Chua danh gia" &&
    r.loi_lap_dat !== "Chua danh gia" &&
    r.loi_thai_do_ktv !== "Chua danh gia" &&
    r.loi_quy_trinh_nskx !== "Chua danh gia" &&
    (r.ket_luan_khieu_nai ?? "Chua danh gia") !== "Chua danh gia"
  );
}

// Duoc chon de "Dong ca" hang loat - khop dieu kien backend POST /khieu-nai/dong-ca-hang-loat.
function duocDongCaHangLoat(r: KhieuNai): boolean {
  return sanSangDongCa(r) || (r.trang_thai === "Cho chot ket thuc" && !!r.danh_gia_ql?.trim());
}

function getDongCaErr(t: (k: string) => string): Record<string, string> {
  return {
    QUA_HAN_GIAI_TRINH: t("list.dongCaErr.QUA_HAN_GIAI_TRINH"),
    CAN_DANH_GIA_DAY_DU: t("list.dongCaErr.CAN_DANH_GIA_DAY_DU"),
    CAN_DANH_GIA_QL: t("list.dongCaErr.CAN_DANH_GIA_QL"),
    INVALID_STATE: t("list.dongCaErr.INVALID_STATE"),
    NOT_FOUND: t("list.dongCaErr.NOT_FOUND"),
  };
}

function chiBao(r: KhieuNai, t: (k: string) => string): { text: string; tone: "amber" | "green" | "red" | "gray" } | null {
  if (r.trang_thai === "Cho chot ket thuc") return { text: t("list.indicator.readyToClose"), tone: "green" };
  if (r.trang_thai === "Dang xu ly") {
    if (sanSangDongCa(r)) return { text: t("list.indicator.readyToCloseCase"), tone: "green" };
    if (r.id_crm_karofi && !r.ngay_ktv_hoan_thanh) {
      return laIdCrmSai(r) ? { text: t("list.crmIdWrong"), tone: "red" } : { text: t("list.indicator.pendingSyncCrm"), tone: "amber" };
    }
    return { text: t("list.indicator.awaitingReview"), tone: "amber" };
  }
  return null;
}

export function KhieuNaiModule({
  user, initialFilter, openDetailRequest,
}: {
  user: AppUser;
  initialFilter?: { trang_thai?: string; chua_dong_bo?: string; cho_tn_cskh?: boolean; qua_han_giai_trinh?: boolean } | null;
  // Mo thang 1 don tu chuong thong bao (App.tsx) - object moi moi lan bam nen luon kich hoat lai
  // duoc ke ca bam trung 1 thong bao 2 lan lien tiep.
  openDetailRequest?: { id: string } | null;
}) {
  const { t } = useTranslation();
  const STATUS_OPTIONS = getStatusOptions(t);
  const SORT_OPTIONS = getSortOptions(t);
  const PAGE_SIZE_OPTIONS = getPageSizeOptions(t);
  const TON_TOI_THIEU_OPTIONS = getTonToiThieuOptions(t);
  const CRM_TRANG_THAI_OPTIONS = getCrmTrangThaiOptions(t);
  const NGUON_QUICK_OPTIONS = getNguonQuickOptions(t);
  const LOAI_KH_QUICK_OPTIONS = getLoaiKhQuickOptions(t);
  const TRANG_THAI_QUICK_OPTIONS = getTrangThaiQuickOptions(t);
  const DONG_CA_ERR = getDongCaErr(t);
  const [f, setF] = useState<Filters>(() => loadFilters(user.cong_ty ?? ""));
  const [qInput, setQInput] = useState(f.q);
  const [page, setPage] = useState(1);
  // Mac dinh thu gon bo loc (item): chi hien so luong dang loc + nut xoa loc, bam "Bo loc" moi mo
  // rong xem/sua tung dieu kien - danh sach filter da qua nhieu (9 dieu kien) chiem nhieu cho.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const closeDetail = () => setDetailId(null);

  useEffect(() => {
    if (openDetailRequest?.id) setDetailId(openDetailRequest.id);
  }, [openDetailRequest]);

  const createFormRef = useRef<KhieuNaiFormHandle>(null);
  const [createHeader, setCreateHeader] = useState<KhieuNaiFormHeaderState>({
    missing: [], pendingCount: 0, submitting: false, panelClassName: "bg-surface",
  });

  const mucDoOpts = useSettingsOptions("muc_do");
  const nhomVanDeOpts = useSettingsOptions("nhom_van_de");
  const nhomYeuCauOpts = useSettingsOptions("nhom_yeu_cau");
  // Ca luu tinh cu (63 tinh) hoac tinh moi (34 tinh sau sap nhap) -> gop 2 danh muc thanh 1 o loc.
  const tinhOpts = useSettingsOptions("tinh");
  const tinhMoiOpts = useSettingsOptions("tinh_moi");
  const quanHuyenOpts = useSettingsOptions("quan_huyen", f.tinh);
  const phuongXaMoiOpts = useSettingsOptions("phuong_xa_moi", f.tinh);
  const gopTen = (...lists: ({ gia_tri: string }[] | undefined)[]) =>
    [...new Set(lists.flatMap((l) => (l ?? []).map((o) => o.gia_tri)))]
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((v) => ({ value: v, label: v }));
  const TINH_OPTIONS = gopTen(tinhMoiOpts.data, tinhOpts.data);
  const QUAN_HUYEN_OPTIONS = gopTen(quanHuyenOpts.data, phuongXaMoiOpts.data);
  const LOI_OPTIONS = getLoiOptions(t);

  // So ca hien tren cac nut loc nhanh trang thai - dung lai dung /khieu-nai/stats (da toi uu, gioi
  // han theo thang hien tai) ma Trang chu dang dung, khong tao thanh 1 truy van rieng ton kem D1.
  const statsQuery = useQuery({
    queryKey: ["khieu-nai-stats"],
    queryFn: () => api.get<KhieuNaiStats>("/khieu-nai/stats"),
  });
  const stats = statsQuery.data;
  const TRANG_THAI_QUICK_COUNT: Record<string, number | undefined> = stats
    ? {
        "": stats.tong,
        [TRANG_THAI_TON]: stats.tong - stats.da_ket_thuc - stats.huy,
        "Cho tiep nhan": stats.cho_tiep_nhan,
        "Dang xu ly": stats.dang_xu_ly,
        "Cho chot ket thuc": stats.cho_chot_ket_thuc,
        "Da ket thuc": stats.da_ket_thuc,
        Huy: stats.huy,
      }
    : {};

  const canCreate = !!user.vai_tro && user.vai_tro !== "Viewer";
  // Dong ca hang loat (2026-09-23): QL/Admin tich chon ca "San sang dong ca" (hoac "Cho chot" da co
  // Danh gia QL) -> "Dong ca": Danh gia QL = "Da hoan thanh" + chuyen "Da ket thuc" (xem backend).
  const canBulkChot = user.vai_tro === "QL" || user.vai_tro === "Admin";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDongCa, setConfirmDongCa] = useState(false);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const bulkDongCa = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ results: { id: string; ok: boolean; error?: string }[] }>("/khieu-nai/dong-ca-hang-loat", { ids }),
    onSuccess: (data) => {
      const okCount = data.results.filter((r) => r.ok).length;
      const fails = data.results.filter((r) => !r.ok);
      const byErr = new Map<string, number>();
      fails.forEach((r) => byErr.set(r.error ?? "", (byErr.get(r.error ?? "") ?? 0) + 1));
      const detail = [...byErr].map(([code, n]) => t("list.caseCountReason", { n, reason: DONG_CA_ERR[code] ?? code })).join(", ");
      showToast(
        fails.length === 0 ? t("list.toast.closedCount", { count: okCount }) : t("list.toast.closedPartial", { okCount, detail }),
        fails.length === 0 ? "success" : "error",
      );
      setSelectedIds(new Set());
      setConfirmDongCa(false);
      queryClient.invalidateQueries({ queryKey: ["khieu-nai"] });
      queryClient.invalidateQueries({ queryKey: ["khieu-nai-stats"] });
    },
    onError: (e) => {
      setConfirmDongCa(false);
      showToast(e instanceof ApiError ? t("list.toast.bulkCloseFailedCode", { code: e.code }) : t("list.toast.bulkCloseFailed"), "error");
    },
  });

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };

  // KPI ở Trang chủ bấm sang -> áp trạng thái/bộ lọc riêng (hoặc bỏ hết lọc cũ nếu bấm "Tổng phản
  // ánh" - initialFilter khi đó là {} chứ không phải undefined, vẫn phải reset bộ lọc cũ).
  useEffect(() => {
    if (initialFilter) {
      setF((p) => ({
        ...EMPTY_FILTERS,
        sort: p.sort,
        pageSize: p.pageSize,
        trangThai: initialFilter.trang_thai ?? "",
        chuaDongBo: initialFilter.chua_dong_bo ?? "",
        choTnCskh: initialFilter.cho_tn_cskh ?? false,
        quaHanGiaiTrinh: initialFilter.qua_han_giai_trinh ?? false,
      }));
      setPage(1);
    }
  }, [initialFilter]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* ignore */ }
  }, [f]);

  // Doi bo loc/trang -> danh sach hien thi doi hoan toan, bo chon cu khong con nhin thay duoc nua.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [f, page]);

  const [sortField, sortDir] = f.sort.split("|");

  const query = useQuery({
    queryKey: ["khieu-nai", { ...f, page }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (f.trangThai === TRANG_THAI_TON) p.set("chua_dong", "1");
      else if (f.trangThai) p.set("trang_thai", f.trangThai);
      if (f.nguon) p.set("nguon", f.nguon);
      if (f.loaiKh) p.set("loai_kh", f.loaiKh);
      if (f.mucDo) p.set("muc_do", f.mucDo);
      if (f.nhomVanDe) p.set("nhom_van_de", f.nhomVanDe);
      if (f.nhomYeuCau) p.set("nhom_yeu_cau", f.nhomYeuCau);
      if (f.tuNgay) p.set("tu_ngay", f.tuNgay);
      if (f.denNgay) p.set("den_ngay", f.denNgay);
      if (f.chuaDongBo) p.set("chua_dong_bo", f.chuaDongBo);
      if (f.choTnCskh) p.set("cho_tn_cskh", "1");
      if (f.quaHanGiaiTrinh) p.set("qua_han_giai_trinh", "1");
      if (f.caCuaToi) p.set("nguoi_phu_trach", user.email);
      if (f.nguoiTaoVaiTro) p.set("nguoi_tao_vai_tro", f.nguoiTaoVaiTro);
      if (f.tonToiThieu) p.set("ton_toi_thieu_ngay", f.tonToiThieu);
      if (f.thangDong) p.set("thang_dong", f.thangDong);
      if (f.tinh) p.set("tinh", f.tinh);
      if (f.tinh && f.quanHuyen) p.set("quan_huyen", f.quanHuyen);
      if (f.loi) p.set("loi", f.loi);
      if (f.q) p.set("q", f.q);
      p.set("sort", sortField);
      p.set("dir", sortDir);
      p.set("page", String(page));
      p.set("pageSize", f.pageSize);
      return api.get<ListResponse>(`/khieu-nai?${p.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const eligibleOnPage = canBulkChot ? (query.data?.items ?? []).filter(duocDongCaHangLoat) : [];
  const selectedOnPage = eligibleOnPage.filter((r) => selectedIds.has(r.id)).length;
  const allPageSelected = eligibleOnPage.length > 0 && selectedOnPage === eligibleOnPage.length;
  const toggleSelectPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      eligibleOnPage.forEach((r) => (allPageSelected ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  const pageCheckbox = (
    <input
      type="checkbox"
      className="h-5 w-5 accent-accent lg:h-4 lg:w-4"
      checked={allPageSelected}
      ref={(el) => { if (el) el.indeterminate = selectedOnPage > 0 && !allPageSelected; }}
      disabled={eligibleOnPage.length === 0}
      onChange={toggleSelectPage}
      title={t("list.selectAllTitle")}
      aria-label={t("list.selectAllTitle")}
    />
  );

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    set("q", qInput.trim());
  };

  const resetFilters = () => {
    setF(EMPTY_FILTERS);
    setQInput("");
    setPage(1);
  };

  const columns: TableColumn<KhieuNai>[] = [
    ...(canBulkChot
      ? [
          {
            key: "chon",
            header: pageCheckbox,
            className: "w-8",
            render: (r: KhieuNai) => {
              if (!duocDongCaHangLoat(r)) return null;
              return (
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={selectedIds.has(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(r.id)}
                  title={t("list.selectOneTitle")}
                  aria-label={t("list.selectOneAria", { id: r.id })}
                />
              );
            },
          } satisfies TableColumn<KhieuNai>,
        ]
      : []),
    {
      key: "id",
      header: t("list.col.idModelLada"),
      sortKey: "id",
      render: (r) => (
        <div className="leading-tight">
          <div className="font-mono text-xs font-semibold text-link">{r.id}</div>
          <div className="text-xs text-ink-soft">{[r.model, r.id_lada].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      ),
    },
    {
      key: "khach",
      header: t("list.col.customerProvince"),
      sortKey: "ten_khach",
      render: (r) => (
        <div className="leading-tight">
          <div>{r.ten_khach ?? "—"}</div>
          <div className="text-xs text-ink-soft">{r.tinh || r.tinh_moi || "—"}</div>
        </div>
      ),
    },
    {
      key: "nguon",
      header: t("list.col.source"),
      render: (r) => (r.nguon ? (NGUON_LABEL[r.nguon] ?? r.nguon) : <span className="text-ink-faint">—</span>),
    },
    {
      key: "muc_do",
      header: t("list.col.severity"),
      sortKey: "muc_do",
      render: (r) => (r.muc_do ? <Badge tone={mucDoTone(r.muc_do)}>{r.muc_do}</Badge> : <span className="text-ink-faint">—</span>),
    },
    { key: "nhom_van_de", header: t("list.col.issueGroup"), sortKey: "nhom_van_de", render: (r) => r.nhom_van_de ?? "—" },
    { key: "trang_thai", header: t("list.col.status"), sortKey: "trang_thai", render: (r) => <StatusBadge trangThai={r.trang_thai} /> },
    {
      key: "gio_xu_ly",
      header: t("list.col.processingHours"),
      render: (r) => (
        <span className="text-xs text-ink">
          {fmtVN.gioXuLy(r.ngay_tiep_nhan, r.trang_thai === "Da ket thuc" ? r.ngay_ket_thuc : null)}
        </span>
      ),
    },
    {
      key: "chi_bao",
      header: t("list.col.indicator"),
      render: (r) => {
        const cb = chiBao(r, t);
        return cb ? <Badge tone={cb.tone}>{cb.text}</Badge> : <span className="text-ink-faint">—</span>;
      },
    },
    {
      key: "cap_nhat",
      header: t("list.col.updated"),
      sortKey: "ngay_thay_doi",
      render: (r) => <span className="text-xs text-ink-soft" title={r.ngay_thay_doi}>{fmtVN.relative(r.ngay_thay_doi)}</span>,
    },
    {
      key: "ktv",
      header: t("list.col.ktvDone"),
      sortKey: "ngay_ktv_hoan_thanh",
      render: (r) =>
        !r.id_crm_karofi ? (
          <span className="text-ink-faint">{t("list.notApplicable")}</span>
        ) : r.ngay_ktv_hoan_thanh ? (
          <span className="text-green-700">{t("list.done")} · {fmtVN.date(r.ngay_ktv_hoan_thanh)}</span>
        ) : laIdCrmSai(r) ? (
          <span className="font-semibold text-red-600">{t("list.crmIdWrong")}</span>
        ) : (
          <span className="text-amber-600">{t("list.pendingSync")}</span>
        ),
    },
  ];

  const total = query.data?.total ?? 0;
  const totalIsApprox = query.data?.totalIsApprox ?? false;
  const pageSizeN = parseInt(f.pageSize, 10) || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSizeN));

  const activeFilterCount =
    [f.trangThai, f.nguon, f.loaiKh, f.mucDo, f.nhomVanDe, f.nhomYeuCau, f.tuNgay, f.denNgay, f.chuaDongBo, f.nguoiTaoVaiTro, f.tonToiThieu, f.thangDong, f.tinh, f.quanHuyen, f.loi, f.q].filter(Boolean).length +
    (f.choTnCskh ? 1 : 0) + (f.quaHanGiaiTrinh ? 1 : 0) + (f.caCuaToi ? 1 : 0);

  const handleSort = (field: string) => {
    setF((p) => {
      const [curField, curDir] = p.sort.split("|");
      const nextDir = curField === field && curDir === "asc" ? "desc" : "asc";
      return { ...p, sort: `${field}|${nextDir}` };
    });
    setPage(1);
  };

  const selCls =
    "rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/15 lg:px-2 lg:py-1 lg:text-xs";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-ink lg:text-[21px]">{t("list.title")}</h2>
        {canCreate && (
          <Btn variant="primary" onClick={() => setCreateOpen(true)}>{t("home.createNew")}</Btn>
        )}
      </div>

      <Card>
        {/* Thanh loc nhanh luon 1 dong (ten trang thai rut gon), man hep thi cuon ngang thay vi xuong dong. */}
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft hover:text-accent-ink lg:px-2.5 lg:py-1 lg:text-xs"
          >
            {t("list.filters")}
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold leading-none text-white lg:text-[10px]">
                {activeFilterCount}
              </span>
            )}
            <span className="text-xs text-ink-soft lg:text-[10px]">{filtersOpen ? "▲" : "▼"}</span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
            {NGUON_QUICK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("nguon", o.value)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:px-2.5 lg:py-1 lg:text-xs ${
                  f.nguon === o.value ? "bg-accent text-white shadow-brand" : "text-ink-soft hover:bg-surface hover:text-accent-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
            {LOAI_KH_QUICK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                title={o.title}
                onClick={() => set("loaiKh", o.value)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:px-2.5 lg:py-1 lg:text-xs ${
                  f.loaiKh === o.value ? "bg-accent text-white shadow-brand" : "text-ink-soft hover:bg-surface hover:text-accent-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
            {TRANG_THAI_QUICK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                title={o.label}
                onClick={() => set("trangThai", o.value)}
                className={`flex items-center gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:px-2.5 lg:py-1 lg:text-xs ${
                  f.trangThai === o.value ? "bg-accent text-white shadow-brand" : "text-ink-soft hover:bg-surface hover:text-accent-ink"
                }`}
              >
                {f.trangThai === o.value ? o.label : o.short}
                {TRANG_THAI_QUICK_COUNT[o.value] != null && (
                  <span
                    title={t("list.quickCountTitle")}
                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none lg:text-[10px] ${
                      f.trangThai === o.value ? "bg-white/25 text-white" : "bg-surface text-ink-soft"
                    }`}
                  >
                    {TRANG_THAI_QUICK_COUNT[o.value]}
                  </span>
                )}
              </button>
            ))}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="shrink-0 whitespace-nowrap text-sm font-medium text-accent hover:underline lg:text-xs">
              {t("list.clearFilters", { count: activeFilterCount })}
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FilterSelect className={selCls} value={f.trangThai} onChange={(v) => set("trangThai", v)} allLabel={t("list.allStatus")}
              options={STATUS_OPTIONS} />
            <FilterSelect className={selCls} value={f.mucDo} onChange={(v) => set("mucDo", v)} allLabel={t("list.allSeverity")}
              options={(sortMucDoOptions(mucDoOpts.data ?? [])).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
            <FilterSelect className={selCls} value={f.nhomVanDe} onChange={(v) => set("nhomVanDe", v)} allLabel={t("list.allIssueGroup")}
              options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
            <FilterSelect className={selCls} value={f.nhomYeuCau} onChange={(v) => set("nhomYeuCau", v)} allLabel={t("list.allRequestGroup")}
              options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              {t("list.from")} <input type="date" className={selCls} value={f.tuNgay} onChange={(e) => set("tuNgay", e.target.value)} />
            </label>
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              {t("list.to")} <input type="date" className={selCls} value={f.denNgay} onChange={(e) => set("denNgay", e.target.value)} />
            </label>
            <FilterSelect className={selCls} value={f.tinh} onChange={(v) => { setF((p) => ({ ...p, tinh: v, quanHuyen: "" })); setPage(1); }}
              allLabel={t("list.allProvince")} options={TINH_OPTIONS} />
            {f.tinh && (
              <FilterSelect className={selCls} value={f.quanHuyen} onChange={(v) => set("quanHuyen", v)} allLabel={t("list.allDistrict")}
                options={QUAN_HUYEN_OPTIONS} />
            )}
            <FilterSelect className={selCls} value={f.loi} onChange={(v) => set("loi", v)} allLabel={t("list.allErrorType")}
              options={LOI_OPTIONS} />
            <FilterSelect className={selCls} value={f.chuaDongBo} onChange={(v) => set("chuaDongBo", v)} allLabel={t("list.allCrmStatus")}
              options={CRM_TRANG_THAI_OPTIONS} />
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              <input type="checkbox" checked={f.choTnCskh} onChange={(e) => set("choTnCskh", e.target.checked)} /> {t("list.waitingTnCskhClose")}
            </label>
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              <input type="checkbox" checked={f.quaHanGiaiTrinh} onChange={(e) => set("quaHanGiaiTrinh", e.target.checked)} /> {t("list.overdueExplain")}
            </label>
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              <input type="checkbox" checked={f.caCuaToi} onChange={(e) => set("caCuaToi", e.target.checked)} /> {t("list.myCases")}
            </label>
            <FilterSelect className={selCls} value={f.nguoiTaoVaiTro} onChange={(v) => set("nguoiTaoVaiTro", v)} allLabel={t("list.allCreator")}
              options={NGUOI_TAO_VAI_TRO_OPTIONS} />
            <FilterSelect className={selCls} value={f.tonToiThieu} onChange={(v) => set("tonToiThieu", v)} allLabel={t("list.allDuration")}
              options={TON_TOI_THIEU_OPTIONS} />
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              {t("list.closeMonth")}
              <input type="month" className={selCls} value={f.thangDong} onChange={(e) => set("thangDong", e.target.value)} />
            </label>
          </div>
        )}

        <form onSubmit={submitSearch} className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t("list.searchPlaceholder")}
          />
          <Btn type="submit" variant="secondary" size="touch">{t("list.search")}</Btn>
          <div className="ml-auto flex items-center gap-2">
            <FilterSelect className={selCls} value={f.sort} onChange={(v) => set("sort", v)}
              options={SORT_OPTIONS} />
            <FilterSelect className={selCls} value={f.pageSize} onChange={(v) => set("pageSize", v)}
              options={PAGE_SIZE_OPTIONS} />
          </div>
        </form>

        {canBulkChot && selectedIds.size > 0 && (
          <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm shadow-card">
            <span className="font-medium text-ink">{t("list.selected", { count: selectedIds.size })}</span>
            <Btn size="touch" variant="primary" disabled={bulkDongCa.isPending} onClick={() => setConfirmDongCa(true)}>
              {bulkDongCa.isPending ? t("list.closing") : t("list.closeCases", { count: selectedIds.size })}
            </Btn>
            <button type="button" className="text-sm text-ink-soft hover:underline lg:text-xs" onClick={() => setSelectedIds(new Set())}>
              {t("list.deselect")}
            </button>
          </div>
        )}

        {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">{t("common.loading")}</p>}
        {query.isError && <p className="py-8 text-center text-sm text-red-600">{t("list.loadError")}</p>}
        {query.data && (
          <>
            <div className="flex flex-col gap-2 md:hidden">
              {eligibleOnPage.length > 0 && (
                <label className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-3 text-sm font-medium text-ink">
                  {pageCheckbox}
                  {t("list.selectAllEligible", { count: eligibleOnPage.length })}
                </label>
              )}
              {query.data.items.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">{t("common.noData")}</p>}
              {query.data.items.map((r) =>
                canBulkChot && duocDongCaHangLoat(r) ? (
                  <div key={r.id} className="flex items-stretch gap-2">
                    <label className="flex shrink-0 items-center rounded-lg border border-line bg-white px-3" aria-label={t("list.selectOneAria", { id: r.id })}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-accent"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <KhieuNaiCard kn={r} onClick={() => setDetailId(r.id)} />
                    </div>
                  </div>
                ) : (
                  <KhieuNaiCard key={r.id} kn={r} onClick={() => setDetailId(r.id)} />
                ),
              )}
            </div>
            <div className="hidden md:block">
              <Table
                columns={columns}
                rows={query.data.items}
                rowKey={(r) => r.id}
                onRowClick={(r) => setDetailId(r.id)}
                sort={{ field: sortField, dir: sortDir === "asc" ? "asc" : "desc" }}
                onSort={handleSort}
                rowClassName={(r) =>
                  `${MUC_DO_CARD_BG[mucDoTone(r.muc_do)]} ${MUC_DO_CARD_HOVER_BG[mucDoTone(r.muc_do)]} ${vipGlowClass(r.phan_loai_kh)} ${r.trang_thai === "Huy" ? "line-through opacity-60" : ""}`
                }
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
              <span>
                {t("list.totalFooter", {
                  total, approx: totalIsApprox ? "+" : "", page, totalPages,
                })}
              </span>
              <div className="flex gap-2">
                <Btn size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("list.prev")}</Btn>
                <Btn size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t("list.next")}</Btn>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("home.createModalTitle")}
        width="full"
        panelClassName={createHeader.panelClassName}
        actions={
          <div className="hidden items-center gap-3 lg:flex">
            {createHeader.pendingCount > 0 && (
              <span className="hidden text-[11px] text-ink-soft sm:inline">
                {t("home.pendingChoices", { count: createHeader.pendingCount })}
              </span>
            )}
            {createHeader.missing.length > 0 && createHeader.pendingCount === 0 && (
              <span className="hidden text-xs text-amber-700 sm:inline">{t("home.missing", { list: createHeader.missing.join(", ") })}</span>
            )}
            <Btn type="button" variant="secondary" size="sm" onClick={() => createFormRef.current?.cancel()}>{t("common.cancel")}</Btn>
            <Btn
              type="button"
              variant="primary"
              size="sm"
              disabled={createHeader.submitting || createHeader.missing.length > 0}
              onClick={() => createFormRef.current?.submit()}
            >
              {createHeader.submitting ? t("home.creating") : t("home.createBtn")}
            </Btn>
          </div>
        }
      >
        <KhieuNaiForm
          ref={createFormRef}
          userCongTy={user.cong_ty}
          onStateChange={setCreateHeader}
          onCreated={(id) => { setCreateOpen(false); query.refetch(); setDetailId(id); }}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal
        open={confirmDongCa}
        onClose={() => !bulkDongCa.isPending && setConfirmDongCa(false)}
        title={t("list.confirmCloseTitle", { count: selectedIds.size })}
        width="md"
      >
        <div className="space-y-2 text-base text-ink lg:text-sm">
          <p>
            {t("list.confirmCloseBody1Pre")} <b>{t("list.confirmCloseBody1Bold")}</b>{t("list.confirmCloseBody1Post")}
          </p>
          <p>{t("list.confirmCloseBody2Pre")} <b>{t("list.confirmCloseBody2Bold")}</b>{t("list.confirmCloseBody2Post")}</p>
          <p className="text-sm text-ink-soft lg:text-xs">{t("list.confirmCloseNote")}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn size="touch" variant="secondary" disabled={bulkDongCa.isPending} onClick={() => setConfirmDongCa(false)}>{t("list.no")}</Btn>
          <Btn size="touch" variant="primary" disabled={bulkDongCa.isPending} onClick={() => bulkDongCa.mutate([...selectedIds])}>
            {bulkDongCa.isPending ? t("list.closing") : t("list.closeCases", { count: selectedIds.size })}
          </Btn>
        </div>
      </Modal>

      <Modal open={!!detailId} onClose={closeDetail} width="full">
        {detailId && (
          <KhieuNaiDetail id={detailId} user={user} onClose={closeDetail} onNavigate={setDetailId} onChanged={() => query.refetch()} />
        )}
      </Modal>
    </div>
  );
}
