// SQLite (D1) LIKE/LOWER chi khong phan biet hoa-thuong voi ky tu ASCII: go "đặng" khong ra "Đặng".
// Thu them cac bien the hoa-thuong pho bien cua tu khoa (nguyen van / thuong / HOA / Viet Hoa Dau Tu)
// - LIKE van tu lo phan ASCII.
export function viLikeClause(columns: string[], search: string): { sql: string; binds: string[] } {
  const lower = search.toLocaleLowerCase("vi");
  const titled = lower.replace(/(^|\s)(\S)/g, (_m, sp: string, ch: string) => sp + ch.toLocaleUpperCase("vi"));
  const variants = [...new Set([search, lower, search.toLocaleUpperCase("vi"), titled])];
  const parts: string[] = [];
  const binds: string[] = [];
  for (const col of columns) {
    for (const v of variants) {
      parts.push(`${col} LIKE ?`);
      binds.push(`%${v}%`);
    }
  }
  return { sql: `(${parts.join(" OR ")})`, binds };
}
