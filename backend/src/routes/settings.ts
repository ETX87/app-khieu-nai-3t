import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";

const app = new Hono<{ Bindings: Env }>();
app.use("*", verifySessionMiddleware, loadUser);

app.get("/options", async (c) => {
  const nhom = c.req.query("nhom");
  if (!nhom) return c.json({ error: "MISSING_NHOM" }, 400);
  const rows = await c.env.DB.prepare(
    "SELECT id, nhom, gia_tri, parent, active FROM settings_option WHERE nhom = ? AND active = 1 ORDER BY gia_tri",
  ).bind(nhom).all();
  return c.json({ items: rows.results });
});

// Cac nhom "nguoi dung tu tao list va tai su dung" theo dac ta Ma tran goc - moi vai tro
// (tru Viewer) duoc tu them gia tri moi ngay khi nhap lieu, khong can vao Cau hinh.
const USER_CREATABLE_GROUPS = new Set(["sale_khu_vuc", "hang", "tinh", "quan_huyen", "phuong_xa"]);

app.post("/options", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  if (!body.nhom || !body.gia_tri) return c.json({ error: "MISSING_FIELDS" }, 400);

  const isUserCreatable = USER_CREATABLE_GROUPS.has(body.nhom);
  const allowed = user.vai_tro === "Admin" || (isUserCreatable && !!user.vai_tro && user.vai_tro !== "Viewer");
  if (!allowed) return c.json({ error: "FORBIDDEN_ROLE" }, 403);

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

export default app;
