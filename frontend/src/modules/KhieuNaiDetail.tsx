import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
  type FormEvent, type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AppUser, DanhGia3, KhieuNai, LichSu, TienTrinh } from "../api/types";
import { fmtVN } from "../lib/formatVN";

// --- Theo dõi thay đổi chưa lưu ở tất cả các khu con ---
interface DirtyReg {
  setDirty: (id: string, v: boolean) => void;
  setSaver: (id: string, fn: () => Promise<unknown>) => void;
}
const DirtyCtx = createContext<DirtyReg | null>(null);

function useRegisterDirty(id: string, isDirty: boolean, save: () => Promise<unknown>) {
  const ctx = useContext(DirtyCtx);
  useEffect(() => {
    ctx?.setDirty(id, isDirty);
  }, [ctx, id, isDirty]);
  useEffect(() => {
    ctx?.setSaver(id, save);
  });
  useEffect(() => () => ctx?.setDirty(id, false), [ctx, id]);
}
import { useCreateSettingsOption, useSettingsOptions } from "../api/useSettingsOptions";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Combobox } from "../components/ui/Combobox";
import { StatusBadge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";

interface DetailResponse {
  khieuNai: KhieuNai;
  tienTrinh: TienTrinh[];
  lichSu: LichSu[];
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

const KET_QUA_DOI_MAY_OPTIONS = [
  { value: "Khong co", label: "Không có" },
  { value: "Dang xu ly", label: "Đang xử lý" },
  { value: "Doi thanh cong", label: "Đổi thành công" },
  { value: "Huy bo", label: "Hủy bỏ" },
  { value: "Doi khong thanh cong", label: "Đổi không thành công" },
];

const LY_DO_HUY_OPTIONS = [
  "Trùng lặp với đơn khác",
  "Khách hàng rút khiếu nại",
  "Nhập nhầm / sai hệ thống",
  "Không liên hệ được khách",
  "Không thuộc phạm vi xử lý",
  "Lý do khác",
];

// Dịch giá trị mã hoá sang nhãn hiển thị (dùng cho cả chế độ đọc). Hai nhóm có value trùng
// ("Khong co") nên phải tra riêng theo từng nhóm.
function labelFrom(opts: { value: string; label: string }[], v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  return opts.find((o) => o.value === v)?.label ?? v;
}
const camCoLabel = (v: string | null | undefined) => labelFrom(CAM_CO_OPTIONS, v);
const ketQuaDoiMayLabel = (v: string | null | undefined) => labelFrom(KET_QUA_DOI_MAY_OPTIONS, v);

const CRM_WARNING_MESSAGES: Record<string, string> = {
  DVBH_NOT_FOUND: "Không tìm thấy case trên CRM Karofi",
  DVBH_LOOKUP_FAILED: "Không thể kết nối CRM Karofi lúc này",
  CASE_CLOSED: "Khiếu nại đã kết thúc, không thể đồng bộ lại",
  RESYNC_TOO_SOON: "Vui lòng đợi ít nhất 5 giây giữa 2 lần đồng bộ",
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
  onDirtyChange,
}: {
  id: string;
  user: AppUser;
  onClose: () => void;
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const detail = useQuery({
    queryKey: ["khieu-nai", id],
    queryFn: () => api.get<DetailResponse>(`/khieu-nai/${id}`),
  });

  // Registry theo dõi khu nào có thay đổi chưa lưu (hooks phải đặt trước mọi return sớm).
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const saversRef = useRef<Record<string, () => Promise<unknown>>>({});
  const dirtyReg = useMemo<DirtyReg>(
    () => ({
      setDirty: (sid, v) => setDirtyMap((m) => (m[sid] === v ? m : { ...m, [sid]: v })),
      setSaver: (sid, fn) => {
        saversRef.current[sid] = fn;
      },
    }),
    [],
  );
  const dirtyIds = Object.keys(dirtyMap).filter((k) => dirtyMap[k]);
  useEffect(() => {
    onDirtyChange?.(dirtyIds.length > 0);
  }, [dirtyIds.length, onDirtyChange]);
  const [savingAll, setSavingAll] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["khieu-nai", id] });
    onChanged();
  };

  const saveAll = async () => {
    setSavingAll(true);
    try {
      for (const sid of dirtyIds) await saversRef.current[sid]?.();
      showToast("Đã lưu tất cả thay đổi", "success");
    } catch {
      showToast("Có khu chưa lưu được — kiểm tra lại", "error");
    } finally {
      setSavingAll(false);
    }
  };

  if (detail.isLoading) return <p className="py-8 text-center text-sm text-ink-soft">Đang tải...</p>;
  if (detail.isError || !detail.data) return <p className="py-8 text-center text-sm text-red-600">Không tải được khiếu nại.</p>;

  const kn = detail.data.khieuNai;
  const tienTrinh = detail.data.tienTrinh;
  const lichSu = detail.data.lichSu ?? [];

  const isClosed = kn.trang_thai === "Da ket thuc";
  const isCskh = (user.vai_tro === "CSKH" || user.vai_tro === "Admin") && !isClosed;
  const isTnCskh = (user.vai_tro === "TN CSKH" || user.vai_tro === "Admin") && !isClosed;
  const isQl = (user.vai_tro === "QL" || user.vai_tro === "Admin") && !isClosed;
  const canDanhGia4Loi = isCskh || isTnCskh || isQl;
  const canXuLyDoiMay = isCskh || isTnCskh || isQl;
  const canThemTienTrinh = (["CSKH", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "")) && !isClosed;
  const canPhuTrach = (["CSKH", "KTV", "TN CSKH", "QL", "Admin"].includes(user.vai_tro ?? "")) && !isClosed;

  const copyId = () => {
    navigator.clipboard?.writeText(kn.id).then(
      () => showToast(`Đã sao chép mã đơn ${kn.id}`, "success"),
      () => showToast("Không sao chép được", "error"),
    );
  };

  return (
    <DirtyCtx.Provider value={dirtyReg}>
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusBadge trangThai={kn.trang_thai} />
        <button
          type="button"
          onClick={copyId}
          className="rounded border border-line px-2 py-0.5 font-mono text-xs text-ink-soft hover:bg-gray-50"
          title="Sao chép mã đơn"
        >
          {kn.id} ⧉
        </button>
        <span className="text-xs text-ink-soft">Tiếp nhận {fmtVN.dateTime(kn.ngay_tiep_nhan)}</span>
        <span className="text-xs text-ink-soft">· Cập nhật {fmtVN.relative(kn.ngay_thay_doi)}</span>
        <span className="text-xs text-ink-soft">· Người tạo {kn.nguoi_tao ?? "—"}</span>
      </div>

      {isClosed && (
        <div className="flex items-center justify-between rounded-md bg-gray-100 px-3 py-2 text-xs font-medium text-ink-soft ring-1 ring-inset ring-line">
          <span>Ca đã kết thúc — chỉ xem. Mọi thay đổi đã bị khoá.</span>
          {user.vai_tro === "Admin" && <MoLaiButton id={id} onDone={invalidate} onError={(m) => showToast(m, "error")} />}
        </div>
      )}

      <NguoiPhuTrachSection kn={kn} user={user} canEdit={canPhuTrach} onSaved={invalidate} />
      <CustomerInfoSection kn={kn} editable={isCskh} onSaved={invalidate} />
      <TienTrinhSection id={id} items={tienTrinh} lichSu={lichSu} canThem={canThemTienTrinh} onSaved={invalidate} />
      <CrmSection kn={kn} user={user} onSaved={invalidate} />
      <DoiMaySection kn={kn} editable={canXuLyDoiMay} onSaved={invalidate} />
      <TnCskhSection kn={kn} editable={canDanhGia4Loi} onSaved={invalidate} />
      <QlSection kn={kn} editable={isQl} onSaved={invalidate} />

      {dirtyIds.length > 0 && (
        <div className="sticky bottom-0 z-10 -mx-5 flex items-center justify-between gap-3 border-t border-amber-300 bg-amber-50 px-5 py-2.5 text-sm text-amber-900">
          <span>{dirtyIds.length} khu có thay đổi chưa lưu.</span>
          <Btn variant="primary" size="sm" disabled={savingAll} onClick={saveAll}>
            {savingAll ? "Đang lưu..." : "Lưu tất cả thay đổi"}
          </Btn>
        </div>
      )}

      <ActionBar kn={kn} user={user} onDone={() => { invalidate(); }} onError={(m) => showToast(m, "error")} onClose={onClose} />
    </div>
    </DirtyCtx.Provider>
  );
}

function MoLaiButton({ id, onDone, onError }: { id: string; onDone: () => void; onError: (m: string) => void }) {
  const m = useMutation({
    mutationFn: (ly_do: string) => api.post(`/khieu-nai/${id}/mo-lai`, { ly_do }),
    onSuccess: onDone,
    onError: (e) => onError(e instanceof ApiError ? `Mở lại thất bại: ${e.code}` : "Mở lại thất bại"),
  });
  return (
    <button
      type="button"
      className="rounded border border-line bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-gray-50"
      onClick={() => {
        const ly_do = window.prompt("Lý do mở lại ca (bắt buộc):");
        if (ly_do && ly_do.trim()) m.mutate(ly_do.trim());
      }}
    >
      Mở lại ca
    </button>
  );
}

function NguoiPhuTrachSection({
  kn, user, canEdit, onSaved,
}: { kn: KhieuNai; user: AppUser; canEdit: boolean; onSaved: () => void }) {
  const { showToast } = useToast();
  const m = useMutation({
    mutationFn: (email: string | null) => api.post(`/khieu-nai/${kn.id}/phu-trach`, { email }),
    onSuccess: () => { showToast("Đã cập nhật người phụ trách", "success"); onSaved(); },
    onError: (e) => showToast(e instanceof ApiError ? `Lỗi: ${e.code}` : "Lỗi", "error"),
  });
  const mine = kn.nguoi_phu_trach === user.email;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm">
      <span className="text-xs font-medium text-ink-soft">Người phụ trách:</span>
      <span className="font-medium text-ink">{kn.nguoi_phu_trach ?? "Chưa có"}</span>
      {canEdit && !mine && (
        <Btn size="sm" variant="secondary" disabled={m.isPending} onClick={() => m.mutate(user.email)}>
          Nhận ca
        </Btn>
      )}
      {canEdit && kn.nguoi_phu_trach && (
        <Btn size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate(null)}>
          Gỡ
        </Btn>
      )}
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

  const [form, setForm] = useState({
    ten_khach: kn.ten_khach ?? "",
    sdt_khach: kn.sdt_khach ?? "",
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

  const serverForm = {
    ten_khach: kn.ten_khach ?? "", sdt_khach: kn.sdt_khach ?? "", id_lada: kn.id_lada ?? "",
    sale_khu_vuc: kn.sale_khu_vuc ?? "", tinh: kn.tinh ?? "", quan_huyen: kn.quan_huyen ?? "",
    phuong_xa: kn.phuong_xa ?? "", model: kn.model ?? "", hang: kn.hang ?? "",
    thong_tin_ban_dau: kn.thong_tin_ban_dau ?? "", nguoi_bao: kn.nguoi_bao ?? "",
    muc_do: kn.muc_do ?? "", nhom_yeu_cau: kn.nhom_yeu_cau ?? "", nhom_van_de: kn.nhom_van_de ?? "",
    van_de_dau_vao: kn.van_de_dau_vao ?? "", phan_loai_kh: kn.phan_loai_kh ?? "",
    ghi_chu_nguoi_tao: kn.ghi_chu_nguoi_tao ?? "",
  };
  const isDirty = editable && JSON.stringify(form) !== JSON.stringify(serverForm);

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
  useRegisterDirty("khach", isDirty, () => mutation.mutateAsync());

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
          <ReadField label="Số điện thoại" value={kn.sdt_khach} />
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
        <Field label="Số điện thoại">
          <Input value={form.sdt_khach} onChange={(e) => setField("sdt_khach", e.target.value)} inputMode="tel" />
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
        <Field label="Phân loại KH">
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

function CrmSection({ kn, user, onSaved }: { kn: KhieuNai; user: AppUser; onSaved: () => void }) {
  const { showToast } = useToast();
  const editable = user.vai_tro === "CSKH" || user.vai_tro === "Admin";
  const canResync = !!user.vai_tro && user.vai_tro !== "Viewer" && kn.trang_thai !== "Da ket thuc";
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
  useRegisterDirty("crm_id", editable && crmId.trim() !== (kn.id_crm_karofi ?? ""), () => saveId.mutateAsync());

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
        {canResync && (
          <Btn
            variant="secondary"
            size="sm"
            disabled={!kn.id_crm_karofi || resync.isPending}
            title={kn.trang_thai === "Da ket thuc" ? "Khiếu nại đã kết thúc, không thể đồng bộ lại" : undefined}
            onClick={() => resync.mutate()}
          >
            {resync.isPending ? "Đang đồng bộ..." : "Đồng bộ lại"}
          </Btn>
        )}
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

  const serverForm = {
    loi_nha_san_xuat: kn.loi_nha_san_xuat, loi_lap_dat: kn.loi_lap_dat,
    loi_thai_do_ktv: kn.loi_thai_do_ktv, loi_quy_trinh_nskx: kn.loi_quy_trinh_nskx,
    ket_luan_khieu_nai: kn.ket_luan_khieu_nai ?? "Chua danh gia",
  };
  const isDirty = editable && JSON.stringify(form) !== JSON.stringify(serverForm);

  const mutation = useMutation({
    mutationFn: () => api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, form),
    onSuccess: () => {
      showToast("Đã lưu đánh giá lỗi", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });
  useRegisterDirty("danh_gia_loi", isDirty, () => mutation.mutateAsync());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <Card title="Đánh giá nguyên nhân lỗi">
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
    <Card title="Đánh giá nguyên nhân lỗi">
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
  const danhGiaQlOpts = useSettingsOptions("danh_gia_cskh");

  const [form, setForm] = useState({
    danh_gia_ql: kn.danh_gia_ql ?? "",
    ql_chon_ngay_hen: kn.ql_chon_ngay_hen ?? "",
    ql_chon_ly_do: kn.ql_chon_ly_do ?? "",
  });

  // D4: giờ xử lý do hệ thống tính (tiếp nhận -> kết thúc | hiện tại), không nhập tay.
  const gioXuLy = fmtVN.gioXuLy(kn.ngay_tiep_nhan, kn.trang_thai === "Da ket thuc" ? kn.ngay_ket_thuc : null);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const serverForm = {
    danh_gia_ql: kn.danh_gia_ql ?? "",
    ql_chon_ngay_hen: kn.ql_chon_ngay_hen ?? "",
    ql_chon_ly_do: kn.ql_chon_ly_do ?? "",
  };
  const isDirty = editable && JSON.stringify(form) !== JSON.stringify(serverForm);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<{ khieuNai: KhieuNai }>(`/khieu-nai/${kn.id}`, {
        danh_gia_ql: form.danh_gia_ql.trim() === "" ? null : form.danh_gia_ql.trim(),
        ql_chon_ngay_hen: form.ql_chon_ngay_hen.trim() === "" ? null : form.ql_chon_ngay_hen.trim(),
        ql_chon_ly_do: form.ql_chon_ly_do.trim() === "" ? null : form.ql_chon_ly_do.trim(),
      }),
    onSuccess: () => {
      showToast("Đã lưu đánh giá QL", "success");
      onSaved();
    },
    onError: (err) => showToast(err instanceof ApiError ? `Lỗi: ${err.code}` : "Lưu thất bại", "error"),
  });
  useRegisterDirty("danh_gia_ql", isDirty, () => mutation.mutateAsync());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!editable) {
    return (
      <Card title="Đánh giá QL">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ReadField label="Đánh giá QL" value={kn.danh_gia_ql} />
          <ReadField label="Giờ xử lý (hệ thống)" value={kn.ql_gio_xu_ly_he_thong ?? gioXuLy} />
          <ReadField label="Ngày hẹn" value={kn.ql_chon_ngay_hen} />
          <ReadField label="Lý do" value={kn.ql_chon_ly_do} />
          <ReadField label="Người đánh giá" value={kn.ql_nguoi_danh_gia} />
          <ReadField label="Ngày đánh giá" value={fmtVN.dateTime(kn.ngay_ql_danh_gia)} />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Đánh giá QL">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Đánh giá QL">
          <Select
            options={(danhGiaQlOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            placeholder="— Chọn —"
            value={form.danh_gia_ql}
            onChange={(e) => setField("danh_gia_ql", e.target.value)}
          />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-soft">Giờ xử lý (hệ thống)</p>
          <p className="rounded-md border border-line bg-gray-50 px-2.5 py-1.5 text-sm text-ink">{gioXuLy}</p>
          <p className="mt-1 text-xs text-ink-soft">Tự tính từ ngày tiếp nhận đến khi kết thúc.</p>
        </div>
        <Field label="Ngày hẹn">
          <Input type="date" value={form.ql_chon_ngay_hen} onChange={(e) => setField("ql_chon_ngay_hen", e.target.value)} />
        </Field>
        <Field label="Lý do" hint="Free text - vì sao có ngày hẹn này">
          <Input value={form.ql_chon_ly_do} onChange={(e) => setField("ql_chon_ly_do", e.target.value)} />
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
  const lyDoChamOpts = useSettingsOptions("ly_do_cham");
  const boPhanBanGiaoOpts = useSettingsOptions("bo_phan_ban_giao");
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

  const serverForm = {
    bo_phan_ban_giao: kn.bo_phan_ban_giao ?? "", ma_duyet_doi_linh_kien: kn.ma_duyet_doi_linh_kien ?? "",
    cam_co: kn.cam_co ?? "Khong co", ghi_chu_ly_do_cham: kn.ghi_chu_ly_do_cham ?? "",
    id_lada_phat_sinh: kn.id_lada_phat_sinh ?? "", ngay_ghi_nhan_doi_may: kn.ngay_ghi_nhan_doi_may ?? "",
    ngay_dong_doi_may: kn.ngay_dong_doi_may ?? "", giai_trinh_cham_doi_may: kn.giai_trinh_cham_doi_may ?? "",
    ket_qua_doi_may: kn.ket_qua_doi_may ?? "", nguoi_xac_nhan_doi_may: kn.nguoi_xac_nhan_doi_may ?? "",
  };
  const isDirty = editable && JSON.stringify(form) !== JSON.stringify(serverForm);

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
  useRegisterDirty("doi_may", isDirty, () => mutation.mutateAsync());

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
          <ReadField label="Cảm cờ" value={camCoLabel(kn.cam_co)} />
          <ReadField label="ID Lada phát sinh" value={kn.id_lada_phat_sinh} />
          <ReadField label="Ngày ghi nhận đổi máy" value={kn.ngay_ghi_nhan_doi_may} />
          <ReadField label="Ngày đóng đổi máy" value={kn.ngay_dong_doi_may} />
          <ReadField label="Kết quả đổi máy" value={ketQuaDoiMayLabel(kn.ket_qua_doi_may)} />
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
          <Combobox
            options={(boPhanBanGiaoOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
            value={form.bo_phan_ban_giao}
            onChange={(v) => setField("bo_phan_ban_giao", v)}
          />
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
          <Select
            options={KET_QUA_DOI_MAY_OPTIONS}
            placeholder="— Chọn —"
            value={form.ket_qua_doi_may}
            onChange={(e) => setField("ket_qua_doi_may", e.target.value)}
          />
        </Field>
        <Field label="Người xác nhận đổi máy">
          <Input value={form.nguoi_xac_nhan_doi_may} onChange={(e) => setField("nguoi_xac_nhan_doi_may", e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Ghi chú lý do chậm" hint="Báo cáo chậm #1 — lý do chậm chung của ca (từ danh mục)">
            <Combobox
              options={(lyDoChamOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.ghi_chu_ly_do_cham}
              onChange={(v) => setField("ghi_chu_ly_do_cham", v)}
            />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Giải trình chậm đổi máy" hint="Báo cáo chậm #2 — lý do chậm riêng của nhánh đổi máy (từ danh mục)">
            <Combobox
              options={(lyDoChamOpts.data ?? []).map((o) => ({ value: o.gia_tri, label: o.gia_tri }))}
              value={form.giai_trinh_cham_doi_may}
              onChange={(v) => setField("giai_trinh_cham_doi_may", v)}
            />
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

// ---------- Tiến trình & lịch sử ----------

function useNameMap() {
  const q = useQuery({
    queryKey: ["nguoi-directory"],
    queryFn: () => api.get<{ items: { email: string; ten: string | null }[] }>("/auth/nguoi-directory"),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const m = new Map<string, string>();
    (q.data?.items ?? []).forEach((r) => { if (r.ten) m.set(r.email, r.ten); });
    return (email: string | null | undefined) => (email ? m.get(email) ?? email : "—");
  }, [q.data]);
}

const LS_LABEL: Record<string, string> = {
  chuyen_trang_thai: "Chuyển trạng thái",
  danh_gia_loi: "Đánh giá nguyên nhân lỗi",
  danh_gia_ql: "Đánh giá QL",
  huy: "Hủy khiếu nại",
  mo_lai: "Mở lại ca",
  phu_trach: "Đổi người phụ trách",
};

function TienTrinhSection({
  id,
  items,
  lichSu,
  canThem,
  onSaved,
}: {
  id: string;
  items: TienTrinh[];
  lichSu: LichSu[];
  canThem: boolean;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const nameOf = useNameMap();
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

  type Row = { key: string; ts: string; who: string; body: ReactNode };
  const rows: Row[] = [
    ...items.map((t) => ({
      key: `t-${t.id}`,
      ts: t.ngay_tao,
      who: nameOf(t.nguoi_tao),
      body: (
        <>
          {t.noi_dung_ghi_chep && <p className="text-sm text-ink">{t.noi_dung_ghi_chep}</p>}
          {t.ly_do_xu_ly_cham && <p className="text-sm text-amber-700">Lý do chậm: {t.ly_do_xu_ly_cham}</p>}
        </>
      ),
    })),
    ...lichSu.map((l) => ({
      key: `l-${l.id}`,
      ts: l.thoi_diem,
      who: nameOf(l.nguoi),
      body: (
        <p className="text-sm text-ink-soft">
          {LS_LABEL[l.hanh_dong] ?? l.hanh_dong}
          {l.gia_tri_moi ? `: ${l.gia_tri_moi}` : ""}
        </p>
      ),
    })),
  ].sort((a, b) => (a.ts < b.ts ? 1 : -1));

  return (
    <Card title="Tiến trình xử lý & lịch sử">
      {canThem && (
        <form onSubmit={submit} className="mb-4 flex flex-col gap-2">
          <Field label="Nội dung ghi chép">
            <Textarea rows={2} value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="Ghi chú xử lý..." />
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Lý do xử lý chậm (nếu có)">
                <Input value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="Lý do chậm..." />
              </Field>
            </div>
            <Btn type="submit" variant="secondary" disabled={mutation.isPending}>
              {mutation.isPending ? "Đang lưu..." : "Thêm ghi chú"}
            </Btn>
          </div>
        </form>
      )}

      <ul className="flex flex-col gap-3">
        {rows.length === 0 && <li className="text-sm text-ink-soft">Chưa có ghi chép tiến trình.</li>}
        {rows.map((r) => (
          <li key={r.key} className="border-l-2 border-line pl-3">
            <p className="text-xs text-ink-soft">
              {fmtVN.dateTime(r.ts)} · {r.who}
            </p>
            {r.body}
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
  const [confirmChot, setConfirmChot] = useState(false);
  const [huyOpen, setHuyOpen] = useState(false);
  const [lyDoHuy, setLyDoHuy] = useState(LY_DO_HUY_OPTIONS[0]);
  const [ghiChuHuy, setGhiChuHuy] = useState("");

  const canDongCa = (user.vai_tro === "TN CSKH" || user.vai_tro === "Admin") && kn.trang_thai === "Dang xu ly";
  const checklist: { label: string; ok: boolean }[] = [
    { label: "Lỗi nhà sản xuất", ok: kn.loi_nha_san_xuat !== "Chua danh gia" },
    { label: "Lỗi lắp đặt", ok: kn.loi_lap_dat !== "Chua danh gia" },
    { label: "Lỗi thái độ KTV", ok: kn.loi_thai_do_ktv !== "Chua danh gia" },
    { label: "Lỗi quy trình NSKX", ok: kn.loi_quy_trinh_nskx !== "Chua danh gia" },
    { label: "Kết luận khiếu nại", ok: kn.ket_luan_khieu_nai !== "Chua danh gia" && kn.ket_luan_khieu_nai !== null },
  ];
  const dongCaReady = checklist.every((c) => c.ok);

  const canChot = (user.vai_tro === "QL" || user.vai_tro === "Admin") && kn.trang_thai === "Cho chot ket thuc";
  const canHuy =
    (user.vai_tro === "CSKH" || user.vai_tro === "TN CSKH" || user.vai_tro === "QL" || user.vai_tro === "Admin") &&
    kn.trang_thai !== "Da ket thuc";

  const dongCa = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/dong-ca`),
    onSuccess: onDone,
    onError: (err) => onError(err instanceof ApiError ? mapDongCaError(err.code) : "Đóng ca thất bại"),
  });
  const chot = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/chot`),
    onSuccess: () => { setConfirmChot(false); onDone(); },
    onError: (err) => {
      setConfirmChot(false);
      onError(
        err instanceof ApiError
          ? err.code === "CAN_DANH_GIA_QL"
            ? "Cần nhập Đánh giá QL trước khi chốt"
            : `Chốt thất bại: ${err.code}`
          : "Chốt thất bại",
      );
    },
  });
  const huy = useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/khieu-nai/${kn.id}/huy`, { ly_do_huy: lyDoHuy, ghi_chu: ghiChuHuy.trim() || undefined }),
    onSuccess: () => { setHuyOpen(false); onDone(); },
    onError: (err) => onError(err instanceof ApiError ? `Hủy thất bại: ${err.code}` : "Hủy thất bại"),
  });

  if (!canDongCa && !canChot && !canHuy) {
    return (
      <div className="flex justify-end">
        <Btn variant="secondary" onClick={onClose}>Đóng</Btn>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {canDongCa && !dongCaReady && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-300">
          <span className="font-medium">Chưa đủ điều kiện đóng ca:</span>{" "}
          {checklist.map((c) => (
            <span key={c.label} className="mr-2 inline-block">
              {c.ok ? "✓" : "✗"} {c.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {canDongCa && (
          <Btn
            variant="primary"
            disabled={!dongCaReady || dongCa.isPending}
            onClick={() => dongCa.mutate()}
          >
            {dongCa.isPending ? "Đang đóng ca..." : "Đóng ca"}
          </Btn>
        )}
        {canChot && (
          <Btn variant="primary" disabled={chot.isPending} onClick={() => setConfirmChot(true)}>
            Chốt
          </Btn>
        )}
        {canHuy && (
          <Btn variant="danger" disabled={huy.isPending} onClick={() => setHuyOpen(true)}>
            Hủy khiếu nại
          </Btn>
        )}
        <Btn variant="secondary" onClick={onClose}>Đóng</Btn>
      </div>

      {confirmChot && (
        <ConfirmBox
          title="Xác nhận chốt khiếu nại"
          body={
            <>
              <p>Mã đơn: <span className="font-mono">{kn.id}</span></p>
              <p>Kết luận khiếu nại: <b>{translateDanhGia(kn.ket_luan_khieu_nai)}</b></p>
              <p>Đánh giá QL: <b>{kn.danh_gia_ql || "(chưa nhập — không chốt được)"}</b></p>
              <p className="mt-1 text-ink-soft">Sau khi chốt, ca chuyển sang “Đã kết thúc” và bị khoá.</p>
            </>
          }
          confirmLabel={chot.isPending ? "Đang chốt..." : "Chốt"}
          confirmDisabled={chot.isPending || !kn.danh_gia_ql}
          onConfirm={() => chot.mutate()}
          onCancel={() => setConfirmChot(false)}
        />
      )}

      {huyOpen && (
        <ConfirmBox
          title="Hủy khiếu nại"
          body={
            <div className="flex flex-col gap-2">
              <p>Mã đơn: <span className="font-mono">{kn.id}</span></p>
              <label className="text-xs font-medium text-ink-soft">Lý do hủy *</label>
              <Select
                options={LY_DO_HUY_OPTIONS.map((v) => ({ value: v, label: v }))}
                value={lyDoHuy}
                onChange={(e) => setLyDoHuy(e.target.value)}
              />
              <label className="text-xs font-medium text-ink-soft">Ghi chú thêm</label>
              <Textarea rows={2} value={ghiChuHuy} onChange={(e) => setGhiChuHuy(e.target.value)} />
            </div>
          }
          confirmLabel={huy.isPending ? "Đang hủy..." : "Xác nhận hủy"}
          confirmDisabled={huy.isPending || !lyDoHuy}
          danger
          onConfirm={() => huy.mutate()}
          onCancel={() => setHuyOpen(false)}
        />
      )}
    </div>
  );
}

function ConfirmBox({
  title, body, confirmLabel, confirmDisabled, danger, onConfirm, onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
        <div className="space-y-1 text-sm text-ink">{body}</div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={onCancel}>Không</Btn>
          <Btn variant={danger ? "danger" : "primary"} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function mapDongCaError(code: string): string {
  if (code === "CAN_DANH_GIA_DAY_DU") return "Cần đánh giá đầy đủ 4 lỗi và kết luận trước khi đóng ca";
  if (code === "INVALID_STATE") return "Trạng thái hiện tại không cho phép đóng ca";
  return `Đóng ca thất bại: ${code}`;
}
