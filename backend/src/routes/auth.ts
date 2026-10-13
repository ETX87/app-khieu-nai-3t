import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { signSession } from "../lib/jwt";
import { verifySessionMiddleware, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";

const app = new Hono<{ Bindings: Env }>();

const OAUTH_STATE_COOKIE = "khieunai_oauth_state";

app.get("/login", async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const savedState = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.json({ error: "INVALID_OAUTH_STATE" }, 400);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) return c.json({ error: "OAUTH_TOKEN_EXCHANGE_FAILED" }, 502);
  const tokenData = (await tokenRes.json()) as { access_token: string };

  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userinfoRes.ok) return c.json({ error: "OAUTH_USERINFO_FAILED" }, 502);
  const profile = (await userinfoRes.json()) as { email: string; email_verified: boolean; name?: string };

  if (!profile.email_verified) return c.json({ error: "EMAIL_NOT_VERIFIED" }, 403);

  const email = profile.email;
  const existing = await c.env.DB.prepare("SELECT email, ten FROM users WHERE email = ?")
    .bind(email)
    .first<{ email: string; ten: string | null }>();

  // Ten hien thi uu tien lay tu ho so "ETX nhan su" (chinh xac hon ten Google profile, xem
  // lib/etxNhanSuSync.ts cascade khi ETX doi ten sau nay) - null neu gmail khong khop nhan su nao.
  const etxMatch = await c.env.DB.prepare(
    "SELECT ho_ten, trang_thai_lam_viec FROM etx_nhan_su WHERE LOWER(gmail) = LOWER(?)",
  )
    .bind(email)
    .first<{ ho_ten: string; trang_thai_lam_viec: string }>();

  if (!existing) {
    const isBootstrapAdmin = email === c.env.BOOTSTRAP_ADMIN_EMAIL;
    // Tai khoan moi + gmail co trong ETX + dang "Dang lam viec" -> tu duyet luon vai tro "NV Sale",
    // bo qua buoc cho Admin duyet tay (yeu cau nghiep vu 2026-09-21). Chi ap dung DUNG 1 lan luc tao
    // tai khoan (lan dang nhap dau tien); nhung lan dang nhap sau khong doi lai vai tro da duoc gan.
    const autoApprove = !isBootstrapAdmin && etxMatch?.trang_thai_lam_viec === "on";
    const vaiTro = isBootstrapAdmin ? "Admin" : autoApprove ? "NV Sale" : null;
    const trangThaiDuyet = isBootstrapAdmin || autoApprove ? "Da duyet" : "Cho duyet";
    await c.env.DB.prepare("INSERT INTO users (email, ten, vai_tro, trang_thai_duyet) VALUES (?, ?, ?, ?)")
      .bind(email, etxMatch?.ho_ten ?? profile.name ?? null, vaiTro, trangThaiDuyet)
      .run();
  } else if (etxMatch && existing.ten !== etxMatch.ho_ten) {
    await c.env.DB.prepare("UPDATE users SET ten = ? WHERE email = ?").bind(etxMatch.ho_ten, email).run();
  } else if (!existing.ten && profile.name) {
    await c.env.DB.prepare("UPDATE users SET ten = ? WHERE email = ?").bind(profile.name, email).run();
  }

  await c.env.DB.prepare("INSERT INTO login_log (email, ip, user_agent) VALUES (?, ?, ?)")
    .bind(email, c.req.header("CF-Connecting-IP") ?? null, c.req.header("User-Agent") ?? null)
    .run();

  const token = await signSession({ email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return c.redirect(c.env.FRONTEND_URL);
});

app.get("/dev-login", async (c) => {
  if (c.env.LOCAL_DEV_BYPASS_AUTH !== "true") return c.json({ error: "NOT_FOUND" }, 404);

  const email = c.env.BOOTSTRAP_ADMIN_EMAIL;
  const existing = await c.env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (!existing) {
    await c.env.DB.prepare("INSERT INTO users (email, vai_tro, trang_thai_duyet) VALUES (?, 'Admin', 'Da duyet')")
      .bind(email)
      .run();
  }
  await c.env.DB.prepare("INSERT INTO login_log (email, ip, user_agent) VALUES (?, ?, ?)")
    .bind(email, c.req.header("CF-Connecting-IP") ?? null, "dev-login")
    .run();

  const token = await signSession({ email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return c.redirect(c.env.FRONTEND_URL);
});

app.post("/logout", async (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/me", verifySessionMiddleware, loadUser, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

// Tu cap nhat cong ty (nguon mac dinh)/ngon ngu CUA CHINH MINH - khong qua requireRole, moi user da
// dang nhap deu goi duoc, khac voi PATCH /users/:email (chi Admin, sua nguoi khac).
const CONG_TY_VALUES = ["Lada", "CRM", "PLP"];
const NGON_NGU_VALUES = ["vi", "en", "id"];
app.patch("/me", verifySessionMiddleware, loadUser, async (c) => {
  const body = await c.req.json();
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.cong_ty !== undefined) {
    if (body.cong_ty !== null && !CONG_TY_VALUES.includes(body.cong_ty)) return c.json({ error: "INVALID_CONG_TY" }, 400);
    sets.push("cong_ty = ?");
    binds.push(body.cong_ty);
  }
  if (body.ngon_ngu !== undefined) {
    if (!NGON_NGU_VALUES.includes(body.ngon_ngu)) return c.json({ error: "INVALID_NGON_NGU" }, 400);
    sets.push("ngon_ngu = ?");
    binds.push(body.ngon_ngu);
  }
  if (sets.length === 0) return c.json({ error: "NO_FIELDS" }, 400);
  binds.push(c.get("user").email);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE email = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

app.get("/nguoi-directory", verifySessionMiddleware, loadUser, async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT email, ten FROM users WHERE trang_thai_duyet = 'Da duyet' AND ten IS NOT NULL",
  ).all();
  return c.json({ items: rows.results });
});

export default app;
