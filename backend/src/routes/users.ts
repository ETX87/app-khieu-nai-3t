import { Hono } from "hono";
import { VAI_TRO_VALUES } from "../types";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { viLikeClause } from "../lib/viSearch";

const app = new Hono<{ Bindings: Env }>();
app.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

const TRANG_THAI_DUYET_VALUES = ["Cho duyet", "Da duyet", "Tu choi"] as const;

// GET /?search=&page=&pageSize= - phan trang o server (subquery last_login chi chay cho dung 1 trang).
app.get("/", async (c) => {
  const search = c.req.query("search")?.trim().normalize("NFC");
  let page = parseInt(c.req.query("page") ?? "1", 10);
  let pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  const like = search ? viLikeClause(["u.email", "COALESCE(u.ten,'')"], search) : null;
  const where = like ? `WHERE ${like.sql}` : "";
  const binds: unknown[] = like ? like.binds : [];

  const [list, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.email, u.ten, u.vai_tro, u.trang_thai_duyet, u.bi_khoa, u.created_at, u.updated_at,
              (SELECT MAX(l.thoi_gian) FROM login_log l WHERE l.email = u.email) AS last_login
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...binds, pageSize, (page - 1) * pageSize)
      .all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).bind(...binds).first<{ n: number }>(),
  ]);
  return c.json({ items: list.results, total: count?.n ?? 0, page, pageSize });
});

app.get("/pending-count", async (c) => {
  const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE trang_thai_duyet = 'Cho duyet'").first<{ n: number }>();
  return c.json({ count: r?.n ?? 0 });
});

async function countActiveAdmins(db: D1Database): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE vai_tro = 'Admin' AND trang_thai_duyet = 'Da duyet' AND bi_khoa = 0")
    .first<{ n: number }>();
  return r?.n ?? 0;
}

app.patch("/:email", async (c) => {
  const email = c.req.param("email");
  const me = c.get("user");
  const body = await c.req.json();

  // Bảo vệ: không tự hạ vai trò / tự khoá chính mình.
  if (email === me.email) {
    if ((body.vai_tro !== undefined && body.vai_tro !== "Admin") || body.bi_khoa) {
      return c.json({ error: "CANNOT_MODIFY_SELF" }, 400);
    }
  }

  // Bảo vệ: không được để hệ thống mất Admin hoạt động cuối cùng.
  const target = await c.env.DB.prepare(
    "SELECT vai_tro, trang_thai_duyet, bi_khoa FROM users WHERE email = ?",
  ).bind(email).first<{ vai_tro: string | null; trang_thai_duyet: string; bi_khoa: number }>();
  if (target?.vai_tro === "Admin" && target.trang_thai_duyet === "Da duyet" && !target.bi_khoa) {
    const demoting = body.vai_tro !== undefined && body.vai_tro !== "Admin";
    const locking = body.bi_khoa === true || body.bi_khoa === 1;
    const rejecting = body.trang_thai_duyet !== undefined && body.trang_thai_duyet !== "Da duyet";
    if ((demoting || locking || rejecting) && (await countActiveAdmins(c.env.DB)) <= 1) {
      return c.json({ error: "LAST_ADMIN" }, 400);
    }
  }

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (body.vai_tro !== undefined) {
    if (body.vai_tro !== null && !(VAI_TRO_VALUES as readonly string[]).includes(body.vai_tro)) {
      return c.json({ error: "INVALID_VAI_TRO" }, 400);
    }
    sets.push("vai_tro = ?");
    binds.push(body.vai_tro);
  }
  if (body.trang_thai_duyet !== undefined) {
    if (!(TRANG_THAI_DUYET_VALUES as readonly string[]).includes(body.trang_thai_duyet)) {
      return c.json({ error: "INVALID_TRANG_THAI_DUYET" }, 400);
    }
    sets.push("trang_thai_duyet = ?");
    binds.push(body.trang_thai_duyet);
  }
  if (body.bi_khoa !== undefined) {
    sets.push("bi_khoa = ?");
    binds.push(body.bi_khoa ? 1 : 0);
  }
  if (sets.length === 0) return c.json({ error: "NO_FIELDS" }, 400);

  sets.push("updated_at = ?");
  binds.push(nowVN());
  binds.push(email);

  const result = await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE email = ?`).bind(...binds).run();
  if (result.meta.changes === 0) return c.json({ error: "NOT_FOUND" }, 404);

  const updated = await c.env.DB.prepare(
    "SELECT email, ten, vai_tro, trang_thai_duyet, bi_khoa, updated_at FROM users WHERE email = ?",
  ).bind(email).first();
  return c.json({ user: updated });
});

export default app;
