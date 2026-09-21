import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AppUser, KhieuNai } from "../api/types";
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
  tuNgay: string;
  denNgay: string;
  chuaDongBo: boolean;
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
  trangThai: "", nguon: "", mucDo: "", nhomVanDe: "", tuNgay: "", denNgay: "",
  chuaDongBo: false, choTnCskh: false, quaHanGiaiTrinh: false, caCuaToi: false, nguoiTaoVaiTro: "", tonToiThieu: "", thangDong: "",
  q: "", sort: "ngay_tiep_nhan|desc", pageSize: "20",
};

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return { ...EMPTY_FILTERS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return EMPTY_FILTERS;
}

function chiBao(r: KhieuNai): { text: string; tone: "amber" | "green" | "red" | "gray" } | null {
  if (r.trang_thai === "Cho chot ket thuc") return { text: "Sẵn sàng chốt", tone: "green" };
  if (r.trang_thai === "Dang xu ly") {
    const du =
      r.loi_nha_san_xuat !== "Chua danh gia" &&
      r.loi_lap_dat !== "Chua danh gia" &&
      r.loi_thai_do_ktv !== "Chua danh gia" &&
      r.loi_quy_trinh_nskx !== "Chua danh gia" &&
      (r.ket_luan_khieu_nai ?? "Chua danh gia") !== "Chua danh gia";
    if (du) return { text: "Sẵn sàng đóng ca", tone: "green" };
    if (r.id_crm_karofi && !r.ngay_ktv_hoan_thanh) return { text: "Chưa đồng bộ CRM", tone: "red" };
    return { text: "Chờ đánh giá", tone: "amber" };
  }
  return null;
}

export function KhieuNaiModule({
  user, initialFilter, openDetailRequest,
}: {
  user: AppUser;
  initialFilter?: { trang_thai?: string; chua_dong_bo?: boolean; cho_tn_cskh?: boolean; qua_han_giai_trinh?: boolean } | null;
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

  const canCreate = !!user.vai_tro && user.vai_tro !== "Viewer";
  // Chot hang loat (item 2026-09): QL/Admin chon nhieu don DA co danh gia QL rieng tung don -> chot
  // 1 lan (backend van chay lai dung dieu kien nhu chot don le cho tung id).
  const canBulkChot = user.vai_tro === "QL" || user.vai_tro === "Admin";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const bulkChot = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ results: { id: string; ok: boolean; error?: string }[] }>("/khieu-nai/chot-hang-loat", { ids }),
    onSuccess: (data) => {
      const okCount = data.results.filter((r) => r.ok).length;
      const failCount = data.results.length - okCount;
      showToast(
        failCount === 0 ? `Đã chốt ${okCount} đơn` : `Đã chốt ${okCount} đơn, ${failCount} đơn lỗi (đã đổi trạng thái?)`,
        failCount === 0 ? "success" : "error",
      );
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["khieu-nai"] });
    },
    onError: (e) => showToast(e instanceof ApiError ? `Chốt hàng loạt thất bại: ${e.code}` : "Chốt hàng loạt thất bại", "error"),
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
        chuaDongBo: initialFilter.chua_dong_bo ?? false,
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
      if (f.tuNgay) p.set("tu_ngay", f.tuNgay);
      if (f.denNgay) p.set("den_ngay", f.denNgay);
      if (f.chuaDongBo) p.set("chua_dong_bo", "1");
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
            header: "",
            className: "w-8",
            render: (r: KhieuNai) => {
              const eligible = r.trang_thai === "Cho chot ket thuc" && !!r.danh_gia_ql && r.danh_gia_ql.trim() !== "";
              if (!eligible) return null;
              return (
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(r.id)}
                  title="Chọn để chốt hàng loạt"
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
          <div className="font-mono text-xs text-ink">{r.id}</div>
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
        ) : (
          <span className="text-amber-600">Chưa</span>
        ),
    },
  ];

  const total = query.data?.total ?? 0;
  const pageSizeN = parseInt(f.pageSize, 10) || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSizeN));

  const activeFilterCount =
    [f.trangThai, f.nguon, f.mucDo, f.nhomVanDe, f.tuNgay, f.denNgay, f.nguoiTaoVaiTro, f.tonToiThieu, f.thangDong, f.q].filter(Boolean).length +
    (f.chuaDongBo ? 1 : 0) + (f.choTnCskh ? 1 : 0) + (f.quaHanGiaiTrinh ? 1 : 0) + (f.caCuaToi ? 1 : 0);

  const handleSort = (field: string) => {
    setF((p) => {
      const [curField, curDir] = p.sort.split("|");
      const nextDir = curField === field && curDir === "asc" ? "desc" : "asc";
      return { ...p, sort: `${field}|${nextDir}` };
    });
    setPage(1);
  };

  const selCls = "rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Phản ánh</h2>
        {canCreate && (
          <Btn variant="primary" onClick={() => setCreateOpen(true)}>+ Tạo phản ánh mới</Btn>
        )}
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-gray-50"
          >
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {activeFilterCount}
              </span>
            )}
            <span className="text-[10px] text-ink-soft">{filtersOpen ? "▲" : "▼"}</span>
          </button>
          <div className="flex items-center gap-0.5 rounded-md border border-line bg-white p-0.5">
            {NGUON_QUICK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("nguon", o.value)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  f.nguon === o.value ? "bg-accent text-white" : "text-ink-soft hover:bg-gray-50"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-line bg-white p-0.5">
            {TRANG_THAI_QUICK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("trangThai", o.value)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  f.trangThai === o.value ? "bg-accent text-white" : "text-ink-soft hover:bg-gray-50"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-xs font-medium text-accent hover:underline">
              Xoá lọc ({activeFilterCount})
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select className={selCls} value={f.trangThai} onChange={(e) => set("trangThai", e.target.value)}>
              <option value="">Mọi trạng thái</option>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={selCls} value={f.mucDo} onChange={(e) => set("mucDo", e.target.value)}>
              <option value="">Mọi mức độ</option>
              {sortMucDoOptions(mucDoOpts.data ?? []).map((o) => <option key={o.id} value={o.gia_tri}>{o.gia_tri}</option>)}
            </select>
            <select className={selCls} value={f.nhomVanDe} onChange={(e) => set("nhomVanDe", e.target.value)}>
              <option value="">Mọi nhóm vấn đề</option>
              {(nhomVanDeOpts.data ?? []).map((o) => <option key={o.id} value={o.gia_tri}>{o.gia_tri}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-ink-soft">
              Từ <input type="date" className={selCls} value={f.tuNgay} onChange={(e) => set("tuNgay", e.target.value)} />
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-soft">
              đến <input type="date" className={selCls} value={f.denNgay} onChange={(e) => set("denNgay", e.target.value)} />
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-soft">
              <input type="checkbox" checked={f.chuaDongBo} onChange={(e) => set("chuaDongBo", e.target.checked)} /> Chưa đồng bộ CRM
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-soft">
              <input type="checkbox" checked={f.choTnCskh} onChange={(e) => set("choTnCskh", e.target.checked)} /> Chờ TN CSKH đóng ca
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-soft">
              <input type="checkbox" checked={f.quaHanGiaiTrinh} onChange={(e) => set("quaHanGiaiTrinh", e.target.checked)} /> Quá hạn giải trình
            </label>
            <label className="flex items-center gap-1 text-xs text-ink-soft">
              <input type="checkbox" checked={f.caCuaToi} onChange={(e) => set("caCuaToi", e.target.checked)} /> Ca của tôi
            </label>
            <select className={selCls} value={f.nguoiTaoVaiTro} onChange={(e) => set("nguoiTaoVaiTro", e.target.value)}>
              <option value="">Mọi người tạo</option>
              {NGUOI_TAO_VAI_TRO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={selCls} value={f.tonToiThieu} onChange={(e) => set("tonToiThieu", e.target.value)}>
              <option value="">Mọi thời gian tồn</option>
              {TON_TOI_THIEU_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-ink-soft">
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
            placeholder="Tìm: tên khách · SĐT · ID Lada · mã KN · mã CRM"
          />
          <Btn type="submit" variant="secondary" size="sm">Tìm</Btn>
          <div className="ml-auto flex items-center gap-2">
            <select className={selCls} value={f.sort} onChange={(e) => set("sort", e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={selCls} value={f.pageSize} onChange={(e) => set("pageSize", e.target.value)}>
              {PAGE_SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </form>

        {canBulkChot && selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-sm">
            <span className="font-medium text-ink">Đã chọn {selectedIds.size} đơn</span>
            <Btn
              size="sm"
              variant="primary"
              disabled={bulkChot.isPending}
              onClick={() => bulkChot.mutate([...selectedIds])}
            >
              {bulkChot.isPending ? "Đang chốt..." : "Chốt hàng loạt"}
            </Btn>
            <button type="button" className="text-xs text-ink-soft hover:underline" onClick={() => setSelectedIds(new Set())}>
              Bỏ chọn
            </button>
          </div>
        )}

        {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>}
        {query.isError && <p className="py-8 text-center text-sm text-red-600">Không thể tải dữ liệu.</p>}
        {query.data && (
          <>
            <div className="flex flex-col gap-2 md:hidden">
              {query.data.items.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">Không có dữ liệu</p>}
              {query.data.items.map((r) => (
                <KhieuNaiCard key={r.id} kn={r} onClick={() => setDetailId(r.id)} />
              ))}
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
              <span>Tổng {total} phản ánh — Trang {page}/{totalPages}</span>
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
          <div className="flex items-center gap-3">
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

      <Modal open={!!detailId} onClose={closeDetail} width="full">
        {detailId && (
          <KhieuNaiDetail id={detailId} user={user} onClose={closeDetail} onNavigate={setDetailId} onChanged={() => query.refetch()} />
        )}
      </Modal>
    </div>
  );
}
