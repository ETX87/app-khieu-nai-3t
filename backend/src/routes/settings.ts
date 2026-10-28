import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { encryptSecret } from "../lib/secretBox";
import { timTinhChuan } from "../lib/tinhChuan";

const app = new Hono<{ Bindings: Env }>();
app.use("*", verifySessionMiddleware, loadUser);

app.get("/options", async (c) => {
  const nhom = c.req.query("nhom");
  if (!nhom) return c.json({ error: "MISSING_NHOM" }, 400);
  // active: "1" (mặc định) chỉ mục đang dùng · "0" mục đã ẩn · "all" tất cả (cho màn Cấu hình)
  const active = c.req.query("active") ?? "1";
  // parent: lọc cấp con theo cha (địa lý cascading: quan_huyen theo tinh, phuong_xa theo quan_huyen)
  const parent = c.req.query("parent");
  const conds: string[] = ["nhom = ?"];
  const binds: unknown[] = [nhom];
  if (active === "0") conds.push("active = 0");
  else if (active !== "all") conds.push("active = 1");
  if (parent !== undefined) { conds.push("parent = ?"); binds.push(parent); }
  const rows = await c.env.DB.prepare(
    `SELECT id, nhom, gia_tri, parent, active FROM settings_option WHERE ${conds.join(" AND ")} ORDER BY gia_tri`,
  ).bind(...binds).all();
  return c.json({ items: rows.results });
});

// Đếm số bản ghi khiếu nại đang tham chiếu 1 giá trị danh mục (cảnh báo trước khi ẩn).
const USAGE_COLUMN: Record<string, string> = {
  muc_do: "muc_do", nhom_yeu_cau: "nhom_yeu_cau", nhom_van_de: "nhom_van_de",
  van_de_dau_vao: "van_de_dau_vao", phan_loai_kh: "phan_loai_kh", sale_khu_vuc: "sale_khu_vuc",
  model: "model", hang: "hang", tinh: "tinh", quan_huyen: "quan_huyen", phuong_xa: "phuong_xa",
  tinh_moi: "tinh_moi", phuong_xa_moi: "phuong_xa_moi",
  bo_phan_ban_giao: "bo_phan_ban_giao", ly_do_cham: "ghi_chu_ly_do_cham", danh_gia_cskh: "danh_gia_ql",
};

app.get("/options/usage", async (c) => {
  const nhom = c.req.query("nhom");
  const giaTri = c.req.query("gia_tri");
  if (!nhom || !giaTri) return c.json({ error: "MISSING_PARAMS" }, 400);
  const col = USAGE_COLUMN[nhom];
  if (!col) return c.json({ count: 0 });
  const r = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM khieu_nai WHERE ${col} = ?`).bind(giaTri).first<{ n: number }>();
  return c.json({ count: r?.n ?? 0 });
});

// Cac nhom "nguoi dung tu tao list va tai su dung" theo dac ta Ma tran goc - moi vai tro
// (tru Viewer) duoc tu them gia tri moi ngay khi nhap lieu, khong can vao Cau hinh.
const USER_CREATABLE_GROUPS = new Set([
  "sale_khu_vuc", "hang", "model",
  "tinh", "quan_huyen", "phuong_xa", "tinh_moi", "phuong_xa_moi",
]);

app.post("/options", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  if (!body.nhom || !body.gia_tri) return c.json({ error: "MISSING_FIELDS" }, 400);

  const isUserCreatable = USER_CREATABLE_GROUPS.has(body.nhom);
  const allowed = user.vai_tro === "Admin" || (isUserCreatable && !!user.vai_tro && user.vai_tro !== "Viewer");
  if (!allowed) return c.json({ error: "FORBIDDEN_ROLE" }, 403);

  // Tinh da co trong danh muc (chi khac dau/hoa-thuong, vd "Dak nông" vs "Đắk Nông") -> khong tao trung.
  if ((body.nhom === "tinh" || body.nhom === "tinh_moi") && typeof body.gia_tri === "string") {
    const chuan = await timTinhChuan(c.env.DB, body.nhom, body.gia_tri);
    if (chuan) return c.json({ ok: true, gia_tri: chuan }, 200);
  }

  await c.env.DB.prepare("INSERT OR IGNORE INTO settings_option (nhom, gia_tri, parent, created_by) VALUES (?, ?, ?, ?)")
    .bind(body.nhom, body.gia_tri, body.parent ?? null, user.email)
    .run();
  return c.json({ ok: true }, 201);
});

app.patch("/options/:id", requireRole("Admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  if (typeof body.active !== "boolean") return c.json({ error: "MISSING_ACTIVE" }, 400);
  await c.env.DB.prepare("UPDATE settings_option SET active = ? WHERE id = ?").bind(body.active ? 1 : 0, id).run();
  return c.json({ ok: true });
});

// ---------- Ngay nghi le (moc "48h bo Chu nhat + ngay le" cua loi vi pham, lib/gioTinh.ts) ----------
// Chu nhat tu tinh trong code, khong nhap vao day. Le am lich + nghi bu Admin nhap dau moi nam.
const NGAY_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get("/ngay-nghi", async (c) => {
  const nam = c.req.query("nam");
  const r = nam && /^\d{4}$/.test(nam)
    ? await c.env.DB.prepare("SELECT ngay, ten, created_by FROM ngay_nghi WHERE ngay LIKE ? ORDER BY ngay").bind(`${nam}-%`).all()
    : await c.env.DB.prepare("SELECT ngay, ten, created_by FROM ngay_nghi ORDER BY ngay").all();
  return c.json({ items: r.results });
});

app.post("/ngay-nghi", requireRole("Admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const ngay = typeof body.ngay === "string" ? body.ngay.trim() : "";
  const ten = typeof body.ten === "string" ? body.ten.trim() : "";
  if (!NGAY_RE.test(ngay) || Number.isNaN(Date.parse(`${ngay}T00:00:00Z`))) return c.json({ error: "INVALID_NGAY" }, 400);
  if (!ten) return c.json({ error: "MISSING_TEN" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO ngay_nghi (ngay, ten, created_by) VALUES (?, ?, ?) ON CONFLICT(ngay) DO UPDATE SET ten = excluded.ten",
  ).bind(ngay, ten, c.get("user").email).run();
  return c.json({ ok: true }, 201);
});

app.delete("/ngay-nghi/:ngay", requireRole("Admin"), async (c) => {
  await c.env.DB.prepare("DELETE FROM ngay_nghi WHERE ngay = ?").bind(c.req.param("ngay")).run();
  return c.json({ ok: true });
});

// ---------- Ket noi Google Drive (upload anh/video dinh kem khieu nai) ----------
// Copy pattern tu vi-pham-app (skill qlbh3t-cf-integrations) - OAuth 1 tai khoan Google THAT (khong
// phai Service Account, khong co dung luong Drive mien phi), Admin uy quyen 1 lan, dung chung cho
// ca he thong (khong phai tung nguoi dung tu ket noi rieng).
const DRIVE_OAUTH_STATE_COOKIE = "khieunai_drive_oauth_state";

app.get("/google-drive/status", requireRole("Admin"), async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT google_email, folder_id, authorized_by, authorized_at FROM google_drive_oauth WHERE id = 1",
  ).first<{ google_email: string; folder_id: string; authorized_by: string | null; authorized_at: string }>();
  if (!row) return c.json({ connected: false });
  return c.json({ connected: true, ...row });
});

app.get("/google-drive/authorize", requireRole("Admin"), async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, DRIVE_OAUTH_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_DRIVE_REDIRECT_URI,
    response_type: "code",
    // Chi xin quyen file do CHINH app tao ra (drive.file), khong xin toan bo Drive cua tai khoan.
    scope: "https://www.googleapis.com/auth/drive.file openid email profile",
    state,
    access_type: "offline",
    // BAT BUOC ca 2 flag nay de LUON nhan refresh_token - thieu thi Google chi tra refresh_token o
    // LAN DAU uy quyen, lan sau (vd ket noi lai sau khi thu hoi quyen) se thieu (da xac nhan thuc te).
    prompt: "consent select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/google-drive/callback", requireRole("Admin"), async (c) => {
  const user = c.get("user");
  const code = c.req.query("code");
  const state = c.req.query("state");
  const savedState = getCookie(c, DRIVE_OAUTH_STATE_COOKIE);
  deleteCookie(c, DRIVE_OAUTH_STATE_COOKIE, { path: "/" });
  if (!code || !state || !savedState || state !== savedState) return c.json({ error: "INVALID_OAUTH_STATE" }, 400);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: c.env.GOOGLE_DRIVE_REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) return c.json({ error: "OAUTH_TOKEN_EXCHANGE_FAILED" }, 502);
  const tokenData = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokenData.refresh_token) return c.json({ error: "NO_REFRESH_TOKEN" }, 502);

  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userinfoRes.ok) return c.json({ error: "OAUTH_USERINFO_FAILED" }, 502);
  const profile = (await userinfoRes.json()) as { email: string };

  // Tao 1 folder rieng cho app tren Drive cua tai khoan do (chua tat ca anh/video dinh kem).
  const folderRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "App Khieu Nai - Dinh kem", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!folderRes.ok) return c.json({ error: "DRIVE_FOLDER_CREATE_FAILED" }, 502);
  const { id: folderId } = (await folderRes.json()) as { id: string };

  const refreshTokenEnc = await encryptSecret(tokenData.refresh_token, c.env.SESSION_SECRET);
  await c.env.DB.prepare(
    `INSERT INTO google_drive_oauth (id, google_email, refresh_token_enc, folder_id, authorized_by, authorized_at)
     VALUES (1, ?, ?, ?, ?, datetime('now','+7 hours'))
     ON CONFLICT(id) DO UPDATE SET google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
       folder_id = excluded.folder_id, authorized_by = excluded.authorized_by, authorized_at = excluded.authorized_at`,
  ).bind(profile.email, refreshTokenEnc, folderId, user.email).run();

  return c.redirect(`${c.env.FRONTEND_URL}/?drive=connected`);
});

export default app;
