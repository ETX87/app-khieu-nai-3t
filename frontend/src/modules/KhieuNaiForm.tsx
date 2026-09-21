import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
  type FormEvent, type KeyboardEvent,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { KhieuNai, SettingsNhom } from "../api/types";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Combobox } from "../components/ui/Combobox";
import { useToast } from "../components/ui/Toast";
import { fmtVN, translateDanhGia } from "../lib/formatVN";
import { STATUS_LABEL } from "../components/ui/Badge";
import { Timeline, type TimelineEvent } from "../components/ui/Timeline";
import { mucDoTone, MUC_DO_BG, vipGlowClass, sortMucDoOptions } from "../lib/severity";

export interface KhieuNaiFormHandle {
  submit: () => void;
  cancel: () => void;
}
export interface KhieuNaiFormHeaderState {
  missing: string[];
  pendingCount: number;
  submitting: boolean;
  panelClassName: string; // nen/vien theo Muc do + KH VIP - ap vao khung popup ngoai cung (Modal)
}

interface FormState {
  id_crm_karofi: string;
  id_lada: string;
  // Chi dung de tra cuu (goi lai dung API nhu ID Lada) - KHONG luu vao khieu_nai, khong gui len
  // server (backend chi doc tung truong body.xxx cu the, key la nay bi bo qua an toan).
  id_truy_van: string;
  nguon: string;
  ten_khach: string;
  sdt_khach: string;
  phan_loai_kh: string;
  tinh: string;
  quan_huyen: string;
  phuong_xa: string;
  tinh_moi: string;
  phuong_xa_moi: string;
  hang: string;
  model: string;
  thong_tin_ban_dau: string;
  ghi_chu_nguoi_tao: string;
  nhom_yeu_cau: string;
  nhom_van_de: string;
  van_de_dau_vao: string;
  muc_do: string;
  sale_khu_vuc: string;
  nguoi_bao: string;
}

export const NGUON_OPTIONS = [
  { value: "Lada", label: "Lada" },
  { value: "CRM", label: "CRM Karofi" },
];

const EMPTY: FormState = {
  id_crm_karofi: "", id_lada: "", id_truy_van: "", nguon: "",
  ten_khach: "", sdt_khach: "", phan_loai_kh: "Thường",
  tinh: "", quan_huyen: "", phuong_xa: "",
  tinh_moi: "", phuong_xa_moi: "",
  hang: "", model: "",
  thong_tin_ban_dau: "", ghi_chu_nguoi_tao: "",
  nhom_yeu_cau: "", nhom_van_de: "", van_de_dau_vao: "", muc_do: "Trung bình",
  sale_khu_vuc: "", nguoi_bao: "",
};

const DRAFT_KEY = "khieunai_draft_new";

const REQUIRED: { key: keyof FormState; label: string }[] = [
  { key: "ten_khach", label: "Tên khách hàng" },
  { key: "nhom_van_de", label: "Nhóm vấn đề" },
  { key: "thong_tin_ban_dau", label: "Thông tin ban đầu" },
];

// Field bat buoc nam o tab "phai" (Phan loai van de / Noi dung phan anh) tren mobile - con lai
// (ten_khach) thuoc tab "trai" (Khach hang & San pham). Dung de dieu huong tab khi thieu du lieu.
const RIGHT_TAB_KEYS = new Set<keyof FormState>(["nhom_van_de", "thong_tin_ban_dau"]);

const CRM_WARNING_MESSAGES: Record<string, string> = {
  DVBH_NOT_FOUND: "Không tìm thấy case trên CRM Karofi",
  DVBH_LOOKUP_FAILED: "Không thể kết nối CRM Karofi lúc này",
};

type PendingOpt = { nhom: SettingsNhom; gia_tri: string; parent?: string };

interface DraftShape {
  form: FormState;
  pendingOpts: PendingOpt[];
}

interface TraCuuTienTrinh {
  ngay_tao: string;
  nguoi_tao: string;
  noi_dung_ghi_chep: string | null;
  ly_do_xu_ly_cham: string | null;
}
interface TraCuuRecent {
  id: string;
  ngay_tiep_nhan: string | null;
  trang_thai: string | null;
  nhom_van_de: string | null;
  van_de_dau_vao: string | null;
  thong_tin_ban_dau: string | null;
  nguoi_tao: string | null;
  // Them de so sanh voi don dang tao (item: hien day du hon thay vi chi tom tat van de).
  ten_khach: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  phuong_xa: string | null;
  tinh_moi: string | null;
  phuong_xa_moi: string | null;
  hang: string | null;
  model: string | null;
  ket_luan_khieu_nai: string | null;
  loi_nha_san_xuat: string | null;
  loi_lap_dat: string | null;
  loi_thai_do_ktv: string | null;
  loi_quy_trinh_nskx: string | null;
  tien_trinh: TraCuuTienTrinh[];
}
interface TraCuuCrmPreview {
  khach_hang: string | null;
  ky_thuat_vien: string | null;
  tien_do_hoan_thanh: string | null;
  noi_dung_xu_ly: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  thoi_gian_hoan_thanh: string | null;
  mo_ta_loi: string | null;
  khu_vuc: string | null;
  loai_yeu_cau: string | null;
  thoi_gian_hen_xu_ly: string | null;
  ly_do_qua_han: string | null;
  link_crm: string | null;
}
interface TraCuuGiaiTrinh {
  ly_do_cham: string;
  noi_dung: string | null;
  ngay_giai_trinh: string;
  nguoi_giai_trinh?: string;
}
interface TraCuuResponse {
  found: boolean;
  source: "lada" | "crm";
  fill?: Record<string, string>;
  recent?: TraCuuRecent[];
  preview?: TraCuuCrmPreview;
  giaiTrinh?: TraCuuGiaiTrinh[];
  warning?: string;
}

// yyyy-mm-dd hh:mm:ss (naive, gio VN) -> epoch ms de tinh khoang cach giua 2 moc cho Timeline.
function parseVnNaive(s: string | null | undefined): number {
  if (!s) return 0;
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

// Cac field cho phep tra cuu tu dien de (chi dien vao o dang trong).
const FILLABLE = new Set<keyof FormState>([
  "ten_khach", "sdt_khach", "phan_loai_kh", "tinh", "quan_huyen", "phuong_xa",
  "tinh_moi", "phuong_xa_moi", "hang", "model", "sale_khu_vuc",
]);

function loadDraft(): DraftShape | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Ho tro ca dinh dang cu (chi luu FormState) lan moi ({form, pendingOpts}).
    if (parsed && typeof parsed === "object" && "form" in parsed) {
      return {
        form: { ...EMPTY, ...(parsed.form ?? {}) },
        pendingOpts: Array.isArray(parsed.pendingOpts) ? parsed.pendingOpts : [],
      };
    }
    return { form: { ...EMPTY, ...parsed }, pendingOpts: [] };
  } catch {
    return null;
  }
}

type AddrTab = "cu" | "moi";
const ADDRESS_TABS: { key: AddrTab; label: string }[] = [
  { key: "cu", label: "Địa chính cũ" },
  { key: "moi", label: "Địa chính mới" },
];

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const KhieuNaiForm = forwardRef<KhieuNaiFormHandle, {
  onCreated: (id: string) => void;
  onCancel: () => void;
  onStateChange?: (s: KhieuNaiFormHeaderState) => void;
}>(function KhieuNaiForm({ onCreated, onCancel, onStateChange }, ref) {
  const draftRef = useRef<DraftShape | null>(loadDraft());
  const formElRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<FormState>(() => draftRef.current?.form ?? { ...EMPTY });
  const [pendingOpts, setPendingOpts] = useState<PendingOpt[]>(() => draftRef.current?.pendingOpts ?? []);
  const [restored, setRestored] = useState(!!draftRef.current);
  const [addrTab, setAddrTab] = useState<AddrTab>("cu");
  // Man hinh tao PA tren mobile qua dai neu de 1 cot - chia 2 tab (giong 2 cot tren desktop), luu
  // van phai du field bat buoc o CA 2 tab (validation khong doi, chi UX dieu huong khi thieu).
  const [mobileTab, setMobileTab] = useState<"left" | "right">("left");
  const { showToast } = useToast();
  const qc = useQueryClient();

  const mucDoOpts = useSettingsOptions("muc_do");
  const nhomYeuCauOpts = useSettingsOptions("nhom_yeu_cau");
  const phanLoaiKhOpts = useSettingsOptions("phan_loai_kh");
  const nhomVanDeOpts = useSettingsOptions("nhom_van_de");
  const vanDeDauVaoOpts = useSettingsOptions("van_de_dau_vao");
  const saleKhuVucOpts = useSettingsOptions("sale_khu_vuc");
  const modelOpts = useSettingsOptions("model");
  const hangOpts = useSettingsOptions("hang");
  const tinhOpts = useSettingsOptions("tinh");
  // Cascading: huyen theo tinh, xa theo huyen. Chua chon cap tren -> khong goi API.
  const quanHuyenOpts = useSettingsOptions("quan_huyen", form.tinh);
  const phuongXaOpts = useSettingsOptions("phuong_xa", form.quan_huyen);
  // Địa chính mới (2025): bỏ cấp huyện — tỉnh → phường/xã.
  const tinhMoiOpts = useSettingsOptions("tinh_moi");
  const phuongXaMoiOpts = useSettingsOptions("phuong_xa_moi", form.tinh_moi);

  const filteredVanDeDauVao = (vanDeDauVaoOpts.data ?? []).filter(
    (o) => !form.nhom_van_de || o.parent === form.nhom_van_de,
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addPending = (nhom: SettingsNhom, gia_tri: string, parent?: string) => {
    setPendingOpts((prev) =>
      prev.some((p) => p.nhom === nhom && p.gia_tri === gia_tri && (p.parent ?? "") === (parent ?? ""))
        ? prev
        : [...prev, { nhom, gia_tri, parent }],
    );
  };

  // Gop danh sach tu server voi cac lua chon nguoi dung vua them (chua luu DB).
  const optsFor = (
    fetched: { gia_tri: string }[] | undefined,
    nhom: SettingsNhom,
    parent?: string,
  ) => {
    const base = (fetched ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }));
    const extra = pendingOpts
      .filter((p) => p.nhom === nhom && (parent === undefined || (p.parent ?? "") === parent))
      .filter((p) => !base.some((b) => b.value === p.gia_tri))
      .map((p) => ({ value: p.gia_tri, label: `${p.gia_tri} — mới` }));
    return [...base, ...extra];
  };

  // ── Tra cuu ID (item 8 + 10) ────────────────────────────────────────────────
  // Khong tu dien ngay khi tim thay (item: neu dang nhap do ma go nham ID, tim ra thong tin sai se
  // de nhap nham vao form) - chi dien sau khi nguoi dung bam nut "Xac nhan dien thong tin".
  const [lookup, setLookup] = useState<TraCuuResponse | null>(null);
  const [lookupBusy, setLookupBusy] = useState<"lada" | "crm" | "truy_van" | null>(null);
  const [filledFromLookup, setFilledFromLookup] = useState(false);
  const lookupSeq = useRef(0);

  // "truy_van" (item 6, 2026-09-21) - o nhap rieng, chi de tra cuu, goi LAI DUNG API id_lada nhu ID
  // Lada (cung backend /tra-cuu?id_lada=...) nhung gia tri khong ghi vao id_lada cua don.
  const runLookup = async (kind: "lada" | "crm" | "truy_van") => {
    const value = (kind === "crm" ? form.id_crm_karofi : kind === "lada" ? form.id_lada : form.id_truy_van).trim();
    if (!value) return;
    const seq = ++lookupSeq.current;
    setLookupBusy(kind);
    try {
      const qs = kind === "crm" ? `id_crm=${encodeURIComponent(value)}` : `id_lada=${encodeURIComponent(value)}`;
      const res = await api.get<TraCuuResponse>(`/khieu-nai/tra-cuu?${qs}`);
      if (seq !== lookupSeq.current) return;
      setLookup(res);
      setFilledFromLookup(false);
      if (res.found) {
        showToast("Đã tìm thấy thông tin — xem bên dưới và bấm \"Xác nhận điền thông tin\" nếu đúng", "info");
      } else {
        showToast(
          kind === "crm"
            ? CRM_WARNING_MESSAGES[res.warning ?? ""] ?? "Không tìm thấy trên CRM Karofi"
            : "Chưa có phản ánh nào cùng ID này",
          "info",
        );
      }
    } catch {
      if (seq === lookupSeq.current) {
        setLookup({ found: false, source: kind === "crm" ? "crm" : "lada", warning: "LOOKUP_ERROR" });
        showToast("Tra cứu thất bại, thử lại sau", "error");
      }
    } finally {
      if (seq === lookupSeq.current) setLookupBusy(null);
    }
  };

  // Nguoi dung bam "Xac nhan dien thong tin" sau khi doi chieu ket qua tra cuu voi du lieu dang nhap.
  const applyLookupFill = () => {
    if (!lookup?.found || !lookup.fill) return;
    const next = { ...form };
    let filledCount = 0;
    for (const [k, v] of Object.entries(lookup.fill)) {
      const key = k as keyof FormState;
      if (!FILLABLE.has(key) || !v) continue;
      // Model tra tu CRM la nguon xac thuc (model may thuc te) -> luon ghi de, cac field khac chi
      // dien khi dang trong de khong mat du lieu nguoi dung da go tay.
      const alwaysOverwrite = lookup.source === "crm" && key === "model";
      if (alwaysOverwrite ? v !== next[key] : next[key].trim() === "") {
        next[key] = v;
        filledCount++;
      }
    }
    if (filledCount > 0) setForm(next);
    setFilledFromLookup(true);
    showToast(
      filledCount > 0
        ? `Đã điền ${filledCount} thông tin từ ${lookup.source === "lada" ? "đơn cũ" : "CRM Karofi"}`
        : "Không có ô nào cần điền thêm (đã có dữ liệu)",
      "success",
    );
  };

  // Tự lưu nháp.
  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY) || pendingOpts.length > 0;
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, pendingOpts } satisfies DraftShape));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, [form, pendingOpts, dirty]);

  const missing = REQUIRED.filter((r) => form[r.key].trim() === "");
  const leftMissing = missing.filter((m) => !RIGHT_TAB_KEYS.has(m.key));
  const rightMissing = missing.filter((m) => RIGHT_TAB_KEYS.has(m.key));
  const diaCuCount = [form.tinh, form.quan_huyen, form.phuong_xa].filter((v) => v.trim() !== "").length;
  const diaMoiCount = [form.tinh_moi, form.phuong_xa_moi].filter((v) => v.trim() !== "").length;

  const mutation = useMutation({
    mutationFn: async () => {
      // item 6: chỉ khi bấm Lưu mới ghi các lựa chọn mới vào settings (tránh rác).
      for (const p of pendingOpts) {
        try {
          await api.post("/settings/options", { nhom: p.nhom, gia_tri: p.gia_tri, parent: p.parent });
        } catch {
          /* không chặn việc tạo phản ánh */
        }
      }
      const body: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(form)) {
        body[k] = v.trim() === "" ? undefined : v.trim();
      }
      return api.post<{ khieuNai: KhieuNai; crm_sync_warning?: string }>("/khieu-nai", body);
    },
    onSuccess: (data) => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["settings-options"] });
      if (data.crm_sync_warning) {
        showToast(CRM_WARNING_MESSAGES[data.crm_sync_warning] ?? data.crm_sync_warning, "error");
      } else {
        showToast("Đã tạo phản ánh thành công", "success");
      }
      onCreated(data.khieuNai.id);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.code : "Có lỗi xảy ra";
      showToast(`Tạo phản ánh thất bại: ${msg}`, "error");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (missing.length > 0) {
      // Tren mobile chi 1 tab hien tai - nhay sang tab chua field con thieu dau tien de nguoi dung
      // thay ngay, khong phai tu do "Con thieu ..." roi tu tim tab.
      setMobileTab(RIGHT_TAB_KEYS.has(missing[0].key) ? "right" : "left");
      showToast(`Còn thiếu: ${missing.map((m) => m.label).join(", ")}`, "error");
      return;
    }
    mutation.mutate();
  };

  // Enter ở ô một dòng chỉ chuyển field, không submit form.
  const onFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === "Enter" && t.tagName === "INPUT" && (t as HTMLInputElement).type !== "submit") {
      e.preventDefault();
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm("Bỏ phản ánh đang nhập? Nháp vẫn được giữ để mở lại sau.")) return;
    onCancel();
  };

  useImperativeHandle(ref, () => ({
    submit: () => formElRef.current?.requestSubmit(),
    cancel,
  }), [cancel]);

  // Phan hoi tuc thi khi chon Muc do / Phan loai KH (VIP): to mau + vien ngay trong luc nhap, ap
  // vao khung POPUP NGOAI CUNG (qua onStateChange -> Modal panelClassName ở component cha) thay vi
  // to len vung nhap lieu ben trong - vung nhap giu nguyen nen trang/xam mac dinh de de doc.
  const formTone = mucDoTone(form.muc_do);
  // Luon tra ve dung 1 class bg-* (khong bao gio ""), item: Modal khong con tu dat san bg-surface
  // rieng nua nen panelClassName phai la nguon duy nhat cung cap mau nen cho popup.
  const formSeverityBg = formTone === "gray" ? "bg-surface" : MUC_DO_BG[formTone];
  const formVipGlow = vipGlowClass(form.phan_loai_kh);
  const panelClassName = `${formSeverityBg} ${formVipGlow}`.trim();

  const missingKey = missing.map((m) => m.key).join(",");
  useEffect(() => {
    onStateChange?.({
      missing: missing.map((m) => m.label),
      pendingCount: pendingOpts.length,
      submitting: mutation.isPending,
      panelClassName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, pendingOpts.length, mutation.isPending, panelClassName]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setForm({ ...EMPTY });
    setPendingOpts([]);
    setLookup(null);
    setRestored(false);
  };

  const legendCls = "mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft";
  // Nen trang (item: giu mac dinh trang cho khoi nhap lieu, khong to mau nen khoi).
  const fsCls = "rounded-lg border border-line bg-white p-3";
  const rowCls = "flex flex-wrap items-start gap-x-3 gap-y-2.5";
  // Khổ ô nhập gọn: đủ đọc giá trị, không kéo dài chiếm diện tích như trước.
  const W_XS = "block w-24"; // Phân loại KH
  const W_SM = "block w-36"; // SĐT, Tỉnh/Huyện/Xã, Mức độ, Nhóm yêu cầu, Người báo
  const W_MD = "block w-56"; // Tên khách hàng, Nhóm vấn đề, Vấn đề đầu vào, Hãng, Model, Sale khu vực

  return (
    <form ref={formElRef} onSubmit={submit} onKeyDown={onFormKeyDown} className="flex h-full min-h-0 flex-col">
      {restored && (
        <div className="mb-2 flex shrink-0 items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-300">
          <span>Đã khôi phục nội dung nhập dở lần trước.</span>
          <button type="button" onClick={clearDraft} className="font-medium underline">
            Xoá &amp; nhập mới
          </button>
        </div>
      )}

      {/* Mobile (<lg): 2 tab thay vi cuon 1 cot qua dai; desktop (lg+) van hien ca 2 cot song song
          nhu cu, khong dung tab. Field bat buoc nam ca 2 ben nen bam Luu se tu chuyen sang tab con
          thieu (xem submit()). */}
      <div className="mb-2 flex shrink-0 gap-1.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("left")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
            mobileTab === "left" ? "bg-accent text-white" : "bg-surface-2 text-ink-soft"
          }`}
        >
          Khách hàng &amp; Sản phẩm{leftMissing.length > 0 ? ` (${leftMissing.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("right")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${
            mobileTab === "right" ? "bg-accent text-white" : "bg-surface-2 text-ink-soft"
          }`}
        >
          Vấn đề &amp; Nội dung{rightMissing.length > 0 ? ` (${rightMissing.length})` : ""}
        </button>
      </div>

      {/* 2 mảng độc lập: trái = KH + SP, phải = vấn đề + nội dung — mỗi bên cuộn riêng */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Trái: Tra cứu · Khách hàng/Địa chỉ · Sản phẩm · Nội bộ ─────────── */}
        <div
          className={`min-h-0 flex-col gap-3 overflow-y-auto pb-1 pr-1 lg:flex lg:pr-3 ${
            mobileTab === "left" ? "flex" : "hidden"
          }`}
        >
          {/* Tra cứu ID — ô gọn, nút kính lúp */}
          <fieldset className="rounded-lg border border-accent/40 bg-white p-2.5">
            <legend className={legendCls}>Tra cứu nhanh theo ID</legend>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <div className="block">
                <span className="mb-0.5 block text-xs font-medium text-ink-soft">ID CRM Karofi</span>
                <div className="flex gap-1">
                  <Input
                    className="w-32 !py-1"
                    value={form.id_crm_karofi}
                    onChange={(e) => {
                      const v = e.target.value;
                      setField("id_crm_karofi", v);
                      if (v.trim() !== "" && form.id_crm_karofi.trim() === "" && form.nguon === "") setField("nguon", "CRM");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runLookup("crm"); } }}
                  />
                  <button
                    type="button"
                    aria-label="Tra cứu ID CRM Karofi"
                    title="Tra cứu"
                    onClick={() => void runLookup("crm")}
                    disabled={!form.id_crm_karofi.trim() || lookupBusy === "crm"}
                    className="flex items-center justify-center rounded-md border border-line bg-white px-2 text-ink-soft hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {lookupBusy === "crm" ? "…" : <SearchIcon />}
                  </button>
                </div>
              </div>
              <div className="block">
                <span className="mb-0.5 block text-xs font-medium text-ink-soft">ID Lada</span>
                <div className="flex gap-1">
                  <Input
                    className="w-32 !py-1"
                    value={form.id_lada}
                    onChange={(e) => {
                      const v = e.target.value;
                      setField("id_lada", v);
                      if (v.trim() !== "" && form.id_lada.trim() === "" && form.nguon === "") setField("nguon", "Lada");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runLookup("lada"); } }}
                  />
                  <button
                    type="button"
                    aria-label="Tra cứu ID Lada"
                    title="Tra cứu"
                    onClick={() => void runLookup("lada")}
                    disabled={!form.id_lada.trim() || lookupBusy === "lada"}
                    className="flex items-center justify-center rounded-md border border-line bg-white px-2 text-ink-soft hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {lookupBusy === "lada" ? "…" : <SearchIcon />}
                  </button>
                </div>
              </div>
              <div className="block">
                <span className="mb-0.5 block text-xs font-medium text-ink-soft">ID Truy vấn</span>
                <div className="flex gap-1">
                  <Input
                    className="w-32 !py-1"
                    value={form.id_truy_van}
                    onChange={(e) => {
                      const v = e.target.value;
                      setField("id_truy_van", v);
                      if (v.trim() !== "" && form.id_truy_van.trim() === "" && form.nguon === "") setField("nguon", "Lada");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runLookup("truy_van"); } }}
                  />
                  <button
                    type="button"
                    aria-label="Tra cứu ID truy vấn"
                    title="Tra cứu"
                    onClick={() => void runLookup("truy_van")}
                    disabled={!form.id_truy_van.trim() || lookupBusy === "truy_van"}
                    className="flex items-center justify-center rounded-md border border-line bg-white px-2 text-ink-soft hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {lookupBusy === "truy_van" ? "…" : <SearchIcon />}
                  </button>
                </div>
              </div>
              <div className="block">
                <span className="mb-0.5 block text-xs font-medium text-ink-soft">Nguồn</span>
                <Select
                  className="w-32 !py-1"
                  options={NGUON_OPTIONS}
                  placeholder="— Chọn —"
                  value={form.nguon}
                  onChange={(e) => setField("nguon", e.target.value)}
                />
              </div>
              <p className="mb-1 max-w-[14rem] text-[11px] leading-tight text-ink-faint">
                Nhập ID rồi Enter / bấm kính lúp — tự điền vào các ô còn trống.
              </p>
            </div>

            {lookup && <LookupResult res={lookup} onApplyFill={applyLookupFill} applied={filledFromLookup} />}
          </fieldset>

          {/* Khách hàng (luôn hiện, trái) + Địa chính (tab, phải) */}
          <fieldset className={fsCls}>
            <legend className={legendCls}>Thông tin khách hàng &amp; địa chỉ</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Khách hàng</p>
                <div className={rowCls}>
                  <Field label="Tên khách hàng *" className={W_MD}>
                    <Input value={form.ten_khach} onChange={(e) => setField("ten_khach", e.target.value)} autoFocus />
                  </Field>
                  <Field label="Số điện thoại" hint="Có thể bổ sung sau" className={W_SM}>
                    <Input value={form.sdt_khach} onChange={(e) => setField("sdt_khach", e.target.value)} inputMode="tel" />
                  </Field>
                  <Field label="Phân loại KH" className={W_XS}>
                    <Combobox
                      options={(phanLoaiKhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                      value={form.phan_loai_kh}
                      onChange={(v) => setField("phan_loai_kh", v)}
                    />
                  </Field>
                </div>
              </div>

              <div>
                <div className="mb-2 flex gap-1 border-b border-line">
                  {ADDRESS_TABS.map((t) => {
                    const count = t.key === "cu" ? diaCuCount : diaMoiCount;
                    const active = addrTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setAddrTab(t.key)}
                        className={`-mb-px border-b-2 px-2 py-1.5 text-xs ${
                          active
                            ? "border-accent font-semibold text-accent"
                            : count > 0
                              ? "border-transparent font-semibold text-ink hover:text-accent"
                              : "border-transparent font-medium text-ink-soft hover:text-ink"
                        }`}
                      >
                        {t.label}
                        {count > 0 ? ` (${count})` : ""}
                      </button>
                    );
                  })}
                </div>

                {addrTab === "cu" && (
                  <div className={rowCls}>
                    <Field label="Tỉnh / Thành phố" hint="Gõ để tìm / thêm mới" className={W_SM}>
                      <Combobox
                        options={optsFor(tinhOpts.data, "tinh")}
                        value={form.tinh}
                        onChange={(v) => setForm((p) => ({ ...p, tinh: v, quan_huyen: "", phuong_xa: "" }))}
                        creatable
                        onCreate={(v) => addPending("tinh", v)}
                      />
                    </Field>
                    <Field label="Quận / Huyện" hint={form.tinh ? "Gõ để tìm / thêm mới" : "Chọn Tỉnh trước"} className={W_SM}>
                      <Combobox
                        options={optsFor(quanHuyenOpts.data, "quan_huyen", form.tinh)}
                        value={form.quan_huyen}
                        onChange={(v) => setForm((p) => ({ ...p, quan_huyen: v, phuong_xa: "" }))}
                        disabled={!form.tinh}
                        creatable
                        onCreate={(v) => addPending("quan_huyen", v, form.tinh)}
                      />
                    </Field>
                    <Field label="Phường / Xã" hint={form.quan_huyen ? "Gõ để tìm / thêm mới" : "Chọn Quận/Huyện trước"} className={W_SM}>
                      <Combobox
                        options={optsFor(phuongXaOpts.data, "phuong_xa", form.quan_huyen)}
                        value={form.phuong_xa}
                        onChange={(v) => setField("phuong_xa", v)}
                        disabled={!form.quan_huyen}
                        creatable
                        onCreate={(v) => addPending("phuong_xa", v, form.quan_huyen)}
                      />
                    </Field>
                  </div>
                )}

                {addrTab === "moi" && (
                  <div className={rowCls}>
                    <Field label="Tỉnh / Thành phố" hint="Gõ để tìm / thêm mới" className={W_SM}>
                      <Combobox
                        options={optsFor(tinhMoiOpts.data, "tinh_moi")}
                        value={form.tinh_moi}
                        onChange={(v) => setForm((p) => ({ ...p, tinh_moi: v, phuong_xa_moi: "" }))}
                        creatable
                        onCreate={(v) => addPending("tinh_moi", v)}
                      />
                    </Field>
                    <Field label="Phường / Xã" hint={form.tinh_moi ? "Gõ để tìm / thêm mới" : "Chọn Tỉnh trước"} className={W_SM}>
                      <Combobox
                        options={optsFor(phuongXaMoiOpts.data, "phuong_xa_moi", form.tinh_moi)}
                        value={form.phuong_xa_moi}
                        onChange={(v) => setField("phuong_xa_moi", v)}
                        disabled={!form.tinh_moi}
                        creatable
                        onCreate={(v) => addPending("phuong_xa_moi", v, form.tinh_moi)}
                      />
                    </Field>
                    <p className="mb-1 w-full text-[11px] leading-tight text-ink-faint">
                      Điền theo địa chính cũ, mới, hoặc cả hai — không bắt buộc.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className={fsCls}>
            <legend className={legendCls}>Sản phẩm</legend>
            <div className={rowCls}>
              <Field label="Hãng" hint="Gõ để tìm / thêm mới" className={W_MD}>
                <Combobox
                  options={optsFor(hangOpts.data, "hang")}
                  value={form.hang}
                  onChange={(v) => setField("hang", v)}
                  creatable
                  onCreate={(v) => addPending("hang", v)}
                />
              </Field>
              <Field label="Model" hint="Gõ để tìm / thêm mới" className={W_MD}>
                <Combobox
                  options={optsFor(modelOpts.data, "model")}
                  value={form.model}
                  onChange={(v) => setField("model", v)}
                  creatable
                  onCreate={(v) => addPending("model", v)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className={fsCls}>
            <legend className={legendCls}>Nội bộ</legend>
            <div className={rowCls}>
              <Field label="Sale khu vực" hint="Gõ để tìm / thêm mới" className={W_MD}>
                <Combobox
                  options={optsFor(saleKhuVucOpts.data, "sale_khu_vuc")}
                  value={form.sale_khu_vuc}
                  onChange={(v) => setField("sale_khu_vuc", v)}
                  creatable
                  onCreate={(v) => addPending("sale_khu_vuc", v)}
                />
              </Field>
              <Field label="Người báo" className={W_SM}>
                <Input value={form.nguoi_bao} onChange={(e) => setField("nguoi_bao", e.target.value)} />
              </Field>
            </div>
            <p className="mt-2 text-[11px] leading-tight text-ink-soft">
              Ngày tiếp nhận &amp; các dữ liệu CRM khác được hệ thống tự đồng bộ, không cần nhập.
            </p>
          </fieldset>
        </div>

        {/* ── Phải: Phân loại vấn đề · Nội dung phản ánh — cố định, cuộn riêng ── */}
        <div
          className={`min-h-0 flex-col gap-3 overflow-y-auto pb-1 pl-1 lg:flex lg:border-l lg:border-line lg:pl-4 ${
            mobileTab === "right" ? "flex" : "hidden"
          }`}
        >
          <fieldset className={fsCls}>
            <legend className={legendCls}>Phân loại vấn đề</legend>
            <div className={rowCls}>
              <Field label="Nhóm yêu cầu" className={W_SM}>
                <Combobox
                  options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                  value={form.nhom_yeu_cau} onChange={(v) => setField("nhom_yeu_cau", v)}
                />
              </Field>
              <Field label="Nhóm vấn đề *" className={W_MD}>
                <Combobox
                  options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                  value={form.nhom_van_de}
                  onChange={(v) => { setField("nhom_van_de", v); setField("van_de_dau_vao", ""); }}
                />
              </Field>
              <Field label="Vấn đề đầu vào" className={W_MD}>
                <Combobox
                  options={filteredVanDeDauVao.map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                  value={form.van_de_dau_vao}
                  onChange={(v) => setField("van_de_dau_vao", v)}
                  disabled={!form.nhom_van_de}
                />
              </Field>
              <Field label="Mức độ" className={W_SM}>
                <Combobox
                  options={sortMucDoOptions(mucDoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                  value={form.muc_do} onChange={(v) => setField("muc_do", v)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className={fsCls}>
            <legend className={legendCls}>Nội dung phản ánh</legend>
            <div className="flex flex-col gap-2.5">
              <Field label="Thông tin ban đầu *">
                <Textarea rows={3} value={form.thong_tin_ban_dau} onChange={(e) => setField("thong_tin_ban_dau", e.target.value)} />
              </Field>
              <Field label="Ghi chú người tạo">
                <Textarea rows={3} value={form.ghi_chu_nguoi_tao} onChange={(e) => setField("ghi_chu_nguoi_tao", e.target.value)} />
              </Field>
            </div>
          </fieldset>
        </div>
      </div>
    </form>
  );
});

function LookupResult({
  res, onApplyFill, applied,
}: {
  res: TraCuuResponse;
  onApplyFill: () => void;
  applied: boolean;
}) {
  if (!res.found) {
    return (
      <div className="mt-3 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
        {res.source === "lada"
          ? "Không tìm thấy ID Lada này (đã kiểm tra cả lịch sử phản ánh cũ lẫn hệ thống đơn hàng) — nhập thủ công."
          : CRM_WARNING_MESSAGES[res.warning ?? ""] ?? "Không tìm thấy trên CRM Karofi."}
      </div>
    );
  }

  const hasFill = !!res.fill && Object.values(res.fill).some((v) => !!v);

  if (res.source === "crm") {
    const p = res.preview;
    const giaiTrinhEvents: TimelineEvent[] = (res.giaiTrinh ?? []).map((g, i) => ({
      key: `gt-${i}`,
      tone: "teal",
      badge: "GT tồn",
      time: fmtVN.dateTime(g.ngay_giai_trinh),
      sortMs: parseVnNaive(g.ngay_giai_trinh),
      actor: g.nguoi_giai_trinh ?? null,
      summary: g.noi_dung ? `${g.ly_do_cham}: ${g.noi_dung}` : g.ly_do_cham,
    }));
    return (
      <div className="mt-3 rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-xs text-teal-900">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-semibold">Tìm thấy trên CRM Karofi</span>
          {hasFill && (
            <button
              type="button"
              onClick={onApplyFill}
              disabled={applied}
              className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${
                applied ? "cursor-default bg-teal-200 text-teal-900" : "bg-teal-600 text-white hover:bg-teal-700"
              }`}
            >
              {applied ? "✓ Đã điền thông tin" : "Xác nhận điền thông tin"}
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {p?.khach_hang && <Row k="Khách hàng" v={p.khach_hang} />}
          {p?.ky_thuat_vien && <Row k="Kỹ thuật viên" v={p.ky_thuat_vien} />}
          {p?.khu_vuc && <Row k="Khu vực" v={p.khu_vuc} />}
          {p?.tien_do_hoan_thanh && <Row k="Tiến độ" v={p.tien_do_hoan_thanh} />}
          {p?.loai_yeu_cau && <Row k="Loại yêu cầu" v={p.loai_yeu_cau} />}
          {p?.thoi_gian_cskh_tiep_nhan && <Row k="CSKH tiếp nhận" v={fmtVN.dateTime(p.thoi_gian_cskh_tiep_nhan)} />}
          {p?.thoi_gian_hen_xu_ly && <Row k="Hẹn xử lý" v={fmtVN.dateTime(p.thoi_gian_hen_xu_ly)} />}
          {p?.thoi_gian_hoan_thanh && <Row k="Hoàn thành" v={fmtVN.dateTime(p.thoi_gian_hoan_thanh)} />}
          {p?.ly_do_qua_han && <Row k="Lý do quá hạn" v={p.ly_do_qua_han} />}
        </dl>
        {p?.mo_ta_loi && (
          <p className="mt-1 whitespace-pre-wrap border-t border-teal-200 pt-1"><b>Mô tả lỗi: </b>{p.mo_ta_loi}</p>
        )}
        {p?.noi_dung_xu_ly && (
          <p className="mt-1 whitespace-pre-wrap border-t border-teal-200 pt-1"><b>Nội dung xử lý: </b>{p.noi_dung_xu_ly}</p>
        )}
        {p?.link_crm && (
          <p className="mt-1 border-t border-teal-200 pt-1">
            <a href={p.link_crm} target="_blank" rel="noreferrer" className="underline">Xem trên CRM ↗</a>
          </p>
        )}
        {giaiTrinhEvents.length > 0 && (
          <div className="mt-2 border-t border-teal-200 pt-2">
            <p className="mb-1 font-semibold">Log giải trình tồn ({giaiTrinhEvents.length})</p>
            <Timeline events={giaiTrinhEvents} />
          </div>
        )}
      </div>
    );
  }

  // lada — thong tin don hang tra tu he thong ngoai (center.dichvu3t.com, neu co) + liet ke tung
  // phan anh cu cung ID Lada (noi bo), day du thong tin de so sanh + log tien trinh mo rong duoc.
  const rows = res.recent ?? [];
  const p = res.preview;
  return (
    <div className="mt-3 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-900">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold">
          {p ? "Tìm thấy thông tin đơn hàng" : `${rows.length} phản ánh cũ cùng ID Lada`}
        </span>
        {hasFill && (
          <button
            type="button"
            onClick={onApplyFill}
            disabled={applied}
            className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${
              applied ? "cursor-default bg-violet-200 text-violet-900" : "bg-violet-600 text-white hover:bg-violet-700"
            }`}
          >
            {applied ? "✓ Đã điền thông tin" : "Xác nhận điền thông tin"}
          </button>
        )}
      </div>
      {p && (
        <dl className="mb-2 grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-violet-200 pb-2 sm:grid-cols-2">
          {p.khach_hang && <Row k="Khách hàng" v={p.khach_hang} />}
          {p.ky_thuat_vien && <Row k="Kỹ thuật viên" v={p.ky_thuat_vien} />}
          {p.khu_vuc && <Row k="Khu vực" v={p.khu_vuc} />}
          {p.tien_do_hoan_thanh && <Row k="Trạng thái đơn" v={p.tien_do_hoan_thanh} />}
          {p.thoi_gian_cskh_tiep_nhan && <Row k="Ngày khởi tạo" v={p.thoi_gian_cskh_tiep_nhan} />}
          {p.thoi_gian_hen_xu_ly && <Row k="Ngày hẹn" v={p.thoi_gian_hen_xu_ly} />}
          {p.thoi_gian_hoan_thanh && <Row k="Ngày chốt đơn" v={p.thoi_gian_hoan_thanh} />}
        </dl>
      )}
      {p?.noi_dung_xu_ly && (
        <p className="mb-2 whitespace-pre-wrap border-b border-violet-200 pb-2"><b>Ghi chú: </b>{p.noi_dung_xu_ly}</p>
      )}
      {rows.length > 0 && (
        <>
          {p && <p className="mb-1 font-semibold">{rows.length} phản ánh cũ cùng ID Lada</p>}
          <div className="divide-y divide-violet-200">
            {rows.map((r) => <LadaCaseRow key={r.id} r={r} />)}
          </div>
        </>
      )}
    </div>
  );
}

function LadaCaseRow({ r }: { r: TraCuuRecent }) {
  const [open, setOpen] = useState(false);
  const diaChi = [
    r.phuong_xa_moi || r.phuong_xa || "",
    r.tinh_moi || [r.quan_huyen, r.tinh].filter(Boolean).join(", "),
  ].filter(Boolean).join(" — ");
  const sanPham = [r.hang, r.model].filter(Boolean).join(" - ");
  const loiList = [
    r.loi_nha_san_xuat === "Co" && "NSX",
    r.loi_lap_dat === "Co" && "Lắp đặt",
    r.loi_thai_do_ktv === "Co" && "Thái độ KTV",
    r.loi_quy_trinh_nskx === "Co" && "Quy trình NSKX",
  ].filter((v): v is string => !!v);
  const tienTrinhEvents: TimelineEvent[] = r.tien_trinh.map((t, i) => ({
    key: `${r.id}-tt-${i}`,
    tone: "gray",
    badge: t.ly_do_xu_ly_cham ? "Ghi chú (chậm)" : "Ghi chú",
    time: fmtVN.dateTime(t.ngay_tao),
    sortMs: parseVnNaive(t.ngay_tao),
    actor: t.nguoi_tao,
    summary: [t.ly_do_xu_ly_cham, t.noi_dung_ghi_chep].filter(Boolean).join(": ") || "—",
  }));

  return (
    <div className="py-1.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <div className="min-w-0">
          <span className="font-semibold">{r.id}</span>
          <span className="mx-1 opacity-60">·</span>
          {STATUS_LABEL[r.trang_thai ?? ""] ?? r.trang_thai ?? "—"}
          {r.ngay_tiep_nhan && <span className="ml-1 opacity-70">· {fmtVN.dateTime(r.ngay_tiep_nhan)}</span>}
        </div>
        {r.tien_trinh.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 hover:bg-violet-200"
          >
            Log tiến trình ({r.tien_trinh.length}) {open ? "▲" : "▼"}
          </button>
        )}
      </div>
      <dl className="mt-0.5 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {r.ten_khach && <Row k="Khách hàng" v={r.ten_khach} />}
        {diaChi && <Row k="Địa chỉ" v={diaChi} />}
        {sanPham && <Row k="Sản phẩm" v={sanPham} />}
        {(r.van_de_dau_vao || r.nhom_van_de) && <Row k="Vấn đề" v={r.van_de_dau_vao || r.nhom_van_de || ""} />}
        {r.nguoi_tao && <Row k="Người tạo" v={r.nguoi_tao} />}
      </dl>
      {r.thong_tin_ban_dau && <p className="mt-0.5 whitespace-pre-wrap opacity-90">{r.thong_tin_ban_dau}</p>}
      {(loiList.length > 0 || (r.ket_luan_khieu_nai && r.ket_luan_khieu_nai !== "Chua danh gia")) && (
        <p className="mt-0.5 font-medium text-red-700">
          Lỗi ghi nhận: {loiList.length > 0 ? loiList.join(", ") : "Không có"}
          {r.ket_luan_khieu_nai && r.ket_luan_khieu_nai !== "Chua danh gia"
            ? ` (Kết luận: ${translateDanhGia(r.ket_luan_khieu_nai)})`
            : ""}
        </p>
      )}
      {open && tienTrinhEvents.length > 0 && (
        <div className="mt-1.5 rounded bg-white/70 p-2">
          <Timeline events={tienTrinhEvents} />
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1">
      <dt className="shrink-0 font-medium opacity-70">{k}:</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}
