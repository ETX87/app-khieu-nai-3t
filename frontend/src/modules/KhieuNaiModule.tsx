import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AppUser, KhieuNai } from "../api/types";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { fmtVN } from "../lib/formatVN";
import { mucDoTone, MUC_DO_CARD_BG, vipGlowClass } from "../lib/severity";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Table, type TableColumn } from "../components/ui/Table";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { KhieuNaiForm, type KhieuNaiFormHandle, type KhieuNaiFormHeaderState } from "./KhieuNaiForm";
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
  mucDo: string;
  nhomVanDe: string;
  tuNgay: string;
  denNgay: string;
  chuaDongBo: boolean;
  caCuaToi: boolean;
  nguoiTaoVaiTro: string;
  tonToiThieu: string;
  thangDong: string; // "YYYY-MM" - loc theo thang cua ngay_ket_thuc
  q: string;
  sort: string; // "field|dir"
  pageSize: string;
}

const EMPTY_FILTERS: Filters = {
  trangThai: "", mucDo: "", nhomVanDe: "", tuNgay: "", denNgay: "",
  chuaDongBo: false, caCuaToi: false, nguoiTaoVaiTro: "", tonToiThieu: "", thangDong: "",
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

export function KhieuNaiModule({ user, initialFilter }: { user: AppUser; initialFilter?: { trang_thai?: string } | null }) {
  const [f, setF] = useState<Filters>(loadFilters);
  const [qInput, setQInput] = useState(f.q);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const closeDetail = () => setDetailId(null);

  const createFormRef = useRef<KhieuNaiFormHandle>(null);
  const [createHeader, setCreateHeader] = useState<KhieuNaiFormHeaderState>({ missing: [], pendingCount: 0, submitting: false });

  const mucDoOpts = useSettingsOptions("muc_do");
  const nhomVanDeOpts = useSettingsOptions("nhom_van_de");

  const canCreate = !!user.vai_tro && user.vai_tro !== "Viewer";

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };

  // KPI ở Trang chủ bấm sang -> áp trạng thái.
  useEffect(() => {
    if (initialFilter?.trang_thai !== undefined) {
      setF((p) => ({ ...EMPTY_FILTERS, sort: p.sort, pageSize: p.pageSize, trangThai: initialFilter.trang_thai ?? "" }));
      setPage(1);
    }
  }, [initialFilter]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* ignore */ }
  }, [f]);

  const [sortField, sortDir] = f.sort.split("|");

  const query = useQuery({
    queryKey: ["khieu-nai", { ...f, page }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (f.trangThai) p.set("trang_thai", f.trangThai);
      if (f.mucDo) p.set("muc_do", f.mucDo);
      if (f.nhomVanDe) p.set("nhom_van_de", f.nhomVanDe);
      if (f.tuNgay) p.set("tu_ngay", f.tuNgay);
      if (f.denNgay) p.set("den_ngay", f.denNgay);
      if (f.chuaDongBo) p.set("chua_dong_bo", "1");
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
          <div className="text-xs text-ink-soft">{r.tinh ?? "—"}</div>
        </div>
      ),
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
    [f.trangThai, f.mucDo, f.nhomVanDe, f.tuNgay, f.denNgay, f.nguoiTaoVaiTro, f.tonToiThieu, f.thangDong, f.q].filter(Boolean).length +
    (f.chuaDongBo ? 1 : 0) + (f.caCuaToi ? 1 : 0);

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
          <select className={selCls} value={f.trangThai} onChange={(e) => set("trangThai", e.target.value)}>
            <option value="">Mọi trạng thái</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className={selCls} value={f.mucDo} onChange={(e) => set("mucDo", e.target.value)}>
            <option value="">Mọi mức độ</option>
            {(mucDoOpts.data ?? []).map((o) => <option key={o.id} value={o.gia_tri}>{o.gia_tri}</option>)}
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
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-xs font-medium text-accent hover:underline">
              Xoá lọc ({activeFilterCount})
            </button>
          )}
        </div>

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
                rowClassName={(r) => `${MUC_DO_CARD_BG[mucDoTone(r.muc_do)]} ${vipGlowClass(r.phan_loai_kh)}`}
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
