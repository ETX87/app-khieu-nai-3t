import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const STATUS_OPTIONS = [
  { value: "Cho tiep nhan", label: "Chờ tiếp nhận" },
  { value: "Dang xu ly", label: "Đang xử lý" },
  { value: "Cho chot ket thuc", label: "Chờ chốt kết thúc" },
  { value: "Da ket thuc", label: "Đã kết thúc" },
  { value: "Huy", label: "Hủy" },
];

const SORT_OPTIONS = [
  { value: "ngay_tiep_nhan|desc", label: "Tiếp nhận mới nhất" },
  { value: "ngay_tiep_nhan|asc", label: "Tiếp nhận cũ nhất" },
  { value: "ngay_thay_doi|desc", label: "Cập nhật gần nhất" },
  { value: "muc_do|asc", label: "Mức độ (A→Z)" },
];

const PAGE_SIZE_OPTIONS = [
  { value: "20", label: "20 dòng" },
  { value: "50", label: "50 dòng" },
  { value: "100", label: "100 dòng" },
];

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

const TON_TOI_THIEU_OPTIONS = [
  { value: "3", label: "Tồn ≥ 3 ngày" },
  { value: "7", label: "Tồn ≥ 7 ngày" },
  { value: "14", label: "Tồn ≥ 14 ngày" },
  { value: "30", label: "Tồn ≥ 30 ngày" },
];

interface Filters {
  trangThai: string;
  nguon: string; // "" | "Lada" (NSKX) | "CRM" (3T) - 3 nut loc nhanh tren toolbar
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
  q: string;
  sort: string; // "field|dir"
  pageSize: string;
}

const CRM_TRANG_THAI_OPTIONS = [
  { value: "1", label: "Tồn đồng bộ CRM (tất cả)" },
  { value: "cho", label: "Chờ đồng bộ (ID đúng)" },
  { value: "sai", label: "ID CRM sai" },
];

const NGUON_QUICK_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "Lada", label: "NSKX" },
  { value: "CRM", label: "3T" },
];

// Gia tri gia (khong trung voi trang_thai that nao) danh cho nut "Tat ca ton" - map sang query
// param rieng "chua_dong" o backend (trang_thai NOT IN Da ket thuc/Huy) thay vi trang_thai = ?.
const TRANG_THAI_TON = "__ton__";
const TRANG_THAI_QUICK_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: TRANG_THAI_TON, label: "Tất cả tồn" },
  ...STATUS_OPTIONS,
];

const EMPTY_FILTERS: Filters = {
  trangThai: "", nguon: "", mucDo: "", nhomVanDe: "", nhomYeuCau: "", tuNgay: "", denNgay: "",
  chuaDongBo: "", choTnCskh: false, quaHanGiaiTrinh: false, caCuaToi: false, nguoiTaoVaiTro: "", tonToiThieu: "", thangDong: "",
  q: "", sort: "ngay_tiep_nhan|desc", pageSize: "20",
};

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) {
      const saved = { ...EMPTY_FILTERS, ...JSON.parse(raw) };
      // Ban cu luu chuaDongBo dang boolean.
      if (typeof saved.chuaDongBo !== "string") saved.chuaDongBo = saved.chuaDongBo ? "1" : "";
      return saved;
    }
  } catch { /* ignore */ }
  return EMPTY_FILTERS;
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

const DONG_CA_ERR: Record<string, string> = {
  QUA_HAN_GIAI_TRINH: "quá hạn giải trình",
  CAN_DANH_GIA_DAY_DU: "chưa đủ đánh giá 4 lỗi + kết luận",
  CAN_DANH_GIA_QL: "chưa có Đánh giá QL",
  INVALID_STATE: "trạng thái đã thay đổi",
  NOT_FOUND: "không tìm thấy",
};

function chiBao(r: KhieuNai): { text: string; tone: "amber" | "green" | "red" | "gray" } | null {
  if (r.trang_thai === "Cho chot ket thuc") return { text: "Sẵn sàng chốt", tone: "green" };
  if (r.trang_thai === "Dang xu ly") {
    if (sanSangDongCa(r)) return { text: "Sẵn sàng đóng ca", tone: "green" };
    if (r.id_crm_karofi && !r.ngay_ktv_hoan_thanh) {
      return laIdCrmSai(r) ? { text: "ID CRM sai", tone: "red" } : { text: "Chờ đồng bộ CRM", tone: "amber" };
    }
    return { text: "Chờ đánh giá", tone: "amber" };
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
  const [f, setF] = useState<Filters>(loadFilters);
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
      const detail = [...byErr].map(([code, n]) => `${n} ca ${DONG_CA_ERR[code] ?? code}`).join(", ");
      showToast(
        fails.length === 0 ? `Đã đóng ${okCount} ca` : `Đã đóng ${okCount} ca. Không đóng được: ${detail}`,
        fails.length === 0 ? "success" : "error",
      );
      setSelectedIds(new Set());
      setConfirmDongCa(false);
      queryClient.invalidateQueries({ queryKey: ["khieu-nai"] });
      queryClient.invalidateQueries({ queryKey: ["khieu-nai-stats"] });
    },
    onError: (e) => {
      setConfirmDongCa(false);
      showToast(e instanceof ApiError ? `Đóng ca hàng loạt thất bại: ${e.code}` : "Đóng ca hàng loạt thất bại", "error");
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
      title="Chọn tất cả ca đủ điều kiện đóng ca trong trang"
      aria-label="Chọn tất cả ca đủ điều kiện đóng ca trong trang"
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
                  title="Chọn để đóng ca hàng loạt"
                  aria-label={`Chọn ${r.id} để đóng ca`}
                />
              );
            },
          } satisfies TableColumn<KhieuNai>,
        ]
      : []),
    {
      key: "id",
      header: "Mã · Model · Lada",
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
      header: "Khách / Tỉnh",
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
      header: "Nguồn",
      render: (r) => (r.nguon ? (NGUON_LABEL[r.nguon] ?? r.nguon) : <span className="text-ink-faint">—</span>),
    },
    {
      key: "muc_do",
      header: "Mức độ",
      sortKey: "muc_do",
      render: (r) => (r.muc_do ? <Badge tone={mucDoTone(r.muc_do)}>{r.muc_do}</Badge> : <span className="text-ink-faint">—</span>),
    },
    { key: "nhom_van_de", header: "Nhóm vấn đề", sortKey: "nhom_van_de", render: (r) => r.nhom_van_de ?? "—" },
    { key: "trang_thai", header: "Trạng thái", sortKey: "trang_thai", render: (r) => <StatusBadge trangThai={r.trang_thai} /> },
    {
      key: "gio_xu_ly",
      header: "Số giờ xử lý",
      render: (r) => (
        <span className="text-xs text-ink">
          {fmtVN.gioXuLy(r.ngay_tiep_nhan, r.trang_thai === "Da ket thuc" ? r.ngay_ket_thuc : null)}
        </span>
      ),
    },
    {
      key: "chi_bao",
      header: "Chỉ báo",
      render: (r) => {
        const cb = chiBao(r);
        return cb ? <Badge tone={cb.tone}>{cb.text}</Badge> : <span className="text-ink-faint">—</span>;
      },
    },
    {
      key: "cap_nhat",
      header: "Cập nhật",
      sortKey: "ngay_thay_doi",
      render: (r) => <span className="text-xs text-ink-soft" title={r.ngay_thay_doi}>{fmtVN.relative(r.ngay_thay_doi)}</span>,
    },
    {
      key: "ktv",
      header: "KTV hoàn thành",
      sortKey: "ngay_ktv_hoan_thanh",
      render: (r) =>
        !r.id_crm_karofi ? (
          <span className="text-ink-faint">Không áp dụng</span>
        ) : r.ngay_ktv_hoan_thanh ? (
          <span className="text-green-700">Xong · {fmtVN.date(r.ngay_ktv_hoan_thanh)}</span>
        ) : laIdCrmSai(r) ? (
          <span className="font-semibold text-red-600">ID CRM sai</span>
        ) : (
          <span className="text-amber-600">Chờ đồng bộ</span>
        ),
    },
  ];

  const total = query.data?.total ?? 0;
  const totalIsApprox = query.data?.totalIsApprox ?? false;
  const pageSizeN = parseInt(f.pageSize, 10) || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSizeN));

  const activeFilterCount =
    [f.trangThai, f.nguon, f.mucDo, f.nhomVanDe, f.nhomYeuCau, f.tuNgay, f.denNgay, f.chuaDongBo, f.nguoiTaoVaiTro, f.tonToiThieu, f.thangDong, f.q].filter(Boolean).length +
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
        <h2 className="text-xl font-bold text-ink lg:text-[21px]">Phản ánh</h2>
        {canCreate && (
          <Btn variant="primary" onClick={() => setCreateOpen(true)}>+ Tạo phản ánh mới</Btn>
        )}
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft hover:text-accent-ink lg:px-2.5 lg:py-1 lg:text-xs"
          >
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold leading-none text-white lg:text-[10px]">
                {activeFilterCount}
              </span>
            )}
            <span className="text-xs text-ink-soft lg:text-[10px]">{filtersOpen ? "▲" : "▼"}</span>
          </button>
          <div className="flex items-center gap-0.5 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
            {NGUON_QUICK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("nguon", o.value)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:px-2.5 lg:py-1 lg:text-xs ${
                  f.nguon === o.value ? "bg-accent text-white shadow-brand" : "text-ink-soft hover:bg-surface hover:text-accent-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-0.5 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
            {TRANG_THAI_QUICK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("trangThai", o.value)}
                className={`flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:px-2.5 lg:py-1 lg:text-xs ${
                  f.trangThai === o.value ? "bg-accent text-white shadow-brand" : "text-ink-soft hover:bg-surface hover:text-accent-ink"
                }`}
              >
                {o.label}
                {TRANG_THAI_QUICK_COUNT[o.value] != null && (
                  <span
                    title="Số ca trong phạm vi tháng hiện tại (giống Trang chủ) - có thể khác số ca thực tế hiển thị nếu đang lọc theo khoảng ngày/tháng khác"
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
            <button onClick={resetFilters} className="text-sm font-medium text-accent hover:underline lg:text-xs">
              Xoá lọc ({activeFilterCount})
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FilterSelect className={selCls} value={f.trangThai} onChange={(v) => set("trangThai", v)} allLabel="Mọi trạng thái"
              options={STATUS_OPTIONS} />
            <FilterSelect className={selCls} value={f.mucDo} onChange={(v) => set("mucDo", v)} allLabel="Mọi mức độ"
              options={(sortMucDoOptions(mucDoOpts.data ?? [])).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
            <FilterSelect className={selCls} value={f.nhomVanDe} onChange={(v) => set("nhomVanDe", v)} allLabel="Mọi nhóm vấn đề"
              options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
            <FilterSelect className={selCls} value={f.nhomYeuCau} onChange={(v) => set("nhomYeuCau", v)} allLabel="Mọi nhóm yêu cầu"
              options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))} />
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              Từ <input type="date" className={selCls} value={f.tuNgay} onChange={(e) => set("tuNgay", e.target.value)} />
            </label>
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              đến <input type="date" className={selCls} value={f.denNgay} onChange={(e) => set("denNgay", e.target.value)} />
            </label>
            <FilterSelect className={selCls} value={f.chuaDongBo} onChange={(v) => set("chuaDongBo", v)} allLabel="Mọi tình trạng CRM"
              options={CRM_TRANG_THAI_OPTIONS} />
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              <input type="checkbox" checked={f.choTnCskh} onChange={(e) => set("choTnCskh", e.target.checked)} /> Chờ TN CSKH đóng ca
            </label>
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              <input type="checkbox" checked={f.quaHanGiaiTrinh} onChange={(e) => set("quaHanGiaiTrinh", e.target.checked)} /> Quá hạn giải trình
            </label>
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              <input type="checkbox" checked={f.caCuaToi} onChange={(e) => set("caCuaToi", e.target.checked)} /> Ca của tôi
            </label>
            <FilterSelect className={selCls} value={f.nguoiTaoVaiTro} onChange={(v) => set("nguoiTaoVaiTro", v)} allLabel="Mọi người tạo"
              options={NGUOI_TAO_VAI_TRO_OPTIONS} />
            <FilterSelect className={selCls} value={f.tonToiThieu} onChange={(v) => set("tonToiThieu", v)} allLabel="Mọi thời gian tồn"
              options={TON_TOI_THIEU_OPTIONS} />
            <label className="flex items-center gap-1 text-sm text-ink-soft lg:text-xs">
              Tháng đóng
              <input type="month" className={selCls} value={f.thangDong} onChange={(e) => set("thangDong", e.target.value)} />
            </label>
          </div>
        )}

        <form onSubmit={submitSearch} className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm: tên khách · SĐT · ID Lada · ID Truy xuất · mã KN · mã CRM"
          />
          <Btn type="submit" variant="secondary" size="touch">Tìm</Btn>
          <div className="ml-auto flex items-center gap-2">
            <FilterSelect className={selCls} value={f.sort} onChange={(v) => set("sort", v)}
              options={SORT_OPTIONS} />
            <FilterSelect className={selCls} value={f.pageSize} onChange={(v) => set("pageSize", v)}
              options={PAGE_SIZE_OPTIONS} />
          </div>
        </form>

        {canBulkChot && selectedIds.size > 0 && (
          <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm shadow-card">
            <span className="font-medium text-ink">Đã chọn {selectedIds.size} ca</span>
            <Btn size="touch" variant="primary" disabled={bulkDongCa.isPending} onClick={() => setConfirmDongCa(true)}>
              {bulkDongCa.isPending ? "Đang đóng ca..." : `Đóng ca (${selectedIds.size})`}
            </Btn>
            <button type="button" className="text-sm text-ink-soft hover:underline lg:text-xs" onClick={() => setSelectedIds(new Set())}>
              Bỏ chọn
            </button>
          </div>
        )}

        {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>}
        {query.isError && <p className="py-8 text-center text-sm text-red-600">Không thể tải dữ liệu.</p>}
        {query.data && (
          <>
            <div className="flex flex-col gap-2 md:hidden">
              {eligibleOnPage.length > 0 && (
                <label className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-3 text-sm font-medium text-ink">
                  {pageCheckbox}
                  Chọn tất cả ca đủ điều kiện đóng ca ({eligibleOnPage.length})
                </label>
              )}
              {query.data.items.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">Không có dữ liệu</p>}
              {query.data.items.map((r) =>
                canBulkChot && duocDongCaHangLoat(r) ? (
                  <div key={r.id} className="flex items-stretch gap-2">
                    <label className="flex shrink-0 items-center rounded-lg border border-line bg-white px-3" aria-label={`Chọn ${r.id} để đóng ca`}>
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
              <span>Tổng {total}{totalIsApprox ? "+" : ""} phản ánh — Trang {page}/{totalPages}{totalIsApprox ? "+" : ""}</span>
              <div className="flex gap-2">
                <Btn size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Trước</Btn>
                <Btn size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sau</Btn>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo phản ánh mới"
        width="full"
        panelClassName={createHeader.panelClassName}
        actions={
          <div className="hidden items-center gap-3 lg:flex">
            {createHeader.pendingCount > 0 && (
              <span className="hidden text-[11px] text-ink-soft sm:inline">
                {createHeader.pendingCount} lựa chọn mới sẽ được lưu khi bấm Tạo
              </span>
            )}
            {createHeader.missing.length > 0 && createHeader.pendingCount === 0 && (
              <span className="hidden text-xs text-amber-700 sm:inline">Còn thiếu: {createHeader.missing.join(", ")}</span>
            )}
            <Btn type="button" variant="secondary" size="sm" onClick={() => createFormRef.current?.cancel()}>Hủy</Btn>
            <Btn
              type="button"
              variant="primary"
              size="sm"
              disabled={createHeader.submitting || createHeader.missing.length > 0}
              onClick={() => createFormRef.current?.submit()}
            >
              {createHeader.submitting ? "Đang tạo..." : "Tạo phản ánh"}
            </Btn>
          </div>
        }
      >
        <KhieuNaiForm
          ref={createFormRef}
          onStateChange={setCreateHeader}
          onCreated={(id) => { setCreateOpen(false); query.refetch(); setDetailId(id); }}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal
        open={confirmDongCa}
        onClose={() => !bulkDongCa.isPending && setConfirmDongCa(false)}
        title={`Đóng ${selectedIds.size} ca?`}
        width="md"
      >
        <div className="space-y-2 text-base text-ink lg:text-sm">
          <p>
            Ca chưa có Đánh giá QL sẽ được ghi <b>Đánh giá QL = "{`Đã hoàn thành`}"</b>. Ca đã có Đánh giá QL giữ nguyên.
          </p>
          <p>Tất cả chuyển sang trạng thái <b>Đã kết thúc</b>.</p>
          <p className="text-sm text-ink-soft lg:text-xs">Ca quá hạn giải trình hoặc vừa đổi trạng thái sẽ được bỏ qua và báo lại.</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn size="touch" variant="secondary" disabled={bulkDongCa.isPending} onClick={() => setConfirmDongCa(false)}>Không</Btn>
          <Btn size="touch" variant="primary" disabled={bulkDongCa.isPending} onClick={() => bulkDongCa.mutate([...selectedIds])}>
            {bulkDongCa.isPending ? "Đang đóng ca..." : `Đóng ca (${selectedIds.size})`}
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
