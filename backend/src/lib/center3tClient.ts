import { strFromU8, unzipSync } from "fflate";
import type { Env } from "../types";

// Tra cuu 1 don Ecolada theo ID LADA qua he thong "center.dichvu3t.com" (API noi bo cho nhan vien,
// xem api_document_staff.md tai repo) - API 3 "Tai chi dinh Ecolada theo ID LADA"
// (POST /api/v1/export-excel-order-get-data). Khac voi lookupDvbhCase (tra JSON truc tiep), API nay
// tra ve file .xlsx nhi phan nen phai tu giai nen (fflate) + parse XML de lay dong du lieu dau tien.
const API_PATH = "/api/v1/export-excel-order-get-data";

export type Center3tOrderRow = Record<string, string>;

interface LookupResult {
  found: boolean;
  row?: Center3tOrderRow;
  warning?: string;
}

export async function lookupOrderByIdLada(env: Env, idLada: string): Promise<LookupResult> {
  if (!env.CENTER3T_API_TOKEN || !env.CENTER3T_API_BASE) return { found: false, warning: "CENTER3T_NOT_CONFIGURED" };

  let res: Response;
  try {
    res = await fetch(`${env.CENTER3T_API_BASE}${API_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CENTER3T_API_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ codes: [idLada] }),
    });
  } catch {
    return { found: false, warning: "CENTER3T_NETWORK_ERROR" };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("spreadsheet")) {
    return { found: false, warning: `CENTER3T_HTTP_${res.status}` };
  }

  let sheetXml: string;
  try {
    const buf = new Uint8Array(await res.arrayBuffer());
    const unzipped = unzipSync(buf, { filter: (f) => f.name === "xl/worksheets/sheet1.xml" });
    const file = unzipped["xl/worksheets/sheet1.xml"];
    if (!file) return { found: false, warning: "CENTER3T_PARSE_FAILED" };
    sheetXml = strFromU8(file);
  } catch {
    return { found: false, warning: "CENTER3T_PARSE_FAILED" };
  }

  const row = parseFirstDataRow(sheetXml);
  if (!row) return { found: false }; // ID khong ton tai - khong phai loi, file chi co dong tieu de.
  return { found: true, row };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, "\r")
    .replace(/&#xA;/g, "\n")
    .replace(/&amp;/g, "&");
}

const CELL_RE = /<c r="([A-Z]+)\d+"[^>]*>(?:<is><t[^>]*>([\s\S]*?)<\/t><\/is>|<v>([\s\S]*?)<\/v>)?<\/c>/g;

// Doc dong tieu de (row 1, ten cot) va dong du lieu dau tien (row 2) tu XML sheet cua file xlsx -
// chi can 2 dong nay vi moi lan goi API chi gui 1 ID LADA => toi da 1 dong ket qua.
function parseFirstDataRow(xml: string): Center3tOrderRow | null {
  const headerMatch = xml.match(/<row r="1"[^>]*>([\s\S]*?)<\/row>/);
  const dataMatch = xml.match(/<row r="2"[^>]*>([\s\S]*?)<\/row>/);
  if (!headerMatch || !dataMatch) return null;

  const headers: Record<string, string> = {};
  CELL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CELL_RE.exec(headerMatch[1]))) {
    headers[m[1]] = decodeXmlEntities(m[2] ?? m[3] ?? "");
  }

  const row: Center3tOrderRow = {};
  CELL_RE.lastIndex = 0;
  while ((m = CELL_RE.exec(dataMatch[1]))) {
    const label = headers[m[1]];
    if (label) row[label] = decodeXmlEntities(m[2] ?? m[3] ?? "");
  }
  return row;
}

// Tra cuu NHIEU ID LADA trong 1 lan goi (API nhan toi 20.000 ma/lan, moi dong co cot "ID LADA" de doi
// chieu) - dung cho cron dong bo moc chot don cua ID Lada phat sinh (lib/dongBoTuDong.ts). Tra Map theo
// ID LADA; ID khong ton tai thi khong co trong Map (khong phai loi).
export async function lookupOrdersByIdLada(
  env: Env,
  codes: string[],
): Promise<{ ok: true; rows: Map<string, Center3tOrderRow> } | { ok: false; warning: string }> {
  if (!env.CENTER3T_API_TOKEN || !env.CENTER3T_API_BASE) return { ok: false, warning: "CENTER3T_NOT_CONFIGURED" };
  if (codes.length === 0) return { ok: true, rows: new Map() };
  let res: Response;
  try {
    res = await fetch(`${env.CENTER3T_API_BASE}${API_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CENTER3T_API_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ codes }),
    });
  } catch {
    return { ok: false, warning: "CENTER3T_NETWORK_ERROR" };
  }
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("spreadsheet")) {
    return { ok: false, warning: `CENTER3T_HTTP_${res.status}` };
  }
  let xml: string;
  try {
    const unzipped = unzipSync(new Uint8Array(await res.arrayBuffer()), { filter: (f) => f.name === "xl/worksheets/sheet1.xml" });
    const file = unzipped["xl/worksheets/sheet1.xml"];
    if (!file) return { ok: false, warning: "CENTER3T_PARSE_FAILED" };
    xml = strFromU8(file);
  } catch {
    return { ok: false, warning: "CENTER3T_PARSE_FAILED" };
  }
  const rows = new Map<string, Center3tOrderRow>();
  let headers: Record<string, string> | null = null;
  for (const rm of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, string> = {};
    for (const m of rm[2].matchAll(CELL_RE)) cells[m[1]] = decodeXmlEntities(m[2] ?? m[3] ?? "");
    if (!headers) { headers = cells; continue; }
    const row: Center3tOrderRow = {};
    for (const [col, v] of Object.entries(cells)) if (headers[col]) row[headers[col]] = v;
    const id = row["ID LADA"]?.trim();
    if (id) rows.set(id, row);
  }
  return { ok: true, rows };
}

// "dd/mm/yyyy hh:mm:ss" (dinh dang ngay cua file Ecolada, vd "11/09/2026 21:23:55") -> "yyyy-mm-dd hh:mm:ss".
// Thieu gio -> 00:00:00. Sai dinh dang -> null.
export function ngayLadaSangVN(v: string | undefined): string | null {
  const m = v?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const p = (x: string | undefined) => (x ?? "0").padStart(2, "0");
  return `${m[3]}-${p(m[2])}-${p(m[1])} ${p(m[4])}:${p(m[5])}:${p(m[6])}`;
}
