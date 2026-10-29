import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { KhieuNai } from "../api/types";
import { fmtVN } from "../lib/formatVN";
import { mucDoTone, MUC_DO_CARD_BG, MUC_DO_CARD_HOVER_BG, vipGlowClass } from "../lib/severity";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Table, type TableColumn } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { KhieuNaiCard } from "./KhieuNaiCard";
import { NGUON_LABEL } from "./KhieuNaiForm";

// "Drill-down" tu man Bao cao: moi con so bam vao -> mo danh sach dung tap ca tao ra con so do, goi
// lai GET /khieu-nai voi cac tham so loc tuong ung (xem addDrillConditions o backend).
export interface DrillSpec {
  title: string;
  params: Record<string, string>;
  // Cac bien the loc trong cung 1 popup (vd "Chi ca co loi" / "Tat ca ca da chot") - ghi de len params.
  variants?: { label: string; params: Record<string, string> }[];
}
export interface DrillState {
  spec: DrillSpec;
  variant: number;
  page: number;
}

const PAGE_SIZE = 50;

interface ListResponse {
  items: KhieuNai[];
  total: number;
  totalIsApprox?: boolean;
}

// Con so bam duoc tren bao cao (gach chan cham, hover doi mau). Khong co onClick -> hien so thuong.
export function DrillNum({ onClick, children, className = "" }: { onClick?: () => void; children: ReactNode; className?: string }) {
  if (!onClick) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`rounded underline decoration-current/40 decoration-dotted underline-offset-[3px] hover:text-accent hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}
    >
      {children}
    </button>
  );
}

export function BaoCaoDrillModal({
  state, open, onChange, onClose, onOpenDetail,
}: {
  state: DrillState;
  open: boolean;
  onChange: (s: DrillState) => void;
  onClose: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { spec, variant, page } = state;
  const params: Record<string, string> = { ...spec.params, ...(spec.variants?.[variant]?.params ?? {}) };

  const query = useQuery({
    queryKey: ["bao-cao-drill", params, page],
    queryFn: () => {
      const p = new URLSearchParams(params);
      p.set("sort", "ngay_tiep_nhan");
      p.set("dir", "desc");
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      return api.get<ListResponse>(`/khieu-nai?${p.toString()}`);
    },
    placeholderData: (prev) => prev,
    enabled: open,
  });
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: TableColumn<KhieuNai>[] = [
    {
      key: "id",
      header: t("list.col.idModelLada"),
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
      render: (r) => (
        <div className="leading-tight">
          <div>{r.ten_khach ?? "—"}</div>
          <div className="text-xs text-ink-soft">{r.tinh_moi || r.tinh || "—"}</div>
        </div>
      ),
    },
    { key: "nguon", header: t("list.col.source"), render: (r) => (r.nguon ? (NGUON_LABEL[r.nguon] ?? r.nguon) : "—") },
    { key: "nhom_van_de", header: t("list.col.issueGroup"), render: (r) => r.nhom_van_de ?? "—" },
    { key: "trang_thai", header: t("list.col.status"), render: (r) => <StatusBadge trangThai={r.trang_thai} /> },
    {
      key: "ngay",
      header: t("report.dailyCol.date"),
      render: (r) => <span className="whitespace-nowrap text-xs text-ink-soft">{fmtVN.date(r.ngay_tiep_nhan)}</span>,
    },
    {
      key: "gio_xu_ly",
      header: t("list.col.processingHours"),
      render: (r) => (
        <span className="text-xs text-ink">{fmtVN.gioXuLy(r.ngay_tiep_nhan, r.trang_thai === "Da ket thuc" ? r.ngay_ket_thuc : null)}</span>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {spec.title}
          {query.data && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
              {t(query.data.totalIsApprox ? "report.drill.approx" : "report.drill.total", { n: total })}
            </span>
          )}
        </span>
      }
    >
      {spec.variants && spec.variants.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-0.5 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line sm:w-fit">
          {spec.variants.map((v, i) => (
            <button
              key={v.label}
              type="button"
              onClick={() => onChange({ ...state, variant: i, page: 1 })}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors lg:px-2.5 lg:py-1 lg:text-xs ${
                variant === i ? "bg-accent text-white shadow-brand" : "text-ink-soft hover:bg-surface hover:text-accent-ink"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {query.isLoading && <p className="py-8 text-center text-sm text-ink-soft">{t("common.loading")}</p>}
      {query.isError && <p className="py-8 text-center text-sm text-red-600">{t("list.loadError")}</p>}
      {query.data && (
        <>
          <div className="flex flex-col gap-2 md:hidden">
            {query.data.items.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">{t("common.noData")}</p>}
            {query.data.items.map((r) => <KhieuNaiCard key={r.id} kn={r} onClick={() => onOpenDetail(r.id)} />)}
          </div>
          <div className="hidden md:block">
            <Table
              columns={columns}
              rows={query.data.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => onOpenDetail(r.id)}
              emptyText={t("common.noData")}
              rowClassName={(r) =>
                `${MUC_DO_CARD_BG[mucDoTone(r.muc_do)]} ${MUC_DO_CARD_HOVER_BG[mucDoTone(r.muc_do)]} ${vipGlowClass(r.phan_loai_kh)} ${r.trang_thai === "Huy" ? "line-through opacity-60" : ""}`
              }
            />
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
              <span>{t("report.drill.page", { page, total: totalPages })}</span>
              <div className="flex gap-2">
                <Btn size="sm" disabled={page <= 1} onClick={() => onChange({ ...state, page: page - 1 })}>{t("list.prev")}</Btn>
                <Btn size="sm" disabled={page >= totalPages} onClick={() => onChange({ ...state, page: page + 1 })}>{t("list.next")}</Btn>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
