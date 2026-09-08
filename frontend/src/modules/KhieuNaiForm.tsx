import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { KhieuNai } from "../api/types";
import { useCreateSettingsOption, useSettingsOptions } from "../api/useSettingsOptions";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Combobox } from "../components/ui/Combobox";
import { Btn } from "../components/ui/Btn";
import { useToast } from "../components/ui/Toast";

interface FormState {
  ten_khach: string;
  sdt_khach: string;
  id_lada: string;
  phan_loai_kh: string;
  thong_tin_ban_dau: string;
  ghi_chu_nguoi_tao: string;
  tinh: string;
  quan_huyen: string;
  phuong_xa: string;
  hang: string;
  model: string;
  nhom_yeu_cau: string;
  nhom_van_de: string;
  van_de_dau_vao: string;
  muc_do: string;
  id_crm_karofi: string;
  sale_khu_vuc: string;
  nguoi_bao: string;
  ngay_tiep_nhan: string; // yyyy-mm-dd, mặc định hôm nay
}

function todayVN(): string {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const EMPTY: FormState = {
  ten_khach: "", sdt_khach: "", id_lada: "", phan_loai_kh: "",
  thong_tin_ban_dau: "", ghi_chu_nguoi_tao: "",
  tinh: "", quan_huyen: "", phuong_xa: "",
  hang: "", model: "",
  nhom_yeu_cau: "", nhom_van_de: "", van_de_dau_vao: "", muc_do: "",
  id_crm_karofi: "", sale_khu_vuc: "", nguoi_bao: "", ngay_tiep_nhan: "",
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

function loadDraft(): FormState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed } as FormState;
  } catch {
    return null;
  }
}

export function KhieuNaiForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const draftRef = useRef<FormState | null>(loadDraft());
  const [form, setForm] = useState<FormState>(() => draftRef.current ?? { ...EMPTY, ngay_tiep_nhan: todayVN() });
  const [restored, setRestored] = useState(!!draftRef.current);
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
  const quanHuyenOpts = useSettingsOptions("quan_huyen");
  const phuongXaOpts = useSettingsOptions("phuong_xa");
  const createSaleKhuVuc = useCreateSettingsOption("sale_khu_vuc");
  const createHang = useCreateSettingsOption("hang");
  const createTinh = useCreateSettingsOption("tinh");
  const createQuanHuyen = useCreateSettingsOption("quan_huyen");
  const createPhuongXa = useCreateSettingsOption("phuong_xa");

  const filteredVanDeDauVao = (vanDeDauVaoOpts.data ?? []).filter(
    (o) => !form.nhom_van_de || o.parent === form.nhom_van_de,
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Tự lưu nháp: mất phiên / đóng nhầm modal không mất dữ liệu đang nhập.
  const dirty =
    JSON.stringify({ ...form, ngay_tiep_nhan: "" }) !== JSON.stringify({ ...EMPTY, ngay_tiep_nhan: "" });
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }, [form, dirty]);

  const missing = REQUIRED.filter((r) => form[r.key].trim() === "");

  const mutation = useMutation({
    mutationFn: () => {
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
      if (data.crm_sync_warning) {
        showToast(CRM_WARNING_MESSAGES[data.crm_sync_warning] ?? data.crm_sync_warning, "error");
      } else {
        showToast("Đã tạo khiếu nại thành công", "success");
      }
      onCreated(data.khieuNai.id);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.code : "Có lỗi xảy ra";
      showToast(`Tạo khiếu nại thất bại: ${msg}`, "error");
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
    if (dirty && !window.confirm("Bỏ khiếu nại đang nhập? Nháp vẫn được giữ để mở lại sau.")) return;
    onCancel();
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setForm({ ...EMPTY, ngay_tiep_nhan: todayVN() });
    setRestored(false);
  };

  const gridCls = "grid grid-cols-1 gap-3 sm:grid-cols-3";
  const legendCls = "mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft";

  return (
    <form onSubmit={submit} onKeyDown={onFormKeyDown} className="flex flex-col gap-5">
      {restored && (
        <div className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-300">
          <span>Đã khôi phục nội dung nhập dở lần trước.</span>
          <button type="button" onClick={clearDraft} className="font-medium underline">
            Xoá &amp; nhập mới
          </button>
        </div>
      )}

      <fieldset>
        <legend className={legendCls}>Khách hàng &amp; liên hệ</legend>
        <div className={gridCls}>
          <Field label="Tên khách hàng *">
            <Input value={form.ten_khach} onChange={(e) => setField("ten_khach", e.target.value)} />
          </Field>
          <Field label="Số điện thoại" hint="Có thể bổ sung sau">
            <Input value={form.sdt_khach} onChange={(e) => setField("sdt_khach", e.target.value)} inputMode="tel" />
          </Field>
          <Field label="ID Lada">
            <Input value={form.id_lada} onChange={(e) => setField("id_lada", e.target.value)} />
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

      <fieldset>
        <legend className={legendCls}>Nội dung khiếu nại</legend>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Thông tin ban đầu *">
            <Textarea rows={3} value={form.thong_tin_ban_dau} onChange={(e) => setField("thong_tin_ban_dau", e.target.value)} />
          </Field>
          <Field label="Ghi chú người tạo">
            <Textarea rows={2} value={form.ghi_chu_nguoi_tao} onChange={(e) => setField("ghi_chu_nguoi_tao", e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className={legendCls}>Địa chỉ</legend>
        <div className={gridCls}>
          <Field label="Tỉnh" hint="Gõ để tìm / thêm mới">
            <Combobox
              options={(tinhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.tinh} onChange={(v) => setField("tinh", v)} creatable onCreate={createTinh}
            />
          </Field>
          <Field label="Quận/Huyện" hint="Gõ để tìm / thêm mới">
            <Combobox
              options={(quanHuyenOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.quan_huyen} onChange={(v) => setField("quan_huyen", v)} creatable onCreate={createQuanHuyen}
            />
          </Field>
          <Field label="Phường/Xã" hint="Gõ để tìm / thêm mới">
            <Combobox
              options={(phuongXaOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.phuong_xa} onChange={(v) => setField("phuong_xa", v)} creatable onCreate={createPhuongXa}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className={legendCls}>Sản phẩm</legend>
        <div className={gridCls}>
          <Field label="Hãng" hint="Gõ để tìm / thêm mới">
            <Combobox
              options={(hangOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.hang} onChange={(v) => setField("hang", v)} creatable onCreate={createHang}
            />
          </Field>
          <Field label="Model">
            <Combobox
              options={(modelOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.model} onChange={(v) => setField("model", v)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
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

      <fieldset>
        <legend className={legendCls}>CRM &amp; nội bộ</legend>
        <div className={gridCls}>
          <Field label="ID CRM Karofi" hint="Có thể bổ sung sau">
            <Input value={form.id_crm_karofi} onChange={(e) => setField("id_crm_karofi", e.target.value)} />
          </Field>
          <Field label="Ngày tiếp nhận">
            <Input type="date" value={form.ngay_tiep_nhan} onChange={(e) => setField("ngay_tiep_nhan", e.target.value)} />
          </Field>
          <Field label="Sale khu vực" hint="Gõ để tìm / thêm mới">
            <Combobox
              options={(saleKhuVucOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.sale_khu_vuc} onChange={(v) => setField("sale_khu_vuc", v)} creatable onCreate={createSaleKhuVuc}
            />
          </Field>
          <Field label="Người báo">
            <Input value={form.nguoi_bao} onChange={(e) => setField("nguoi_bao", e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
        {missing.length > 0 && (
          <span className="mr-auto text-xs text-amber-700">
            Còn thiếu: {missing.map((m) => m.label).join(", ")}
          </span>
        )}
        <Btn type="button" variant="secondary" onClick={cancel}>Hủy</Btn>
        <Btn type="submit" variant="primary" disabled={mutation.isPending || missing.length > 0}>
          {mutation.isPending ? "Đang tạo..." : "Tạo khiếu nại"}
        </Btn>
      </div>
    </form>
  );
}
