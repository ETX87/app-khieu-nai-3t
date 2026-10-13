import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
  type ChangeEvent, type FormEvent, type KeyboardEvent,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { KhieuNai, SettingsNhom } from "../api/types";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Btn } from "../components/ui/Btn";
import { Combobox } from "../components/ui/Combobox";
import { useToast } from "../components/ui/Toast";
import { fmtVN, translateDanhGia } from "../lib/formatVN";
import { STATUS_LABEL } from "../components/ui/Badge";
import { Timeline, type TimelineEvent } from "../components/ui/Timeline";
import { mucDoTone, MUC_DO_BG, vipGlowClass, sortMucDoOptions } from "../lib/severity";
import { chuanHoaIdCrm } from "../lib/crm";
import {
  DINH_KEM_ERROR_MESSAGES, DINH_KEM_MAX_ANH, DINH_KEM_MAX_VIDEO, VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_S,
  compressImage, readVideoDuration,
} from "../lib/dinhKem";

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

// Gia tri luu DB giu nguyen "Lada"/"CRM" (khong doi du lieu cu) - chi doi nhan hien thi theo yeu cau
// 2026-09-21: don co ID CRM -> "3T", con lai -> "NSKX".
export const NGUON_OPTIONS = [
  { value: "Lada", label: "NSKX" },
  { value: "CRM", label: "3T" },
  { value: "PLP", label: "PLP" },
];
export const NGUON_LABEL: Record<string, string> = { Lada: "NSKX", CRM: "3T", PLP: "PLP" };

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
  source: "lada" | "crm" | "truy_van";
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
  "tinh_moi", "phuong_xa_moi", "hang", "model", "sale_khu_vuc", "id_truy_van",
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

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const KhieuNaiForm = forwardRef<KhieuNaiFormHandle, {
  // Cong ty nguoi dung da chon sau dang nhap (user.cong_ty) - dung lam Nguon mac dinh khi tao moi;
  // doi tay trong form nay CHI ap dung cho ca dang tao, khong ghi de lai mac dinh cho lan sau.
  userCongTy: string | null;
  onCreated: (id: string) => void;
  onCancel: () => void;
  onStateChange?: (s: KhieuNaiFormHeaderState) => void;
}>(function KhieuNaiForm({ userCongTy, onCreated, onCancel, onStateChange }, ref) {
  const draftRef = useRef<DraftShape | null>(loadDraft());
  const formElRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<FormState>(() => draftRef.current?.form ?? { ...EMPTY, nguon: userCongTy ?? "" });
  const [pendingOpts, setPendingOpts] = useState<PendingOpt[]>(() => draftRef.current?.pendingOpts ?? []);
  const [restored, setRestored] = useState(!!draftRef.current);
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

  // "truy_van" (2026-09-21) - tra cuu RIENG theo cot id_truy_van, chi noi bo (backend
  // /tra-cuu?id_truy_van=...) - khong goi API Ecolada ngoai vi API do chi nhan ma dang "ID LADA",
  // khong tim duoc theo ID Truy xuat (truoc day nhanh nay dung nham lai qs id_lada nen khong bao
  // gio tim thay gia tri ID Truy xuat that).
  const runLookup = async (kind: "lada" | "crm" | "truy_van") => {
    const value = (kind === "crm" ? form.id_crm_karofi : kind === "lada" ? form.id_lada : form.id_truy_van).trim();
    if (!value) return;
    const seq = ++lookupSeq.current;
    setLookupBusy(kind);
    try {
      const qs = `id_${kind === "crm" ? "crm" : kind === "lada" ? "lada" : "truy_van"}=${encodeURIComponent(value)}`;
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
        setLookup({ found: false, source: kind === "crm" ? "crm" : kind === "lada" ? "lada" : "truy_van", warning: "LOOKUP_ERROR" });
        showToast("Tra cứu thất bại, thử lại sau", "error");
      }
    } finally {
      if (seq === lookupSeq.current) setLookupBusy(null);
    }
  };

  // Anh/video dinh kem: chon "cho" ngay tren form tao (chua co ID phan anh nen chua goi API duoc) -
  // nen/kiem tra ngay luc chon, upload thuc su sau khi tao xong don (xem mutation.onSuccess).
  const [pendingAnh, setPendingAnh] = useState<{ file: File; previewUrl: string }[]>([]);
  const [pendingVideo, setPendingVideo] = useState<File[]>([]);

  const handleAnhChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const remain = DINH_KEM_MAX_ANH - pendingAnh.length;
    if (remain <= 0) {
      showToast(`Tối đa ${DINH_KEM_MAX_ANH} ảnh`, "error");
      return;
    }
    for (const file of files.slice(0, remain)) {
      const compressed = await compressImage(file);
      setPendingAnh((prev) => [...prev, { file: compressed, previewUrl: URL.createObjectURL(compressed) }]);
    }
  };
  const removeAnh = (idx: number) => {
    setPendingAnh((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleVideoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const remain = DINH_KEM_MAX_VIDEO - pendingVideo.length;
    if (remain <= 0) {
      showToast(`Tối đa ${DINH_KEM_MAX_VIDEO} video`, "error");
      return;
    }
    for (const file of files.slice(0, remain)) {
      if (file.size > VIDEO_MAX_BYTES) {
        showToast(`Video "${file.name}" vượt quá ${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)}MB`, "error");
        continue;
      }
      try {
        const duration = await readVideoDuration(file);
        if (duration > VIDEO_MAX_DURATION_S) {
          showToast(`Video "${file.name}" dài quá ${VIDEO_MAX_DURATION_S}s`, "error");
          continue;
        }
      } catch {
        // Khong doc duoc thoi luong - van cho, server van chan theo dung luong.
      }
      setPendingVideo((prev) => [...prev, file]);
    }
  };
  const removeVideo = (idx: number) => setPendingVideo((prev) => prev.filter((_, i) => i !== idx));

  // Upload tuan tu cac file da "cho" sau khi don da co ID - loi 1 file khong chan cac file con lai,
  // chi bao toast rieng cho file do (don van duoc tao thanh cong, nguoi dung co the dinh kem lai sau
  // tu man chi tiet).
  const uploadPendingDinhKem = async (khieuNaiId: string) => {
    for (const { file } of pendingAnh) {
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("loai", "anh");
        await api.postForm(`/khieu-nai/${khieuNaiId}/dinh-kem`, form);
      } catch (err) {
        const code = err instanceof ApiError ? err.code : "UPLOAD_FAILED";
        showToast(`Ảnh "${file.name}": ${DINH_KEM_ERROR_MESSAGES[code] ?? "tải lên thất bại"}`, "error");
      }
    }
    for (const file of pendingVideo) {
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("loai", "video");
        await api.postForm(`/khieu-nai/${khieuNaiId}/dinh-kem`, form);
      } catch (err) {
        const code = err instanceof ApiError ? err.code : "UPLOAD_FAILED";
        showToast(`Video "${file.name}": ${DINH_KEM_ERROR_MESSAGES[code] ?? "tải lên thất bại"}`, "error");
      }
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
        ? `Đã điền ${filledCount} thông tin từ ${lookup.source === "crm" ? "CRM Karofi" : "đơn cũ"}`
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
    onSuccess: async (data) => {
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
      if (pendingAnh.length > 0 || pendingVideo.length > 0) {
        await uploadPendingDinhKem(data.khieuNai.id);
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
      // Khong con tab de nhay - cuon toi truong con thieu DAU TIEN roi focus (id gan tren chinh
      // input/textarea/combobox tuong ung, xem `fld-${key}` o cac Field ben duoi).
      const el = document.getElementById(`fld-${missing[0].key}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => el?.focus(), 350);
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
    setForm({ ...EMPTY, nguon: userCongTy ?? "" });
    setPendingOpts([]);
    setLookup(null);
    setRestored(false);
  };

  // Nen trang (item: giu mac dinh trang cho khoi nhap lieu, khong to mau nen khoi). Mobile: the bo
  // goc 12px + bong nhe theo DESIGN_SYSTEM.md; desktop (lg:) giu khung gon nhu cu.
  const fsCls = "rounded-xl border border-line bg-surface p-4 shadow-card lg:rounded-lg lg:p-3 lg:shadow-none";
  const subCls = "text-xs font-semibold uppercase tracking-wide text-ink-faint lg:text-[11px]";
  const searchBtnCls =
    "flex min-w-[48px] shrink-0 items-center justify-center rounded-lg border border-brand-200 bg-accent-soft px-3 text-accent-ink hover:bg-brand-100 " +
    "disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-0 lg:border-line lg:bg-white lg:px-1 lg:text-ink-soft lg:hover:bg-surface-2";
  const rowCls = "flex flex-wrap items-start gap-x-3 gap-y-2.5";
  // Mobile: moi o rong het hang (o hep cat chu, vd "Ba Ria - Vung Tau"); desktop (lg:) kho gon nhu cu.
  const W_XS = "block w-full lg:w-24"; // Phân loại KH
  const W_SM = "block w-full lg:w-36"; // SĐT, Tỉnh/Huyện/Xã, Mức độ, Nhóm yêu cầu, Người báo
  const W_MD = "block w-full lg:w-56"; // Tên khách hàng, Nhóm vấn đề, Vấn đề đầu vào, Hãng, Model, Sale khu vực

  return (
    <form ref={formElRef} onSubmit={submit} onKeyDown={onFormKeyDown} className="flex h-full min-h-0 flex-col">
      {restored && (
        <div className="mb-2 flex shrink-0 items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-300">
          <span>Đã khôi phục nội dung nhập dở lần trước.</span>
          <button type="button" onClick={clearDraft} className="font-medium underline">
            Xoá &amp; nhập mới
          </button>
        </div>
      )}

      {/* Khong dung tab nua: mobile xep doc ca 2 mang trong 1 luong cuon; desktop (lg+) van chia 2
          cot song song nhu cu qua grid-cols-1 lg:grid-cols-2 co san. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-2 lg:overflow-visible">
        {/* ── Trái: Tra cứu · Khách hàng/Địa chỉ · Sản phẩm · Nội bộ ─────────── */}
        {/* min-h-0 CHI o lg: - tren mobile 2 nua cung 1 luoi cao co dinh, min-h-0 cho phep luoi ep
            hang thap hon noi dung -> noi dung tran de len nua kia (loi 1.052). */}
        <div className="flex min-w-0 flex-col gap-3 pb-1 lg:min-h-0 lg:overflow-y-auto lg:pr-3">
          {/* Tra cứu ID — ô gọn, nút kính lúp */}
          <fieldset className="rounded-xl border border-brand-200 bg-surface p-4 shadow-card lg:rounded-lg lg:border-accent/40 lg:p-2.5 lg:shadow-none">
            <SectionHead n={1} title="Tra cứu nhanh theo ID" />
            <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-nowrap lg:items-end lg:gap-x-2 lg:gap-y-0 lg:overflow-x-auto lg:pb-0.5">
              <div className="w-full lg:w-[124px] lg:shrink-0">
                <span className="mb-1 block text-sm font-medium leading-tight text-ink-soft lg:mb-0.5 lg:text-xs">ID CRM Karofi</span>
                <div className="flex gap-1.5 lg:gap-0.5">
                  <Input
                    className="lg:w-[94px] lg:!px-1.5 lg:!py-1 lg:!text-xs"
                    value={form.id_crm_karofi}
                    placeholder="SC261007210"
                    autoCapitalize="characters"
                    onChange={(e) => {
                      const v = chuanHoaIdCrm(e.target.value);
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
                    className={searchBtnCls}
                  >
                    {lookupBusy === "crm" ? "…" : <SearchIcon />}
                  </button>
                </div>
              </div>
              <div className="w-full lg:w-[80px] lg:shrink-0">
                <span className="mb-1 block text-sm font-medium leading-tight text-ink-soft lg:mb-0.5 lg:text-xs">ID Lada</span>
                <div className="flex gap-1.5 lg:gap-0.5">
                  <Input
                    className="lg:w-[62px] lg:!px-1.5 lg:!py-1 lg:!text-xs"
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
                    className={searchBtnCls}
                  >
                    {lookupBusy === "lada" ? "…" : <SearchIcon />}
                  </button>
                </div>
              </div>
              <div className="w-full lg:w-[92px] lg:shrink-0">
                <span className="mb-1 block text-sm font-medium leading-tight text-ink-soft lg:mb-0.5 lg:text-xs">ID Truy xuất</span>
                <div className="flex gap-1.5 lg:gap-0.5">
                  <Input
                    className="lg:w-[62px] lg:!px-1.5 lg:!py-1 lg:!text-xs"
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
                    aria-label="Tra cứu ID truy xuất"
                    title="Tra cứu"
                    onClick={() => void runLookup("truy_van")}
                    disabled={!form.id_truy_van.trim() || lookupBusy === "truy_van"}
                    className={searchBtnCls}
                  >
                    {lookupBusy === "truy_van" ? "…" : <SearchIcon />}
                  </button>
                </div>
              </div>
              <div className="w-full lg:w-[76px] lg:shrink-0">
                <span className="mb-1 block text-sm font-medium leading-tight text-ink-soft lg:mb-0.5 lg:text-xs">Nguồn</span>
                <Select
                  className="lg:w-[76px] lg:!px-1.5 lg:!py-1 lg:!text-xs"
                  options={NGUON_OPTIONS}
                  placeholder="— Chọn —"
                  value={form.nguon}
                  onChange={(e) => setField("nguon", e.target.value)}
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs leading-tight text-ink-faint lg:text-[11px]">
              Nhập ID rồi Enter / bấm kính lúp — tự điền vào các ô còn trống.
            </p>

            {lookup && <LookupResult res={lookup} onApplyFill={applyLookupFill} applied={filledFromLookup} />}
          </fieldset>

          {/* Khách hàng (luôn hiện, trái) + Địa chính (tab, phải) */}
          <fieldset className={fsCls}>
            <SectionHead n={2} title="Thông tin khách hàng & địa chỉ" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className={`mb-2 ${subCls}`}>Khách hàng</p>
                <div className={rowCls}>
                  <Field label="Tên khách hàng *" className={W_MD}>
                    <Input id="fld-ten_khach" value={form.ten_khach} onChange={(e) => setField("ten_khach", e.target.value)} autoFocus />
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

              <div className="flex flex-col gap-3">
                <div>
                  <p className={`mb-1.5 ${subCls}`}>Địa chính cũ</p>
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
                </div>

                <div className="border-t border-line pt-3">
                  <p className={`mb-1.5 ${subCls}`}>Địa chính mới</p>
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
                    <p className="mb-1 w-full text-xs leading-tight text-ink-faint lg:text-[11px]">
                      Điền theo địa chính cũ, mới, hoặc cả hai — không bắt buộc.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className={fsCls}>
            <SectionHead n={3} title="Sản phẩm" />
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
            <SectionHead n={4} title="Nội bộ" />
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
            <p className="mt-2 text-xs leading-tight text-ink-soft lg:text-[11px]">
              Ngày tiếp nhận &amp; các dữ liệu CRM khác được hệ thống tự đồng bộ, không cần nhập.
            </p>
          </fieldset>
        </div>

        {/* ── Phải: Phân loại vấn đề · Nội dung phản ánh — cố định, cuộn riêng ── */}
        <div className="flex min-w-0 flex-col gap-3 pb-1 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-line lg:pl-4">
          <fieldset className={fsCls}>
            <SectionHead n={5} title="Phân loại vấn đề" />
            <div className={rowCls}>
              <Field label="Nhóm yêu cầu" className={W_SM}>
                <Combobox
                  options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                  value={form.nhom_yeu_cau} onChange={(v) => setField("nhom_yeu_cau", v)}
                />
              </Field>
              <Field label="Nhóm vấn đề *" className={W_MD}>
                <Combobox
                  id="fld-nhom_van_de"
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
            <SectionHead n={6} title="Nội dung phản ánh" />
            <div className="flex flex-col gap-2.5">
              <Field label="Thông tin ban đầu *">
                <Textarea id="fld-thong_tin_ban_dau" rows={3} value={form.thong_tin_ban_dau} onChange={(e) => setField("thong_tin_ban_dau", e.target.value)} />
              </Field>
              <Field label="Ghi chú người tạo">
                <Textarea rows={3} value={form.ghi_chu_nguoi_tao} onChange={(e) => setField("ghi_chu_nguoi_tao", e.target.value)} />
              </Field>
            </div>
          </fieldset>

          <fieldset className={fsCls}>
            <SectionHead n={7} title="Ảnh / video đính kèm" />
            <div className="space-y-3">
              {/* Mobile: 2 o bam lon (camera / thu vien) thay cho nut chu nho - nguoi dung lon tuoi. */}
              <div className="grid grid-cols-2 gap-2.5 lg:hidden">
                <MediaPicker kind="anh" count={pendingAnh.length} max={DINH_KEM_MAX_ANH} accept="image/*" onChange={handleAnhChange} />
                <MediaPicker kind="video" count={pendingVideo.length} max={DINH_KEM_MAX_VIDEO} accept="video/*" onChange={handleVideoChange} />
              </div>

              <div className={pendingAnh.length > 0 ? "" : "hidden lg:block"}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-body lg:text-xs lg:font-normal lg:text-ink-soft">Ảnh ({pendingAnh.length}/{DINH_KEM_MAX_ANH})</span>
                  {pendingAnh.length < DINH_KEM_MAX_ANH && (
                    <label className="hidden cursor-pointer rounded-lg border border-line bg-white px-2 py-0.5 text-xs font-semibold shadow-card hover:bg-surface-2 lg:inline-block">
                      + Thêm ảnh
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleAnhChange} />
                    </label>
                  )}
                </div>
                {pendingAnh.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {pendingAnh.map((p, idx) => (
                      <div key={p.previewUrl} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-2">
                        <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
                        {/* Mobile khong co hover -> nut xoa luon hien, du lon de cham. */}
                        <button
                          type="button"
                          onClick={() => removeAnh(idx)}
                          aria-label="Xoá ảnh"
                          className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-sm text-white lg:h-5 lg:w-5 lg:text-xs lg:opacity-0 lg:group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={pendingVideo.length > 0 ? "" : "hidden lg:block"}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-body lg:text-xs lg:font-normal lg:text-ink-soft">Video ({pendingVideo.length}/{DINH_KEM_MAX_VIDEO})</span>
                  {pendingVideo.length < DINH_KEM_MAX_VIDEO && (
                    <label className="hidden cursor-pointer rounded-lg border border-line bg-white px-2 py-0.5 text-xs font-semibold shadow-card hover:bg-surface-2 lg:inline-block">
                      + Thêm video
                      <input type="file" accept="video/*" multiple className="hidden" onChange={handleVideoChange} />
                    </label>
                  )}
                </div>
                {pendingVideo.length > 0 && (
                  <div className="space-y-1.5">
                    {pendingVideo.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 lg:px-2 lg:py-1.5">
                        <span className="shrink-0 text-accent lg:hidden"><VideoIcon /></span>
                        <span className="flex-1 truncate text-sm lg:text-[13px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeVideo(idx)}
                          className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 lg:rounded lg:px-1.5 lg:py-0.5 lg:text-xs lg:font-normal"
                        >
                          Xoá
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-ink-faint lg:text-[11px]">Ảnh được tự động nén trước khi gửi; video chỉ giới hạn dung lượng (≤80MB) và thời lượng (≤60s), không nén.</p>
            </div>
          </fieldset>
        </div>
      </div>

      {/* Mobile: thanh nut co dinh day man hinh (nut Huy/Tao tren thanh tieu de qua nho va xa tay).
          Bam Tao khi con thieu -> cuon toi o thieu dau tien (xem submit). Desktop dung nut o tieu de. */}
      <div className="-mx-3 -mb-3 mt-3 flex shrink-0 flex-col gap-2 border-t border-line bg-surface px-3 pb-3 pt-2.5 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] lg:hidden">
        {missing.length > 0 ? (
          <p className="text-sm text-amber-700">Còn thiếu: <b>{missing.map((m) => m.label).join(", ")}</b></p>
        ) : pendingOpts.length > 0 ? (
          <p className="text-xs text-ink-soft">{pendingOpts.length} lựa chọn mới sẽ được lưu khi bấm Tạo</p>
        ) : null}
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <Btn type="button" variant="secondary" size="touch" onClick={cancel}>Hủy</Btn>
          <Btn type="submit" variant="primary" size="touch" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang tạo..." : "Tạo phản ánh"}
          </Btn>
        </div>
      </div>
    </form>
  );
});

// Tieu de tung khoi: mobile co so thu tu trong cham tron tim + chu dam de de theo doi tien do
// nhap; desktop tra ve nhan chu HOA nho nhu cu.
function SectionHead({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 lg:mb-1.5 lg:gap-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 lg:hidden">{n}</span>
      <span className="text-base font-bold text-ink lg:text-xs lg:font-semibold lg:uppercase lg:tracking-wide lg:text-ink-soft">{title}</span>
    </div>
  );
}

const MEDIA_ICON_PROPS = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const CameraIcon = () => (
  <svg width={28} height={28} {...MEDIA_ICON_PROPS}><path d="M4 8h3l2-3h6l2 3h3v11H4Z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const VideoIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} {...MEDIA_ICON_PROPS}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>
);

// O bam lon chon anh/video tren mobile (mo camera hoac thu vien cua dien thoai).
function MediaPicker({
  kind, count, max, accept, onChange,
}: {
  kind: "anh" | "video";
  count: number;
  max: number;
  accept: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const full = count >= max;
  const body = (
    <>
      <span className={full ? "text-ink-faint" : "text-accent"}>{kind === "anh" ? <CameraIcon /> : <VideoIcon size={28} />}</span>
      <span className="text-base font-bold">{kind === "anh" ? "Thêm ảnh" : "Thêm video"}</span>
      <span className="text-xs font-medium text-ink-soft">{full ? "Đã đủ " : ""}{count}/{max} {kind === "anh" ? "ảnh" : "video"}</span>
    </>
  );
  const cls = "flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-2 py-3 text-center";
  if (full) return <div className={`${cls} border-line bg-surface-2 text-ink-faint`}>{body}</div>;
  return (
    <label className={`${cls} cursor-pointer border-brand-300 bg-accent-soft text-accent-ink transition-colors active:bg-brand-100`}>
      {body}
      <input type="file" accept={accept} multiple className="hidden" onChange={onChange} />
    </label>
  );
}

function LookupResult({
  res, onApplyFill, applied,
}: {
  res: TraCuuResponse;
  onApplyFill: () => void;
  applied: boolean;
}) {
  if (!res.found) {
    return (
      <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-soft lg:text-xs">
        {res.source === "lada"
          ? "Không tìm thấy ID Lada này (đã kiểm tra cả lịch sử phản ánh cũ lẫn hệ thống đơn hàng) — nhập thủ công."
          : res.source === "truy_van"
          ? "Chưa có phản ánh nào cùng ID Truy xuất này — nhập thủ công."
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
      <div className="mt-3 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-sm text-teal-900 lg:text-xs">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-semibold">Tìm thấy trên CRM Karofi</span>
          {hasFill && (
            <button
              type="button"
              onClick={onApplyFill}
              disabled={applied}
              className={`shrink-0 rounded px-2 py-1 text-xs font-semibold lg:text-[11px] ${
                applied ? "cursor-default bg-teal-200 text-teal-900" : "bg-teal-600 text-white hover:bg-teal-700"
              }`}
            >
              {applied ? "✓ Đã điền thông tin" : "Xác nhận điền thông tin"}
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 lg:grid-cols-2">
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

  // lada/truy_van — thong tin don hang tra tu he thong ngoai (center.dichvu3t.com, chi co o nhanh
  // lada) + liet ke tung phan anh cu cung ID (noi bo), day du thong tin de so sanh + log tien trinh
  // mo rong duoc. truy_van khong co "preview" (khong goi API ngoai) nen chi hien danh sach cu.
  const rows = res.recent ?? [];
  const p = res.preview;
  const idLabel = res.source === "truy_van" ? "ID Truy xuất" : "ID Lada";
  return (
    <div className="mt-3 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900 lg:text-xs">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold">
          {p ? "Tìm thấy thông tin đơn hàng" : `${rows.length} phản ánh cũ cùng ${idLabel}`}
        </span>
        {hasFill && (
          <button
            type="button"
            onClick={onApplyFill}
            disabled={applied}
            className={`shrink-0 rounded px-2 py-1 text-xs font-semibold lg:text-[11px] ${
              applied ? "cursor-default bg-violet-200 text-violet-900" : "bg-violet-600 text-white hover:bg-violet-700"
            }`}
          >
            {applied ? "✓ Đã điền thông tin" : "Xác nhận điền thông tin"}
          </button>
        )}
      </div>
      {p && (
        <dl className="mb-2 grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-violet-200 pb-2 lg:grid-cols-2">
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
          {p && <p className="mb-1 font-semibold">{rows.length} phản ánh cũ cùng {idLabel}</p>}
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
            className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 hover:bg-violet-200 lg:text-[11px]"
          >
            Log tiến trình ({r.tien_trinh.length}) {open ? "▲" : "▼"}
          </button>
        )}
      </div>
      <dl className="mt-0.5 grid grid-cols-1 gap-x-4 gap-y-0.5 lg:grid-cols-2">
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
