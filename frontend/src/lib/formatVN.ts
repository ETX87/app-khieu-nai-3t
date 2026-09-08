// Chuoi thoi gian tu backend la "gio VN nhung khong co timezone" (nowVN): "YYYY-MM-DD HH:MM:SS".
// Parse nhu UTC, so voi "bay gio + 7h" de ra chenh lech thuc.
function parseVnNaive(s: string): number | null {
  if (!s) return null;
  const t = new Date(s.replace(" ", "T").replace(/\+.*$/, "") + "Z").getTime();
  return Number.isFinite(t) ? t : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export const fmtVN = {
  // "05/09 08:12"
  dateTime(s: string | null | undefined): string {
    if (!s) return "—";
    const t = parseVnNaive(s);
    if (t === null) return s;
    const d = new Date(t);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  },
  // "05/09/2026"
  date(s: string | null | undefined): string {
    if (!s) return "—";
    const t = parseVnNaive(s);
    if (t === null) return s.slice(0, 10);
    const d = new Date(t);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  },
  // "2 giờ trước", "3 ngày trước"
  relative(s: string | null | undefined): string {
    if (!s) return "—";
    const t = parseVnNaive(s);
    if (t === null) return s;
    const nowVn = Date.now() + 7 * 3600 * 1000;
    const diffMin = Math.round((nowVn - t) / 60000);
    if (diffMin < 1) return "vừa xong";
    if (diffMin < 60) return `${diffMin} phút trước`;
    const h = Math.round(diffMin / 60);
    if (h < 24) return `${h} giờ trước`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d} ngày trước`;
    return fmtVN.date(s);
  },
  // So gio xu ly (tiep nhan -> ket thuc | bay gio)
  gioXuLy(tiepNhan: string | null | undefined, ketThuc: string | null | undefined): string {
    const a = tiepNhan ? parseVnNaive(tiepNhan) : null;
    if (a === null) return "—";
    const b = ketThuc ? parseVnNaive(ketThuc) : Date.now() + 7 * 3600 * 1000;
    const h = Math.max(0, (b! - a) / 3_600_000);
    if (h < 1) return "< 1 giờ";
    if (h < 48) return `${Math.round(h)} giờ`;
    return `${Math.round(h / 24)} ngày (${Math.round(h)} giờ)`;
  },
};
