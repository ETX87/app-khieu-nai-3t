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
