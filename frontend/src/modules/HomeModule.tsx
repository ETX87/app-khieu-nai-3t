import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { KhieuNai, KhieuNaiStats } from "../api/types";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Table, type TableColumn } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { ThangFilter } from "../components/ui/ThangFilter";
import { FilterSelect } from "../components/ui/FilterSelect";
import { fmtVN } from "../lib/formatVN";
import { KhieuNaiDetail } from "./KhieuNaiDetail";
import { KhieuNaiForm, type KhieuNaiFormHandle, type KhieuNaiFormHeaderState, NGUON_OPTIONS } from "./KhieuNaiForm";
import { KhieuNaiCard } from "./KhieuNaiCard";
import { KpiCard as StatCard } from "../components/ui/KpiCard";
import { useRef, useState } from "react";
import type { AppUser } from "../api/types";

interface ListResponse {
  items: KhieuNai[];
  total: number;
}

interface HomeProps {
  user: AppUser;
  onOpenList: (filter: { trang_thai?: string; chua_dong_bo?: string; cho_tn_cskh?: boolean; qua_han_giai_trinh?: boolean }) => void;
  onOpenModule: (m: "trang-chu" | "khieu-nai" | "settings" | "users") => void;
}

export function HomeModule({ user, onOpenList, onOpenModule }: HomeProps) {
  const { t } = useTranslation();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const createFormRef = useRef<KhieuNaiFormHandle>(null);
  const [createHeader, setCreateHeader] = useState<KhieuNaiFormHeaderState>({
    missing: [], pendingCount: 0, submitting: false, panelClassName: "bg-surface",
  });
  const { showToast } = useToast();
  const closeDetail = () => setDetailId(null);
  const canCreate = ["CSKH", "NV Sale", "Tổng đài viên", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "");

  const [thang, setThang] = useState("");
  const [nguon, setNguon] = useState(user.cong_ty ?? "");
  const statsQuery = useQuery({
    queryKey: ["khieu-nai-stats", thang, nguon],
    queryFn: () => {
      const q = new URLSearchParams();
      if (thang) q.set("thang", thang);
      if (nguon) q.set("nguon", nguon);
      const qs = q.toString();
      return api.get<KhieuNaiStats>(`/khieu-nai/stats${qs ? `?${qs}` : ""}`);
    },
  });

  const activeQuery = useQuery({
    queryKey: ["khieu-nai", { trang_thai: "Dang xu ly", page: 1, home: true }],
    queryFn: () => api.get<ListResponse>("/khieu-nai?trang_thai=Dang+xu+ly&page=1&pageSize=5"),
  });

  const pendingUsersQuery = useQuery({
    queryKey: ["users", "pending-count"],
    enabled: user.vai_tro === "Admin",
    queryFn: () => api.get<{ count: number }>("/users/pending-count"),
    select: (d) => d.count,
  });

  // "Việc của tôi" theo vai trò.
  const role = user.vai_tro;
  const myQuery = useQuery({
    queryKey: ["khieu-nai", "viec-cua-toi", role, user.email],
    queryFn: () => {
      if (role === "QL") return api.get<ListResponse>("/khieu-nai?trang_thai=Cho+chot+ket+thuc&pageSize=10");
      if (role === "TN CSKH") return api.get<ListResponse>("/khieu-nai?trang_thai=Dang+xu+ly&pageSize=20");
      if (role === "CSKH" || role === "Admin")
        return api.get<ListResponse>("/khieu-nai?trang_thai=Cho+tiep+nhan&pageSize=20");
      return api.get<ListResponse>(
        `/khieu-nai?nguoi_phu_trach=${encodeURIComponent(user.email)}&pageSize=10`,
      );
    },
  });
  const myTitle =
    role === "QL"
      ? t("home.myTitle.ql")
      : role === "TN CSKH"
        ? t("home.myTitle.tncskh")
        : role === "CSKH" || role === "Admin"
          ? t("home.myTitle.cskhAdmin")
          : t("home.myTitle.default");
  const myItems = (myQuery.data?.items ?? []).filter((r) =>
    role === "TN CSKH"
      ? r.loi_nha_san_xuat !== "Chua danh gia" &&
        r.loi_lap_dat !== "Chua danh gia" &&
        r.loi_thai_do_ktv !== "Chua danh gia" &&
        r.loi_quy_trinh_nskx !== "Chua danh gia" &&
        (r.ket_luan_khieu_nai ?? "Chua danh gia") !== "Chua danh gia"
      : true,
  );

  // Dong bo hang loat ca ton CRM, tu chia nhieu luot (moi luot backend xu ly toi da 40 ca) den khi
  // het ca can dong bo. Ca vua dong bo trong 1 phut gan nhat duoc backend bo qua.
  const [dongBo, setDongBo] = useState<{ luot: number; xong: number; tong: number } | null>(null);
  const coTheDongBoTon = ["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "");
  const chayDongBoTon = async () => {
    type Resp = { results: { id: string; ok: boolean; error?: string }[]; bat_dau: string; con_lai: number; bo_qua_gan_day: number };
    let batDau: string | undefined;
    let luot = 0, xong = 0, tong = 0, okN = 0, saiN = 0, loiN = 0, boQua = 0;
    setDongBo({ luot: 1, xong: 0, tong: 0 });
    try {
      for (;;) {
        luot++;
        const d: Resp = await api.post<Resp>("/khieu-nai/dong-bo-cac-ca-ton", batDau ? { bat_dau: batDau } : {});
        if (luot === 1) {
          boQua = d.bo_qua_gan_day;
          tong = d.results.length + d.con_lai;
        }
        batDau = d.bat_dau;
        xong += d.results.length;
        for (const r of d.results) {
          if (r.ok) okN++;
          else if (r.error === "DVBH_NOT_FOUND") saiN++;
          else loiN++;
        }
        setDongBo({ luot: luot + 1, xong, tong: Math.max(tong, xong) });
        // Chan vong lap vo han phong khi du lieu doi lien tuc (toi da 50 luot = 2000 ca).
        if (d.con_lai <= 0 || d.results.length === 0 || luot >= 50) break;
      }
      if (xong === 0) {
        showToast(boQua > 0 ? t("home.toast.noSyncNeededWithSkip", { boQua }) : t("home.toast.noSyncNeeded"), "info");
      } else {
        showToast(
          t("home.toast.syncedSummary", { xong, luot, okN }) +
            (saiN ? t("home.toast.syncedNotFound", { saiN }) : "") +
            (loiN ? t("home.toast.syncedConnError", { loiN }) : "") +
            (boQua ? t("home.toast.syncedSkipped", { boQua }) : ""),
          saiN || loiN ? "info" : "success",
        );
      }
    } catch {
      showToast(xong > 0 ? t("home.toast.syncInterrupted", { xong }) : t("home.toast.syncFailed"), "error");
    } finally {
      setDongBo(null);
      statsQuery.refetch();
      myQuery.refetch();
    }
  };

  const columns: TableColumn<KhieuNai>[] = [
    { key: "id", header: t("home.col.id"), render: (r) => <span className="font-mono text-xs font-semibold text-link">{r.id}</span> },
    { key: "ten_khach", header: t("home.col.customer"), render: (r) => r.ten_khach ?? "—" },
    { key: "van_de_dau_vao", header: t("home.col.issue"), render: (r) => r.van_de_dau_vao ?? "—" },
    { key: "ngay_tiep_nhan", header: t("home.col.received"), render: (r) => r.ngay_tiep_nhan },
    { key: "trang_thai", header: t("home.col.status"), render: (r) => <StatusBadge trangThai={r.trang_thai} /> },
  ];

  const s = statsQuery.data;
  const maxNhom = Math.max(1, ...(s?.theoNhomVanDe.map((x) => x.so_luong) ?? [1]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 relative overflow-hidden rounded-[14px] bg-hero px-6 py-6 text-white shadow-brand sm:flex-row sm:items-center sm:justify-between">
        <span className="pointer-events-none absolute -right-6 -top-10 select-none text-[140px] font-extrabold leading-none text-white/10">3T</span>
        <div className="relative">
          <h2 className="text-xl font-bold">{t("home.heroTitle")}</h2>
          <p className="mt-1 text-sm text-white/80">{t("home.heroSubtitle")}</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="relative shrink-0 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-accent shadow-pop transition hover:-translate-y-0.5"
          >
            {t("home.createNew")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          {t("home.statsLabel")}{" "}
          <b className="text-ink">
            {thang
              ? t("home.monthRange", { m: thang.slice(5), y: thang.slice(0, 4) })
              : t("home.currentMonthRange", { m: s ? s.thang.slice(5) : "...", y: s ? s.thang.slice(0, 4) : "" })}
          </b>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/15 lg:px-2 lg:py-1 lg:text-xs"
            value={nguon} onChange={setNguon} allLabel={t("home.allSources")} options={NGUON_OPTIONS}
          />
          <ThangFilter value={thang} onChange={setThang} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-10">
        <StatCard label={t("home.stat.total")} value={s?.tong ?? 0} tone="brand" icon="tong" onClick={() => onOpenList({})} />
        <StatCard label={t("home.stat.pending")} value={s?.cho_tiep_nhan ?? 0} tone="red" icon="inbox" onClick={() => onOpenList({ trang_thai: "Cho tiep nhan" })} />
        <StatCard label={t("home.stat.processing")} value={s?.dang_xu_ly ?? 0} tone="blue" icon="dangXuLy" onClick={() => onOpenList({ trang_thai: "Dang xu ly" })} />
        <StatCard label={t("home.stat.pendingClose")} value={s?.cho_chot_ket_thuc ?? 0} tone="amber" icon="choChot" onClick={() => onOpenList({ trang_thai: "Cho chot ket thuc" })} />
        <StatCard label={t("home.stat.done")} value={s?.da_ket_thuc ?? 0} tone="green" icon="xong" onClick={() => onOpenList({ trang_thai: "Da ket thuc" })} />
        <StatCard label={t("home.stat.cancelled")} value={s?.huy ?? 0} tone="slate" icon="huy" onClick={() => onOpenList({ trang_thai: "Huy" })} />
        <StatCard label={t("home.stat.pendingSyncCrm")} value={s?.ton_cho_dong_bo ?? 0} tone="cyan" icon="dongBo" onClick={() => onOpenList({ chua_dong_bo: "cho" })} />
        <StatCard label={t("home.stat.crmIdWrong")} value={s?.ton_crm_sai ?? 0} tone="red" icon="canhBao" onClick={() => onOpenList({ chua_dong_bo: "sai" })} />
        <StatCard label={t("home.stat.pendingTnCskh")} value={s?.cho_tn_cskh ?? 0} tone="brand" icon="nguoi" onClick={() => onOpenList({ cho_tn_cskh: true })} />
        <StatCard label={t("home.stat.overdueExplain")} value={s?.qua_han_giai_trinh ?? 0} tone="red" icon="quaHan" onClick={() => onOpenList({ qua_han_giai_trinh: true })} />
      </div>

      {user.vai_tro === "Admin" && (pendingUsersQuery.data ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => onOpenModule("users")}
          className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-800 hover:shadow-md"
        >
          <span>{t("home.pendingUsers", { count: pendingUsersQuery.data })}</span>
          <span className="text-xs">{t("home.openUsers")}</span>
        </button>
      )}

      <Card
        title={t("home.myWork", { title: myTitle })}
        actions={
          coTheDongBoTon ? (
            <Btn
              size="sm"
              variant="secondary"
              disabled={!!dongBo || (s?.ton_dong_crm ?? 0) === 0}
              onClick={() => void chayDongBoTon()}
              className="relative overflow-hidden"
              title={t("home.syncTooltip")}
            >
              {dongBo && dongBo.tong > 0 && (
                <span className="absolute inset-y-0 left-0 bg-brand-100 transition-[width]" style={{ width: `${(dongBo.xong / dongBo.tong) * 100}%` }} />
              )}
              <span className="relative">
                {dongBo
                  ? dongBo.tong
                    ? t("home.syncingDetail", { luot: dongBo.luot, xong: dongBo.xong, tong: dongBo.tong })
                    : t("home.syncingShort", { luot: dongBo.luot })
                  : t("home.syncPending", { n: s?.ton_dong_crm ?? 0 })}
              </span>
            </Btn>
          ) : undefined
        }
      >
        {myQuery.isLoading && <p className="py-4 text-center text-sm text-ink-soft">{t("common.loading")}</p>}
        {myQuery.data && myItems.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-soft">{t("home.noMyWork")}</p>
        )}
        <div className="flex flex-col gap-2">
          {myItems.map((r) => (
            <button
              key={r.id}
              onClick={() => setDetailId(r.id)}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-3 text-left text-base transition-colors hover:border-brand-200 hover:bg-accent-soft/60 lg:py-2 lg:text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono text-xs text-ink-soft">{r.id}</span> · {r.ten_khach ?? "—"} ·{" "}
                {r.van_de_dau_vao ?? r.nhom_van_de ?? "—"}
              </span>
              <span className="shrink-0 text-xs text-ink-soft">{fmtVN.relative(r.ngay_thay_doi)}</span>
              <StatusBadge trangThai={r.trang_thai} />
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={t("home.processingTitle")} className="lg:col-span-2">
          {activeQuery.isLoading && <p className="py-6 text-center text-sm text-ink-soft">{t("common.loading")}</p>}
          {activeQuery.data && (
            <>
              <div className="flex flex-col gap-2 md:hidden">
                {activeQuery.data.items.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">{t("home.noProcessing")}</p>
                )}
                {activeQuery.data.items.map((r) => (
                  <KhieuNaiCard key={r.id} kn={r} onClick={() => setDetailId(r.id)} />
                ))}
              </div>
              <div className="hidden md:block">
                <Table
                  columns={columns}
                  rows={activeQuery.data.items}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => setDetailId(r.id)}
                  emptyText={t("home.noProcessing")}
                />
              </div>
            </>
          )}
        </Card>

        <Card title={t("home.byGroupTitle")}>
          {(s?.theoNhomVanDe.length ?? 0) === 0 && <p className="text-sm text-ink-soft">{t("common.noData")}</p>}
          <div className="space-y-2">
            {s?.theoNhomVanDe.map((row) => (
              <div key={row.nhom_van_de}>
                <div className="mb-0.5 flex items-center justify-between text-xs text-ink-soft">
                  <span className="truncate">{row.nhom_van_de}</span>
                  <span className="font-medium text-ink">{row.so_luong}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-brand-50">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
                    style={{ width: `${(row.so_luong / maxNhom) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

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
          onCreated={(id) => {
            setCreateOpen(false);
            statsQuery.refetch();
            activeQuery.refetch();
            myQuery.refetch();
            setDetailId(id);
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal open={!!detailId} onClose={closeDetail} width="full">
        {detailId && (
          <KhieuNaiDetail
            id={detailId}
            user={user}
            onClose={closeDetail}
            onNavigate={setDetailId}
            onChanged={() => {
              statsQuery.refetch();
              activeQuery.refetch();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
