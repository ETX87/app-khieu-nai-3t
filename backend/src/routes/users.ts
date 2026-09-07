import { Hono } from "hono";
import { VAI_TRO_VALUES } from "../types";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";

const app = new Hono<{ Bindings: Env }>();
app.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

const TRANG_THAI_DUYET_VALUES = ["Cho duyet", "Da duyet", "Tu choi"] as const;

app.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT email, ten, vai_tro, trang_thai_duyet, bi_khoa, created_at, updated_at FROM users ORDER BY created_at DESC",
  ).all();
  return c.json({ items: rows.results });
});

app.patch("/:email", async (c) => {
  const email = c.req.param("email");
  const body = await c.req.json();

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
