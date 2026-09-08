import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { KhieuNai, SettingsNhom } from "../api/types";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Combobox } from "../components/ui/Combobox";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../components/ui/Toast";
import { fmtVN } from "../lib/formatVN";

interface FormState {
  id_crm_karofi: string;
  id_lada: string;
  ten_khach: string;
  sdt_khach: string;
  phan_loai_kh: string;
  tinh: string;
  quan_huyen: string;
  phuong_xa: string;
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

const EMPTY: FormState = {
  id_crm_karofi: "", id_lada: "",
  ten_khach: "", sdt_khach: "", phan_loai_kh: "Thường",
  tinh: "", quan_huyen: "", phuong_xa: "",
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

interface TraCuuRecent {
  id: string;
  ngay_tiep_nhan: string | null;
  trang_thai: string | null;
  nhom_van_de: string | null;
  van_de_dau_vao: string | null;
}
interface TraCuuCrmPreview {
  khach_hang: string | null;
  ky_thuat_vien: string | null;
  tien_do_hoan_thanh: string | null;
  noi_dung_xu_ly: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  thoi_gian_hoan_thanh: string | null;
}
interface TraCuuResponse {
  found: boolean;
  source: "lada" | "crm";
  fill?: Record<string, string>;
  recent?: TraCuuRecent[];
  preview?: TraCuuCrmPreview;
  giaiTrinh?: string;
  warning?: string;
}

// Cac field cho phep tra cuu tu dien de (chi dien vao o dang trong).
const FILLABLE = new Set<keyof FormState>([
  "ten_khach", "sdt_khach", "phan_loai_kh", "tinh", "quan_huyen", "phuong_xa",
  "hang", "model", "sale_khu_vuc",
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

export function KhieuNaiForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const draftRef = useRef<DraftShape | null>(loadDraft());
  const [form, setForm] = useState<FormState>(() => draftRef.current?.form ?? { ...EMPTY });
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
  const [lookup, setLookup] = useState<TraCuuResponse | null>(null);
  const [lookupBusy, setLookupBusy] = useState<"lada" | "crm" | null>(null);
  const lookupSeq = useRef(0);

  const runLookup = async (kind: "lada" | "crm") => {
    const value = (kind === "lada" ? form.id_lada : form.id_crm_karofi).trim();
    if (!value) return;
    const seq = ++lookupSeq.current;
    setLookupBusy(kind);
    try {
      const qs = kind === "lada" ? `id_lada=${encodeURIComponent(value)}` : `id_crm=${encodeURIComponent(value)}`;
      const res = await api.get<TraCuuResponse>(`/khieu-nai/tra-cuu?${qs}`);
      if (seq !== lookupSeq.current) return;
      setLookup(res);
      if (res.found && res.fill) {
        const next = { ...form };
        let filledCount = 0;
        for (const [k, v] of Object.entries(res.fill)) {
          const key = k as keyof FormState;
          if (FILLABLE.has(key) && next[key].trim() === "" && v) {
            next[key] = v;
            filledCount++;
          }
        }
        if (filledCount > 0) setForm(next);
        showToast(
          filledCount > 0
            ? `Đã tự điền ${filledCount} thông tin từ ${kind === "lada" ? "đơn cũ" : "CRM Karofi"}`
            : `Đã tìm thấy — các ô liên quan đã có dữ liệu, không ghi đè`,
          "success",
        );
      } else if (!res.found) {
        showToast(
          kind === "lada"
            ? "Chưa có phản ánh nào cùng ID Lada này"
            : CRM_WARNING_MESSAGES[res.warning ?? ""] ?? "Không tìm thấy trên CRM Karofi",
          "info",
        );
      }
    } catch {
      if (seq === lookupSeq.current) {
        setLookup({ found: false, source: kind, warning: "LOOKUP_ERROR" });
        showToast("Tra cứu thất bại, thử lại sau", "error");
      }
    } finally {
      if (seq === lookupSeq.current) setLookupBusy(null);
    }
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

  const gridCls = "grid grid-cols-1 gap-3 sm:grid-cols-2";
  const legendCls = "mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft";
  const fsCls = "rounded-lg border border-line p-3";

  return (
    <form onSubmit={submit} onKeyDown={onFormKeyDown} className="flex flex-col gap-4">
      {restored && (
        <div className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-300">
          <span>Đã khôi phục nội dung nhập dở lần trước.</span>
          <button type="button" onClick={clearDraft} className="font-medium underline">
            Xoá &amp; nhập mới
          </button>
        </div>
      )}

      {/* ── 1. Tra cứu ID (ưu tiên nhập đầu tiên) ───────────────────────────── */}
      <fieldset className="rounded-lg border border-accent/40 bg-accent-soft/40 p-3">
        <legend className={legendCls}>Tra cứu nhanh theo ID</legend>
        <p className="mb-2 text-[11px] leading-tight text-ink-soft">
          Nhập ID rồi bấm <b>Tra cứu</b> (hoặc Enter). Nếu khớp, hệ thống tự điền thông tin khách hàng &amp;
          sản phẩm vào các ô còn trống bên dưới.
        </p>
        <div className={gridCls}>
          <div className="block">
            <span className="mb-0.5 block text-xs font-medium text-ink-soft">ID CRM Karofi</span>
            <div className="flex gap-2">
              <Input
                value={form.id_crm_karofi}
                onChange={(e) => setField("id_crm_karofi", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runLookup("crm"); } }}
              />
              <Btn
                type="button"
                variant="secondary"
                onClick={() => void runLookup("crm")}
                disabled={!form.id_crm_karofi.trim() || lookupBusy === "crm"}
              >
                {lookupBusy === "crm" ? "..." : "Tra cứu"}
              </Btn>
            </div>
            <span className="mt-0.5 block text-[11px] leading-tight text-ink-faint">Tra cứu sang hệ thống DVBH gốc</span>
          </div>
          <div className="block">
            <span className="mb-0.5 block text-xs font-medium text-ink-soft">ID Lada</span>
            <div className="flex gap-2">
              <Input
                value={form.id_lada}
                onChange={(e) => setField("id_lada", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runLookup("lada"); } }}
              />
              <Btn
                type="button"
                variant="secondary"
                onClick={() => void runLookup("lada")}
                disabled={!form.id_lada.trim() || lookupBusy === "lada"}
              >
                {lookupBusy === "lada" ? "..." : "Tra cứu"}
              </Btn>
            </div>
            <span className="mt-0.5 block text-[11px] leading-tight text-ink-faint">Soi trong các phản ánh cũ cùng ID Lada</span>
          </div>
        </div>

        {lookup && <LookupResult res={lookup} />}
      </fieldset>

      {/* ── 2. Khách hàng ──────────────────────────────────────────────────── */}
      <fieldset className={fsCls}>
        <legend className={legendCls}>Thông tin khách hàng</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tên khách hàng *">
            <Input value={form.ten_khach} onChange={(e) => setField("ten_khach", e.target.value)} autoFocus />
          </Field>
          <Field label="Số điện thoại" hint="Có thể bổ sung sau">
            <Input value={form.sdt_khach} onChange={(e) => setField("sdt_khach", e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Phân loại khách hàng">
            <Combobox
              options={(phanLoaiKhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.phan_loai_kh}
              onChange={(v) => setField("phan_loai_kh", v)}
            />
          </Field>
        </div>
      </fieldset>

      {/* ── 3. Địa chỉ (cascading) + 4. Sản phẩm ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className={fsCls}>
          <legend className={legendCls}>Địa chỉ</legend>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Tỉnh / Thành phố" hint="Gõ để tìm / thêm mới">
              <Combobox
                options={optsFor(tinhOpts.data, "tinh")}
                value={form.tinh}
                onChange={(v) => setForm((p) => ({ ...p, tinh: v, quan_huyen: "", phuong_xa: "" }))}
                creatable
                onCreate={(v) => addPending("tinh", v)}
              />
            </Field>
            <Field
              label="Quận / Huyện"
              hint={form.tinh ? "Gõ để tìm / thêm mới" : "Chọn Tỉnh trước"}
            >
              <Combobox
                options={optsFor(quanHuyenOpts.data, "quan_huyen", form.tinh)}
                value={form.quan_huyen}
                onChange={(v) => setForm((p) => ({ ...p, quan_huyen: v, phuong_xa: "" }))}
                disabled={!form.tinh}
                creatable
                onCreate={(v) => addPending("quan_huyen", v, form.tinh)}
              />
            </Field>
            <Field
              label="Phường / Xã"
              hint={form.quan_huyen ? "Gõ để tìm / thêm mới" : "Chọn Quận/Huyện trước"}
            >
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
        </fieldset>

        <fieldset className={fsCls}>
          <legend className={legendCls}>Sản phẩm</legend>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Hãng" hint="Gõ để tìm / thêm mới">
              <Combobox
                options={optsFor(hangOpts.data, "hang")}
                value={form.hang}
                onChange={(v) => setField("hang", v)}
                creatable
                onCreate={(v) => addPending("hang", v)}
              />
            </Field>
            <Field label="Model" hint="Gõ để tìm / thêm mới">
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
      </div>

      {/* ── 5. Nội dung phản ánh ───────────────────────────────────────────── */}
      <fieldset className={fsCls}>
        <legend className={legendCls}>Nội dung phản ánh</legend>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Field label="Thông tin ban đầu *">
            <Textarea rows={3} value={form.thong_tin_ban_dau} onChange={(e) => setField("thong_tin_ban_dau", e.target.value)} />
          </Field>
          <Field label="Ghi chú người tạo">
            <Textarea rows={3} value={form.ghi_chu_nguoi_tao} onChange={(e) => setField("ghi_chu_nguoi_tao", e.target.value)} />
          </Field>
        </div>
      </fieldset>

      {/* ── 6. Phân loại vấn đề + 7. Nội bộ ────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className={fsCls}>
          <legend className={legendCls}>Phân loại vấn đề</legend>
          <div className={gridCls}>
            <Field label="Nhóm yêu cầu">
              <Combobox
                options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.nhom_yeu_cau} onChange={(v) => setField("nhom_yeu_cau", v)}
              />
            </Field>
            <Field label="Nhóm vấn đề *">
              <Combobox
                options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.nhom_van_de}
                onChange={(v) => { setField("nhom_van_de", v); setField("van_de_dau_vao", ""); }}
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
            <Field label="Mức độ">
              <Combobox
                options={(mucDoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
                value={form.muc_do} onChange={(v) => setField("muc_do", v)}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className={fsCls}>
          <legend className={legendCls}>Nội bộ</legend>
          <div className={gridCls}>
            <Field label="Sale khu vực" hint="Gõ để tìm / thêm mới">
              <Combobox
                options={optsFor(saleKhuVucOpts.data, "sale_khu_vuc")}
                value={form.sale_khu_vuc}
                onChange={(v) => setField("sale_khu_vuc", v)}
                creatable
                onCreate={(v) => addPending("sale_khu_vuc", v)}
              />
            </Field>
            <Field label="Người báo">
              <Input value={form.nguoi_bao} onChange={(e) => setField("nguoi_bao", e.target.value)} />
            </Field>
          </div>
          <p className="mt-2 text-[11px] leading-tight text-ink-soft">
            Ngày tiếp nhận &amp; các dữ liệu CRM khác được hệ thống tự đồng bộ, không cần nhập.
          </p>
        </fieldset>
      </div>

      <div className="sticky bottom-0 -mx-5 flex items-center justify-end gap-3 border-t border-line bg-surface px-5 py-2.5">
        {pendingOpts.length > 0 && (
          <span className="mr-auto text-[11px] text-ink-soft">
            {pendingOpts.length} lựa chọn mới sẽ được lưu vào danh mục khi bấm Tạo
          </span>
        )}
        {missing.length > 0 && pendingOpts.length === 0 && (
          <span className="mr-auto text-xs text-amber-700">
            Còn thiếu: {missing.map((m) => m.label).join(", ")}
          </span>
        )}
        <Btn type="button" variant="secondary" onClick={cancel}>Hủy</Btn>
        <Btn type="submit" variant="primary" disabled={mutation.isPending || missing.length > 0}>
          {mutation.isPending ? "Đang tạo..." : "Tạo phản ánh"}
        </Btn>
      </div>
    </form>
  );
}

function LookupResult({ res }: { res: TraCuuResponse }) {
  if (!res.found) {
    return (
      <div className="mt-3 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
        {res.source === "lada"
          ? "Chưa có phản ánh nào cùng ID Lada này — nhập thủ công."
          : CRM_WARNING_MESSAGES[res.warning ?? ""] ?? "Không tìm thấy trên CRM Karofi."}
      </div>
    );
  }

  if (res.source === "crm") {
    const p = res.preview;
    return (
      <div className="mt-3 rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-xs text-teal-900">
        <div className="mb-1 font-semibold">Tìm thấy trên CRM Karofi</div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {p?.khach_hang && <Row k="Khách hàng" v={p.khach_hang} />}
          {p?.ky_thuat_vien && <Row k="Kỹ thuật viên" v={p.ky_thuat_vien} />}
          {p?.tien_do_hoan_thanh && <Row k="Tiến độ" v={p.tien_do_hoan_thanh} />}
          {p?.thoi_gian_cskh_tiep_nhan && <Row k="CSKH tiếp nhận" v={fmtVN.dateTime(p.thoi_gian_cskh_tiep_nhan)} />}
          {p?.thoi_gian_hoan_thanh && <Row k="Hoàn thành" v={fmtVN.dateTime(p.thoi_gian_hoan_thanh)} />}
        </dl>
        {p?.noi_dung_xu_ly && (
          <p className="mt-1 whitespace-pre-wrap border-t border-teal-200 pt-1">{p.noi_dung_xu_ly}</p>
        )}
        {res.giaiTrinh && (
          <p className="mt-1 whitespace-pre-wrap border-t border-teal-200 pt-1 text-teal-800">{res.giaiTrinh}</p>
        )}
      </div>
    );
  }

  // lada
  const rows = res.recent ?? [];
  return (
    <div className="mt-3 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-900">
      <div className="mb-1 font-semibold">
        {rows.length} phản ánh cũ cùng ID Lada — đã điền từ đơn gần nhất
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] text-violet-700">
              <th className="py-1 pr-3 font-medium">Mã đơn</th>
              <th className="py-1 pr-3 font-medium">Ngày tiếp nhận</th>
              <th className="py-1 pr-3 font-medium">Trạng thái</th>
              <th className="py-1 font-medium">Vấn đề</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-violet-200">
                <td className="py-1 pr-3 font-mono">{r.id}</td>
                <td className="py-1 pr-3">{r.ngay_tiep_nhan ? fmtVN.date(r.ngay_tiep_nhan) : "—"}</td>
                <td className="py-1 pr-3">{r.trang_thai ?? "—"}</td>
                <td className="py-1">{r.van_de_dau_vao || r.nhom_van_de || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
