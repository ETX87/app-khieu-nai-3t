import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";

const app = new Hono<{ Bindings: Env }>();
app.use("*", verifySessionMiddleware, loadUser);

// GET /api/thong-bao/count - so chua doc, dung cho badge chuong (khong cache, doc thang tu DB de
// phan anh dung ngay sau khi danh dau da doc).
app.get("/count", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT COUNT(*) as n FROM thong_bao WHERE nguoi_nhan = ? AND da_doc = 0")
    .bind(user.email)
    .first<{ n: number }>();
  return c.json({ chuaDoc: row?.n ?? 0 });
});

// GET /api/thong-bao?filter=unread|read|all - danh sach thong bao cua CHINH nguoi dang dang nhap.
app.get("/", async (c) => {
  const user = c.get("user");
  const filter = c.req.query("filter") ?? "all";
  const cond = filter === "unread" ? "AND da_doc = 0" : filter === "read" ? "AND da_doc = 1" : "";
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM thong_bao WHERE nguoi_nhan = ? ${cond} ORDER BY ngay_tao DESC LIMIT 50`,
  ).bind(user.email).all();
  return c.json({ items: results });
});

app.post("/mark-all-read", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE thong_bao SET da_doc = 1 WHERE nguoi_nhan = ? AND da_doc = 0").bind(user.email).run();
  return c.json({ ok: true });
});

// Xoa quyen so huu ngay trong WHERE (khong doc-roi-kiem-tra) - khong the danh dau doc ho thong bao
// cua nguoi khac du co doan duoc id.
app.post("/:id/read", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE thong_bao SET da_doc = 1 WHERE id = ? AND nguoi_nhan = ?").bind(id, user.email).run();
  return c.json({ ok: true });
});

export default app;
