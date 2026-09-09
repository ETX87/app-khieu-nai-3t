export type VaiTro = "Admin" | "Viewer" | "CSKH" | "NV Sale" | "Tổng đài viên" | "TN CSKH" | "QL";

export interface AppUser {
  email: string;
  ten: string | null;
  vai_tro: VaiTro | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  bi_khoa: boolean;
}

export interface AdminUserRow extends AppUser {
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

export type TrangThaiKhieuNai = "Cho tiep nhan" | "Dang xu ly" | "Cho chot ket thuc" | "Da ket thuc" | "Huy";
export type DanhGia3 = "Khong" | "Co" | "Chua danh gia";

export interface KhieuNai {
  id: string;
  ngay_tiep_nhan: string;
  ten_khach: string | null;
  sdt_khach: string | null;
  id_lada: string | null;
  sale_khu_vuc: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  phuong_xa: string | null;
  tinh_moi: string | null;
  phuong_xa_moi: string | null;
  model: string | null;
  hang: string | null;
  thong_tin_ban_dau: string | null;
  nguoi_bao: string | null;
  trang_thai: TrangThaiKhieuNai;
  id_crm_karofi: string | null;
  ngay_tiep_nhan_crm: string | null;
  ket_luan_khieu_nai: DanhGia3 | null;
  ngay_ket_thuc: string | null;
  nguoi_ket_thuc: string | null;
  loi_nha_san_xuat: DanhGia3;
  loi_lap_dat: DanhGia3;
  loi_thai_do_ktv: DanhGia3;
  loi_quy_trinh_nskx: DanhGia3;
  ghi_chu_nguoi_tao: string | null;
  ngay_thay_doi: string;
  nguoi_tao: string | null;
  muc_do: string | null;
  nhom_yeu_cau: string | null;
  nhom_van_de: string | null;
  van_de_dau_vao: string | null;
  ket_qua_crm: string | null;
  thong_tin_xu_ly_crm: string | null;
  ngay_ktv_hoan_thanh: string | null;
  ngay_ghi_nhan_doi_may: string | null;
  ngay_dong_doi_may: string | null;
  giai_trinh_cham_doi_may: string | null;
  ket_qua_doi_may: string | null;
  nguoi_xac_nhan_doi_may: string | null;
  cam_co: "Khong co" | "Co vang" | "Co do" | string;
  phan_loai_kh: string | null;
  cskh_tiep_nhan: string | null;
  ghi_chu_ly_do_cham: string | null;
  id_lada_phat_sinh: string | null;
  bo_phan_ban_giao: string | null;
  ma_duyet_doi_linh_kien: string | null;
  thong_tin_giai_trinh_dvbh: string | null;
  giai_trinh_dvbh_json: string | null;
  danh_gia_ql: string | null;
  ql_gio_xu_ly: number | null;
  ql_chon_ngay_hen: string | null;
  ql_chon_ly_do: string | null;
  ql_nguoi_danh_gia: string | null;
  ngay_ql_danh_gia: string | null;
  ql_gio_xu_ly_he_thong: number | null;
  nguoi_phu_trach: string | null;
  ly_do_huy: string | null;
  nguoi_huy: string | null;
  ngay_huy: string | null;
  crm_last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LichSu {
  id: string;
  khieu_nai_id: string;
  nguoi: string;
  thoi_diem: string;
  hanh_dong: string;
  truong: string | null;
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
}

export interface TienTrinh {
  id: string;
  khieu_nai_id: string;
  nguoi_tao: string;
  ngay_tao: string;
  noi_dung_ghi_chep: string | null;
  ly_do_xu_ly_cham: string | null;
}

export interface SettingsOption {
  id: string | number;
  nhom: string;
  gia_tri: string;
  parent: string | null;
  active: boolean | number;
}

export type SettingsNhom =
  | "ly_do_cham"
  | "nhom_van_de"
  | "van_de_dau_vao"
  | "danh_gia_cskh"
  | "phan_loai_kh"
  | "muc_do"
  | "nhom_yeu_cau"
  | "sale_khu_vuc"
  | "model"
  | "hang"
  | "tinh"
  | "quan_huyen"
  | "phuong_xa"
  | "tinh_moi"
  | "phuong_xa_moi"
  | "bo_phan_ban_giao";

export interface KhieuNaiStats {
  tong: number;
  cho_tiep_nhan: number;
  dang_xu_ly: number;
  cho_chot_ket_thuc: number;
  da_ket_thuc: number;
  huy: number;
  ton_dong_crm: number;
  theoNhomVanDe: { nhom_van_de: string; so_luong: number }[];
}
