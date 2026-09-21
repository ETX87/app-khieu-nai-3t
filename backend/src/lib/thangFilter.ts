// Bo loc "thang" dung chung cho Trang chu (/stats) va Bao cao (/bao-cao/*) - muc dich: tranh quet
// toan bo lich su khieu_nai (tang dan qua 2 nam) moi lan tai trang, ma chi doc phan du lieu can
// thiet: TOAN BO ca dang "ton" (chua dong/chua huy, khong phu thuoc thang nao) + cac ca da dong
// hoac huy TRONG pham vi thang duoc chon. Voi thang hien tai, ca dang ton van hien du (khong bi
// cat), chi phan lich su cu (da dong/huy o cac thang truoc) la duoc loai bo khoi ket qua.
export interface ThangCondition {
  sql: string;
  binds: unknown[];
}

const THANG_RE = /^\d{4}-\d{2}$/;

export function isValidThang(v: string | undefined | null): v is string {
  return !!v && THANG_RE.test(v);
}

export function buildThangCondition(thang: string, currentMonth: string): ThangCondition {
  const start = `${thang}-01 00:00:00`;
  // "datetime(?, '+1 month')" tinh moc dau thang ke tiep tu chinh gia tri bind (khong can bind rieng).
  const dongTrongThang = "(ngay_ket_thuc >= ? AND ngay_ket_thuc < datetime(?, '+1 month'))";
  const huyTrongThang = "(ngay_huy >= ? AND ngay_huy < datetime(?, '+1 month'))";
  const binds = [start, start, start, start];
  if (thang === currentMonth) {
    return { sql: `(trang_thai NOT IN ('Da ket thuc', 'Huy') OR ${dongTrongThang} OR ${huyTrongThang})`, binds };
  }
  return { sql: `(${dongTrongThang} OR ${huyTrongThang})`, binds };
}
