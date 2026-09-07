import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AppUser, DanhGia3, KhieuNai, TienTrinh } from "../api/types";
import { useSettingsOptions } from "../api/useSettingsOptions";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { StatusBadge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";

interface DetailResponse {
  khieuNai: KhieuNai;
  tienTrinh: TienTrinh[];
}

const DANH_GIA_OPTIONS = [
  { value: "Chua danh gia", label: "Chưa đánh giá" },
  { value: "Khong", label: "Không" },
  { value: "Co", label: "Có" },
];

const CAM_CO_OPTIONS = [
  { value: "Khong co", label: "Không cờ" },
  { value: "Co vang", label: "Cờ vàng" },
  { value: "Co do", label: "Cờ đỏ" },
];

const CRM_WARNING_MESSAGES: Record<string, string> = {
  DVBH_NOT_FOUND: "Không tìm thấy case trên CRM Karofi",
  DVBH_LOOKUP_FAILED: "Không thể kết nối CRM Karofi lúc này",
};

function ReadField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="text-sm text-ink">{value === null || value === undefined || value === "" ? "—" : value}</p>
    </div>
  );
}

export function KhieuNaiDetail({
  id,
  user,
  onClose,
  onChanged,
}: {
  id: string;
  user: AppUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const detail = useQuery({
    queryKey: ["khieu-nai", id],
    queryFn: () => api.get<DetailResponse>(`/khieu-nai/${id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["khieu-nai", id] });
    onChanged();
  };

  if (detail.isLoading) return <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>;
  if (detail.isError || !detail.data) return <p className="py-8 text-center text-sm text-red-600">Không tải được khiếu nại.</p>;

  const kn = detail.data.khieuNai;
  const tienTrinh = detail.data.tienTrinh;

  const isCskh = user.vai_tro === "CSKH" || user.vai_tro === "Admin";
  const isTnCskh = user.vai_tro === "TN CSKH" || user.vai_tro === "Admin";
  const isQl = user.vai_tro === "QL" || user.vai_tro === "Admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge trangThai={kn.trang_thai} />
        <span className="text-xs text-ink-soft">Tiếp nhận: {kn.ngay_tiep_nhan}</span>
        <span className="text-xs text-ink-soft">Người tạo: {kn.nguoi_tao ?? "—"}</span>
        <span className="text-xs text-ink-soft">Cập nhật: {kn.ngay_thay_doi}</span>
      </div>

      <CustomerInfoSection kn={kn} editable={isCskh} onSaved={invalidate} />
      <CrmSection kn={kn} editable={isCskh} onSaved={invalidate} />
      <TnCskhSection kn={kn} editable={isTnCskh} onSaved={invalidate} />
      <QlSection kn={kn} editable={isQl} onSaved={invalidate} />
      <DoiMaySection kn={kn} editable={isCskh} onSaved={invalidate} />
      <TienTrinhSection id={id} items={tienTrinh} onSaved={invalidate} />

      <ActionBar kn={kn} user={user} onDone={() => { invalidate(); }} onError={(m) => showToast(m, "error")} onClose={onClose} />
    </div>
  );
}

// ---------- Thông tin khách hàng ----------

function CustomerInfoSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const mucDoOpts = useSettingsOptions("muc_do");
  const nhomYeuCauOpts = useSettingsOptions("nhom_yeu_cau");
  const phanLoaiKhOpts = useSettingsOptions("phan_loai_kh");
  const nhomVanDeOpts = useSettingsOptions("nhom_van_de");
  const vanDeDauVaoOpts = useSettingsOptions("van_de_dau_vao");

  const [form, setForm] = useState({
    ten_khach: kn.ten_khach ?? "",
    id_lada: kn.id_lada ?? "",
    sale_khu_vuc: kn.sale_khu_vuc ?? "",
    tinh: kn.tinh ?? "",
    quan_huyen: kn.quan_huyen ?? "",
    phuong_xa: kn.phuong_xa ?? "",
    model: kn.model ?? "",
    hang: kn.hang ?? "",
    thong_tin_ban_dau: kn.thong_tin_ban_dau ?? "",
    nguoi_bao: kn.nguoi_bao ?? "",
    muc_do: kn.muc_do ?? "",
    nhom_yeu_cau: kn.nhom_yeu_cau ?? "",
    nhom_van_de: kn.nhom_van_de ?? "",
    van_de_dau_vao: kn.van_de_dau_vao ?? "",
    phan_loai_kh: kn.phan_loai_kh ?? "",
    ghi_chu_nguoi_tao: kn.ghi_chu_nguoi_tao ?? "",
  });

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) body[k] = v.trim() === "" ? null : v.trim();
      return api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, body);
    },
    onSuccess: () => {
      showToast("Đã lưu thông tin khách hàng", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const filteredVanDeDauVao = (vanDeDauVaoOpts.data ?? []).filter(
    (o) => !form.nhom_van_de || o.parent === form.nhom_van_de,
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <Card title="Thông tin khách hàng">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ReadField label="Tên khách hàng" value={kn.ten_khach} />
          <ReadField label="ID Lada" value={kn.id_lada} />
          <ReadField label="Sale khu vực" value={kn.sale_khu_vuc} />
          <ReadField label="Người báo" value={kn.nguoi_bao} />
          <ReadField label="Tỉnh" value={kn.tinh} />
          <ReadField label="Quận/Huyện" value={kn.quan_huyen} />
          <ReadField label="Phường/Xã" value={kn.phuong_xa} />
          <ReadField label="Model" value={kn.model} />
          <ReadField label="Hãng" value={kn.hang} />
          <ReadField label="Mức độ" value={kn.muc_do} />
          <ReadField label="Nhóm yêu cầu" value={kn.nhom_yeu_cau} />
          <ReadField label="Phân loại KH" value={kn.phan_loai_kh} />
          <ReadField label="Nhóm vấn đề" value={kn.nhom_van_de} />
          <ReadField label="Vấn đề đầu vào" value={kn.van_de_dau_vao} />
        </div>
        <div className="mt-3">
          <ReadField label="Thông tin ban đầu" value={kn.thong_tin_ban_dau} />
        </div>
        <div className="mt-3">
          <ReadField label="Ghi chú người tạo" value={kn.ghi_chu_nguoi_tao} />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Thông tin khách hàng">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Tên khách hàng">
          <Input value={form.ten_khach} onChange={(e) => setField("ten_khach", e.target.value)} />
        </Field>
        <Field label="ID Lada">
          <Input value={form.id_lada} onChange={(e) => setField("id_lada", e.target.value)} />
        </Field>
        <Field label="Sale khu vực">
          <Input value={form.sale_khu_vuc} onChange={(e) => setField("sale_khu_vuc", e.target.value)} />
        </Field>
        <Field label="Người báo">
          <Input value={form.nguoi_bao} onChange={(e) => setField("nguoi_bao", e.target.value)} />
        </Field>
        <Field label="Tỉnh">
          <Input value={form.tinh} onChange={(e) => setField("tinh", e.target.value)} />
        </Field>
        <Field label="Quận/Huyện">
          <Input value={form.quan_huyen} onChange={(e) => setField("quan_huyen", e.target.value)} />
        </Field>
        <Field label="Phường/Xã">
          <Input value={form.phuong_xa} onChange={(e) => setField("phuong_xa", e.target.value)} />
        </Field>
        <Field label="Model">
          <Input value={form.model} onChange={(e) => setField("model", e.target.value)} />
        </Field>
        <Field label="Hãng">
          <Input value={form.hang} onChange={(e) => setField("hang", e.target.value)} />
        </Field>
        <Field label="Mức độ">
          <Select
            options={(mucDoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder="— Chọn —"
            value={form.muc_do}
            onChange={(e) => setField("muc_do", e.target.value)}
          />
        </Field>
        <Field label="Nhóm yêu cầu">
          <Select
            options={(nhomYeuCauOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder="— Chọn —"
            value={form.nhom_yeu_cau}
            onChange={(e) => setField("nhom_yeu_cau", e.target.value)}
          />
        </Field>
        <Field label="Phân loại KH">
          <Select
            options={(phanLoaiKhOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder="— Chọn —"
            value={form.phan_loai_kh}
            onChange={(e) => setField("phan_loai_kh", e.target.value)}
          />
        </Field>
        <Field label="Nhóm vấn đề">
          <Select
            options={(nhomVanDeOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder="— Chọn —"
            value={form.nhom_van_de}
            onChange={(e) => {
              setField("nhom_van_de", e.target.value);
              setField("van_de_dau_vao", "");
            }}
          />
        </Field>
        <Field label="Vấn đề đầu vào">
          <Select
            options={filteredVanDeDauVao.map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder="— Chọn —"
            value={form.van_de_dau_vao}
            onChange={(e) => setField("van_de_dau_vao", e.target.value)}
            disabled={!form.nhom_van_de}
          />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Thông tin ban đầu">
            <Textarea rows={2} value={form.thong_tin_ban_dau} onChange={(e) => setField("thong_tin_ban_dau", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Ghi chú người tạo">
            <Textarea rows={2} value={form.ghi_chu_nguoi_tao} onChange={(e) => setField("ghi_chu_nguoi_tao", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-3 flex justify-end">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu..." : "Lưu thông tin khách hàng"}
          </Btn>
        </div>
      </form>
    </Card>
  );
}

// ---------- CRM Karofi ----------

function CrmSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const [crmId, setCrmId] = useState(kn.id_crm_karofi ?? "");

  useEffect(() => setCrmId(kn.id_crm_karofi ?? ""), [kn.id_crm_karofi]);

  const saveId = useMutation({
    mutationFn: () => api.patch<{ khieuNai: KhieuNai; crm_sync_warning?: string }>(`/khieu-nai/${kn.id}`, { id_crm_karofi: crmId.trim() === "" ? null : crmId.trim() }),
    onSuccess: (data) => {
      if (data.crm_sync_warning) {
        showToast(CRM_WARNING_MESSAGES[data.crm_sync_warning] ?? data.crm_sync_warning, "error");
      } else {
        showToast("Đã lưu ID CRM Karofi", "success");
      }
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const resync = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/dong-bo-crm`),
    onSuccess: () => {
      showToast("Đã đồng bộ lại dữ liệu CRM", "success");
      onSaved();
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : "ERROR";
      showToast(CRM_WARNING_MESSAGES[code] ?? `Đồng bộ thất bại: ${code}`, "error");
    },
  });

  return (
    <Card title="Dữ liệu CRM Karofi">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Field label="ID CRM Karofi">
            {editable ? (
              <Input value={crmId} onChange={(e) => setCrmId(e.target.value)} placeholder="Chưa có" />
            ) : (
              <p className="text-sm text-ink">{kn.id_crm_karofi ?? "—"}</p>
            )}
          </Field>
        </div>
        {editable && (
          <Btn variant="secondary" size="sm" disabled={saveId.isPending || crmId === (kn.id_crm_karofi ?? "")} onClick={() => saveId.mutate()}>
            {saveId.isPending ? "Đang lưu..." : "Lưu ID"}
          </Btn>
        )}
        <Btn variant="secondary" size="sm" disabled={!kn.id_crm_karofi || resync.isPending} onClick={() => resync.mutate()}>
          {resync.isPending ? "Đang đồng bộ..." : "Đồng bộ lại"}
        </Btn>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ReadField label="Ngày tiếp nhận CRM" value={kn.ngay_tiep_nhan_crm} />
        <ReadField label="Kết quả CRM" value={kn.ket_qua_crm} />
      </div>
      <div className="mt-3">
        <ReadField label="Thông tin xử lý CRM" value={kn.thong_tin_xu_ly_crm} />
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium text-ink-soft">Ngày KTV hoàn thành</p>
        {kn.ngay_ktv_hoan_thanh ? (
          <span className="mt-1 inline-block rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-300">
            Đã hoàn thành: {kn.ngay_ktv_hoan_thanh}
          </span>
        ) : (
          <span className="mt-1 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-300">
            Chưa hoàn thành
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium text-ink-soft">Giải trình ĐVBH</p>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-xs text-ink">{kn.thong_tin_giai_trinh_dvbh || "—"}</pre>
      </div>
    </Card>
  );
}

// ---------- Đánh giá lỗi (TN CSKH) ----------

function TnCskhSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const [form, setForm] = useState<{
    loi_nha_san_xuat: DanhGia3;
    loi_lap_dat: DanhGia3;
    loi_thai_do_ktv: DanhGia3;
    loi_quy_trinh_nskx: DanhGia3;
    ket_luan_khieu_nai: DanhGia3;
  }>({
    loi_nha_san_xuat: kn.loi_nha_san_xuat,
    loi_lap_dat: kn.loi_lap_dat,
    loi_thai_do_ktv: kn.loi_thai_do_ktv,
    loi_quy_trinh_nskx: kn.loi_quy_trinh_nskx,
    ket_luan_khieu_nai: kn.ket_luan_khieu_nai ?? "Chua danh gia",
  });

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, form),
    onSuccess: () => {
      showToast("Đã lưu đánh giá lỗi", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <Card title="Đánh giá lỗi (TN CSKH)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ReadField label="Lỗi nhà sản xuất" value={translateDanhGia(kn.loi_nha_san_xuat)} />
          <ReadField label="Lỗi lắp đặt" value={translateDanhGia(kn.loi_lap_dat)} />
          <ReadField label="Lỗi thái độ KTV" value={translateDanhGia(kn.loi_thai_do_ktv)} />
          <ReadField label="Lỗi quy trình NSKX" value={translateDanhGia(kn.loi_quy_trinh_nskx)} />
          <ReadField label="Kết luận khiếu nại" value={translateDanhGia(kn.ket_luan_khieu_nai)} />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Đánh giá lỗi (TN CSKH)">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Lỗi nhà sản xuất">
          <Select options={DANH_GIA_OPTIONS} value={form.loi_nha_san_xuat} onChange={(e) => setField("loi_nha_san_xuat", e.target.value as DanhGia3)} />
        </Field>
        <Field label="Lỗi lắp đặt">
          <Select options={DANH_GIA_OPTIONS} value={form.loi_lap_dat} onChange={(e) => setField("loi_lap_dat", e.target.value as DanhGia3)} />
        </Field>
        <Field label="Lỗi thái độ KTV">
          <Select options={DANH_GIA_OPTIONS} value={form.loi_thai_do_ktv} onChange={(e) => setField("loi_thai_do_ktv", e.target.value as DanhGia3)} />
        </Field>
        <Field label="Lỗi quy trình NSKX">
          <Select options={DANH_GIA_OPTIONS} value={form.loi_quy_trinh_nskx} onChange={(e) => setField("loi_quy_trinh_nskx", e.target.value as DanhGia3)} />
        </Field>
        <Field label="Kết luận khiếu nại">
          <Select options={DANH_GIA_OPTIONS} value={form.ket_luan_khieu_nai} onChange={(e) => setField("ket_luan_khieu_nai", e.target.value as DanhGia3)} />
        </Field>
        <div className="col-span-2 flex items-end justify-end sm:col-span-3">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu..." : "Lưu đánh giá lỗi"}
          </Btn>
        </div>
      </form>
    </Card>
  );
}

function translateDanhGia(v: DanhGia3 | null): string {
  if (v === "Khong") return "Không";
  if (v === "Co") return "Có";
  return "Chưa đánh giá";
}

// ---------- Đánh giá QL ----------

function QlSection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const lyDoOpts = useSettingsOptions("ly_do_cham");

  const [form, setForm] = useState({
    danh_gia_ql: kn.danh_gia_ql ?? "",
    ql_gio_xu_ly: kn.ql_gio_xu_ly !== null ? String(kn.ql_gio_xu_ly) : "",
    ql_chon_ngay_hen: kn.ql_chon_ngay_hen ?? "",
    ql_chon_ly_do: kn.ql_chon_ly_do ?? "",
  });

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, {
        danh_gia_ql: form.danh_gia_ql.trim() === "" ? null : form.danh_gia_ql.trim(),
        ql_gio_xu_ly: form.ql_gio_xu_ly.trim() === "" ? null : Number(form.ql_gio_xu_ly),
        ql_chon_ngay_hen: form.ql_chon_ngay_hen.trim() === "" ? null : form.ql_chon_ngay_hen.trim(),
        ql_chon_ly_do: form.ql_chon_ly_do.trim() === "" ? null : form.ql_chon_ly_do.trim(),
      }),
    onSuccess: () => {
      showToast("Đã lưu đánh giá QL", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <Card title="Đánh giá QL">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ReadField label="Đánh giá QL" value={kn.danh_gia_ql} />
          <ReadField label="Giờ xử lý" value={kn.ql_gio_xu_ly} />
          <ReadField label="Ngày hẹn" value={kn.ql_chon_ngay_hen} />
          <ReadField label="Lý do" value={kn.ql_chon_ly_do} />
          <ReadField label="Người đánh giá" value={kn.ql_nguoi_danh_gia} />
          <ReadField label="Ngày đánh giá" value={kn.ngay_ql_danh_gia} />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Đánh giá QL">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Đánh giá QL">
          <Input value={form.danh_gia_ql} onChange={(e) => setField("danh_gia_ql", e.target.value)} />
        </Field>
        <Field label="Giờ xử lý">
          <Input type="number" step="0.5" value={form.ql_gio_xu_ly} onChange={(e) => setField("ql_gio_xu_ly", e.target.value)} />
        </Field>
        <Field label="Ngày hẹn">
          <Input type="date" value={form.ql_chon_ngay_hen} onChange={(e) => setField("ql_chon_ngay_hen", e.target.value)} />
        </Field>
        <Field label="Lý do">
          <Select
            options={(lyDoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder="— Chọn —"
            value={form.ql_chon_ly_do}
            onChange={(e) => setField("ql_chon_ly_do", e.target.value)}
          />
        </Field>
        <ReadField label="Người đánh giá" value={kn.ql_nguoi_danh_gia} />
        <ReadField label="Ngày đánh giá" value={kn.ngay_ql_danh_gia} />
        <div className="col-span-2 flex items-end justify-end sm:col-span-3">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu..." : "Lưu đánh giá QL"}
          </Btn>
        </div>
      </form>
    </Card>
  );
}

// ---------- Nhánh đổi máy ----------

function DoiMaySection({ kn, editable, onSaved }: { kn: KhieuNai; editable: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    bo_phan_ban_giao: kn.bo_phan_ban_giao ?? "",
    ma_duyet_doi_linh_kien: kn.ma_duyet_doi_linh_kien ?? "",
    cam_co: kn.cam_co ?? "Khong co",
    ghi_chu_ly_do_cham: kn.ghi_chu_ly_do_cham ?? "",
    id_lada_phat_sinh: kn.id_lada_phat_sinh ?? "",
    ngay_ghi_nhan_doi_may: kn.ngay_ghi_nhan_doi_may ?? "",
    ngay_dong_doi_may: kn.ngay_dong_doi_may ?? "",
    giai_trinh_cham_doi_may: kn.giai_trinh_cham_doi_may ?? "",
    ket_qua_doi_may: kn.ket_qua_doi_may ?? "",
    nguoi_xac_nhan_doi_may: kn.nguoi_xac_nhan_doi_may ?? "",
  });

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) body[k] = v.trim() === "" ? null : v.trim();
      return api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, body);
    },
    onSuccess: () => {
      showToast("Đã lưu thông tin đổi máy", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <Card title="Nhánh đổi máy">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ReadField label="Bộ phận bàn giao" value={kn.bo_phan_ban_giao} />
          <ReadField label="Mã duyệt đổi linh kiện" value={kn.ma_duyet_doi_linh_kien} />
          <ReadField label="Cảm cờ" value={kn.cam_co} />
          <ReadField label="ID Lada phát sinh" value={kn.id_lada_phat_sinh} />
          <ReadField label="Ngày ghi nhận đổi máy" value={kn.ngay_ghi_nhan_doi_may} />
          <ReadField label="Ngày đóng đổi máy" value={kn.ngay_dong_doi_may} />
          <ReadField label="Kết quả đổi máy" value={kn.ket_qua_doi_may} />
          <ReadField label="Người xác nhận đổi máy" value={kn.nguoi_xac_nhan_doi_may} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReadField label="Ghi chú lý do chậm" value={kn.ghi_chu_ly_do_cham} />
          <ReadField label="Giải trình chậm đổi máy" value={kn.giai_trinh_cham_doi_may} />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Nhánh đổi máy">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Bộ phận bàn giao">
          <Input value={form.bo_phan_ban_giao} onChange={(e) => setField("bo_phan_ban_giao", e.target.value)} />
        </Field>
        <Field label="Mã duyệt đổi linh kiện">
          <Input value={form.ma_duyet_doi_linh_kien} onChange={(e) => setField("ma_duyet_doi_linh_kien", e.target.value)} />
        </Field>
        <Field label="Cảm cờ">
          <Select options={CAM_CO_OPTIONS} value={form.cam_co} onChange={(e) => setField("cam_co", e.target.value)} />
        </Field>
        <Field label="ID Lada phát sinh">
          <Input value={form.id_lada_phat_sinh} onChange={(e) => setField("id_lada_phat_sinh", e.target.value)} />
        </Field>
        <Field label="Ngày ghi nhận đổi máy">
          <Input type="date" value={form.ngay_ghi_nhan_doi_may} onChange={(e) => setField("ngay_ghi_nhan_doi_may", e.target.value)} />
        </Field>
        <Field label="Ngày đóng đổi máy">
          <Input type="date" value={form.ngay_dong_doi_may} onChange={(e) => setField("ngay_dong_doi_may", e.target.value)} />
        </Field>
        <Field label="Kết quả đổi máy">
          <Input value={form.ket_qua_doi_may} onChange={(e) => setField("ket_qua_doi_may", e.target.value)} />
        </Field>
        <Field label="Người xác nhận đổi máy">
          <Input value={form.nguoi_xac_nhan_doi_may} onChange={(e) => setField("nguoi_xac_nhan_doi_may", e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Ghi chú lý do chậm">
            <Textarea rows={2} value={form.ghi_chu_ly_do_cham} onChange={(e) => setField("ghi_chu_ly_do_cham", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Giải trình chậm đổi máy">
            <Textarea rows={2} value={form.giai_trinh_cham_doi_may} onChange={(e) => setField("giai_trinh_cham_doi_may", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-3 flex justify-end">
          <Btn type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu..." : "Lưu thông tin đổi máy"}
          </Btn>
        </div>
      </form>
    </Card>
  );
}

// ---------- Tiến trình ----------

function TienTrinhSection({ id, items, onSaved }: { id: string; items: TienTrinh[]; onSaved: () => void }) {
  const { showToast } = useToast();
  const [noiDung, setNoiDung] = useState("");
  const [lyDo, setLyDo] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ tienTrinh: TienTrinh }>(`/khieu-nai/${id}/tien-trinh`, {
        noi_dung_ghi_chep: noiDung.trim() === "" ? undefined : noiDung.trim(),
        ly_do_xu_ly_cham: lyDo.trim() === "" ? undefined : lyDo.trim(),
      }),
    onSuccess: () => {
      setNoiDung("");
      setLyDo("");
      showToast("Đã thêm ghi chú tiến trình", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Thêm ghi chú thất bại", "error"),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!noiDung.trim() && !lyDo.trim()) return;
    mutation.mutate();
  };

  return (
    <Card title="Tiến trình xử lý">
      <form onSubmit={submit} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Nội dung ghi chép">
            <Input value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="Ghi chú xử lý..." />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Lý do xử lý chậm (nếu có)">
            <Input value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="Lý do chậm..." />
          </Field>
        </div>
        <Btn type="submit" variant="secondary" disabled={mutation.isPending}>
          {mutation.isPending ? "Đang lưu..." : "Thêm ghi chú"}
        </Btn>
      </form>

      <ul className="flex flex-col gap-3">
        {items.length === 0 && <li className="text-sm text-ink-soft">Chưa có ghi chép tiến trình.</li>}
        {items.map((t) => (
          <li key={t.id} className="border-l-2 border-line pl-3">
            <p className="text-xs text-ink-soft">
              {t.ngay_tao} — {t.nguoi_tao}
            </p>
            {t.noi_dung_ghi_chep && <p className="text-sm text-ink">{t.noi_dung_ghi_chep}</p>}
            {t.ly_do_xu_ly_cham && <p className="text-sm text-amber-700">Lý do chậm: {t.ly_do_xu_ly_cham}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------- Action bar ----------

function ActionBar({
  kn,
  user,
  onDone,
  onError,
  onClose,
}: {
  kn: KhieuNai;
  user: AppUser;
  onDone: () => void;
  onError: (msg: string) => void;
  onClose: () => void;
}) {
  const canDongCa = (user.vai_tro === "TN CSKH" || user.vai_tro === "Admin") && kn.trang_thai === "Dang xu ly";
  const dongCaReady =
    kn.loi_nha_san_xuat !== "Chua danh gia" &&
    kn.loi_lap_dat !== "Chua danh gia" &&
    kn.loi_thai_do_ktv !== "Chua danh gia" &&
    kn.loi_quy_trinh_nskx !== "Chua danh gia" &&
    kn.ket_luan_khieu_nai !== "Chua danh gia" &&
    kn.ket_luan_khieu_nai !== null;

  const canChot = (user.vai_tro === "QL" || user.vai_tro === "Admin") && kn.trang_thai === "Cho chot ket thuc";
  const canHuy = (user.vai_tro === "CSKH" || user.vai_tro === "QL" || user.vai_tro === "Admin") && kn.trang_thai !== "Da ket thuc";

  const dongCa = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/dong-ca`),
    onSuccess: onDone,
    onError: (err) => onError(err instanceof ApiError ? mapDongCaError(err.code) : "Đóng ca thất bại"),
  });
  const chot = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/chot`),
    onSuccess: onDone,
    onError: (err) => onError(err instanceof ApiError ? `Chốt thất bại: ${err.code}` : "Chốt thất bại"),
  });
  const huy = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/huy`),
    onSuccess: onDone,
    onError: (err) => onError(err instanceof ApiError ? `Hủy thất bại: ${err.code}` : "Hủy thất bại"),
  });

  if (!canDongCa && !canChot && !canHuy) {
    return (
      <div className="flex justify-end">
        <Btn variant="secondary" onClick={onClose}>
          Đóng
        </Btn>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canDongCa && (
        <Btn
          variant="primary"
          disabled={!dongCaReady || dongCa.isPending}
          title={!dongCaReady ? "Cần đánh giá đầy đủ 4 lỗi + kết luận trước khi đóng ca" : undefined}
          onClick={() => dongCa.mutate()}
        >
          {dongCa.isPending ? "Đang đóng ca..." : "Đóng ca"}
        </Btn>
      )}
      {canChot && (
        <Btn variant="primary" disabled={chot.isPending} onClick={() => chot.mutate()}>
          {chot.isPending ? "Đang chốt..." : "Chốt"}
        </Btn>
      )}
      {canHuy && (
        <Btn variant="danger" disabled={huy.isPending} onClick={() => huy.mutate()}>
          {huy.isPending ? "Đang hủy..." : "Hủy khiếu nại"}
        </Btn>
      )}
      <Btn variant="secondary" onClick={onClose}>
        Đóng
      </Btn>
    </div>
  );
}

function mapDongCaError(code: string): string {
  if (code === "CAN_DANH_GIA_DAY_DU") return "Cần đánh giá đầy đủ 4 lỗi và kết luận trước khi đóng ca";
  if (code === "INVALID_STATE") return "Trạng thái hiện tại không cho phép đóng ca";
  return `Đóng ca thất bại: ${code}`;
}
