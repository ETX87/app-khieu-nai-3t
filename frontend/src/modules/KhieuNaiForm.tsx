import { useState, type FormEvent } from "react";
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
  id_lada: string;
  sale_khu_vuc: string;
  tinh: string;
  quan_huyen: string;
  phuong_xa: string;
  model: string;
  hang: string;
  thong_tin_ban_dau: string;
  nguoi_bao: string;
  muc_do: string;
  nhom_yeu_cau: string;
  nhom_van_de: string;
  van_de_dau_vao: string;
  phan_loai_kh: string;
  ghi_chu_nguoi_tao: string;
  id_crm_karofi: string;
}

const EMPTY: FormState = {
  ten_khach: "",
  id_lada: "",
  sale_khu_vuc: "",
  tinh: "",
  quan_huyen: "",
  phuong_xa: "",
  model: "",
  hang: "",
  thong_tin_ban_dau: "",
  nguoi_bao: "",
  muc_do: "",
  nhom_yeu_cau: "",
  nhom_van_de: "",
  van_de_dau_vao: "",
  phan_loai_kh: "",
  ghi_chu_nguoi_tao: "",
  id_crm_karofi: "",
};

const CRM_WARNING_MESSAGES: Record<string, string> = {
  DVBH_NOT_FOUND: "Không tìm thấy case trên CRM Karofi",
  DVBH_LOOKUP_FAILED: "Không thể kết nối CRM Karofi lúc này",
};

export function KhieuNaiForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY);
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

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(form)) {
        body[k] = v.trim() === "" ? undefined : v.trim();
      }
      return api.post<{ khieuNai: KhieuNai; crm_sync_warning?: string }>("/khieu-nai", body);
    },
    onSuccess: (data) => {
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
    mutation.mutate();
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Tên khách hàng">
        <Input value={form.ten_khach} onChange={(e) => setField("ten_khach", e.target.value)} />
      </Field>
      <Field label="ID Lada">
        <Input value={form.id_lada} onChange={(e) => setField("id_lada", e.target.value)} />
      </Field>
      <Field label="Sale khu vực" hint="Gõ để tìm hoặc thêm mới">
        <Combobox
          options={(saleKhuVucOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.sale_khu_vuc}
          onChange={(v) => setField("sale_khu_vuc", v)}
          creatable
          onCreate={createSaleKhuVuc}
        />
      </Field>
      <Field label="Người báo">
        <Input value={form.nguoi_bao} onChange={(e) => setField("nguoi_bao", e.target.value)} />
      </Field>
      <Field label="Tỉnh" hint="Gõ để tìm hoặc thêm mới">
        <Combobox
          options={(tinhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.tinh}
          onChange={(v) => setField("tinh", v)}
          creatable
          onCreate={createTinh}
        />
      </Field>
      <Field label="Quận/Huyện" hint="Gõ để tìm hoặc thêm mới">
        <Combobox
          options={(quanHuyenOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.quan_huyen}
          onChange={(v) => setField("quan_huyen", v)}
          creatable
          onCreate={createQuanHuyen}
        />
      </Field>
      <Field label="Phường/Xã" hint="Gõ để tìm hoặc thêm mới">
        <Combobox
          options={(phuongXaOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.phuong_xa}
          onChange={(v) => setField("phuong_xa", v)}
          creatable
          onCreate={createPhuongXa}
        />
      </Field>
      <Field label="Model">
        <Combobox
          options={(modelOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.model}
          onChange={(v) => setField("model", v)}
        />
      </Field>
      <Field label="Hãng" hint="Gõ để tìm hoặc thêm mới">
        <Combobox
          options={(hangOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.hang}
          onChange={(v) => setField("hang", v)}
          creatable
          onCreate={createHang}
        />
      </Field>
      <Field label="Mức độ">
        <Combobox
          options={(mucDoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.muc_do}
          onChange={(v) => setField("muc_do", v)}
        />
      </Field>
      <Field label="Nhóm yêu cầu">
        <Combobox
          options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.nhom_yeu_cau}
          onChange={(v) => setField("nhom_yeu_cau", v)}
        />
      </Field>
      <Field label="Phân loại khách hàng">
        <Combobox
          options={(phanLoaiKhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.phan_loai_kh}
          onChange={(v) => setField("phan_loai_kh", v)}
        />
      </Field>
      <Field label="Nhóm vấn đề">
        <Combobox
          options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
          value={form.nhom_van_de}
          onChange={(v) => {
            setField("nhom_van_de", v);
            setField("van_de_dau_vao", "");
          }}
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
      <Field label="ID CRM Karofi" hint="Có thể bổ sung sau nếu chưa có">
        <Input value={form.id_crm_karofi} onChange={(e) => setField("id_crm_karofi", e.target.value)} />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Thông tin ban đầu">
          <Textarea rows={3} value={form.thong_tin_ban_dau} onChange={(e) => setField("thong_tin_ban_dau", e.target.value)} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Ghi chú người tạo">
          <Textarea rows={2} value={form.ghi_chu_nguoi_tao} onChange={(e) => setField("ghi_chu_nguoi_tao", e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Btn type="button" variant="secondary" onClick={onCancel}>
          Hủy
        </Btn>
        <Btn type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? "Đang tạo..." : "Tạo khiếu nại"}
        </Btn>
      </div>
    </form>
  );
}
