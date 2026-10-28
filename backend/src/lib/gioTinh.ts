// "Gio tinh" cho SLA cac loi vi pham (L1a/L1b/L2, chot 28/10/2026): dem gio lich binh thuong nhung BO
// TRON cac ngay Chu nhat va ngay le (bang ngay_nghi). Khong tinh theo khung gio lam viec trong ngay.
// Moi moc thoi gian la chuoi gio VN dang 'YYYY-MM-DD HH:MM:SS' (khong mui gio) nhu khap he thong;
// ben trong quy ve ms "VN-naive" (parse nhu UTC) de cong/tru, khong lien quan mui gio may chu.

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type NgayNghiSet = ReadonlySet<string>; // cac ngay 'YYYY-MM-DD'

function toMs(vn: string): number {
  return Date.parse(`${vn.slice(0, 19).replace(" ", "T")}Z`);
}

function toVn(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function laNgayNghi(dayStartMs: number, nghi: NgayNghiSet): boolean {
  const d = new Date(dayStartMs);
  return d.getUTCDay() === 0 || nghi.has(d.toISOString().slice(0, 10));
}

/** So gio tinh (bo CN + le) tu a den b; 0 neu b <= a. */
export function soGioTinh(a: string, b: string, nghi: NgayNghiSet): number {
  let t = toMs(a);
  const end = toMs(b);
  if (!(end > t)) return 0;
  let ms = 0;
  while (t < end) {
    const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
    const next = Math.min(dayStart + DAY_MS, end);
    if (!laNgayNghi(dayStart, nghi)) ms += next - t;
    t = next;
  }
  return ms / HOUR_MS;
}

/** Moc het han: cong `gio` gio tinh vao `moc`, bo qua CN + le. Moc roi vao ngay nghi -> bat dau dem tu dau ngay lam viec ke tiep. */
export function congGioTinh(moc: string, gio: number, nghi: NgayNghiSet): string {
  let t = toMs(moc);
  let conLai = gio * HOUR_MS;
  for (let guard = 0; guard < 3660; guard++) {
    const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    if (laNgayNghi(dayStart, nghi)) { t = dayEnd; continue; }
    const coThe = dayEnd - t;
    if (conLai <= coThe) return toVn(t + conLai);
    conLai -= coThe;
    t = dayEnd;
  }
  throw new Error("congGioTinh: vuot gioi han 10 nam");
}

export async function loadNgayNghi(db: D1Database): Promise<Set<string>> {
  const r = await db.prepare("SELECT ngay FROM ngay_nghi").all<{ ngay: string }>();
  return new Set(r.results.map((x) => x.ngay));
}
