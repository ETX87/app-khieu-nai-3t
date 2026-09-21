import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";

const app = new Hono<{ Bindings: Env }>();
app.use("*", verifySessionMiddleware, loadUser);

interface ThongBaoRow {
  id: number;
  nguoi_nhan: string;
  loai: string;
  noi_dung: string;
  khieu_nai_id: string | null;
  da_doc: number;
  ngay_tao: string;
}

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// GET /api/thong-bao/count - dung cho badge chuong + so luong tren 3 the (Tong/Chua doc/Da doc).
app.get("/count", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) as tong, SUM(CASE WHEN da_doc = 0 THEN 1 ELSE 0 END) as chua_doc FROM thong_bao WHERE nguoi_nhan = ?",
  ).bind(user.email).first<{ tong: number; chua_doc: number | null }>();
  const tong = row?.tong ?? 0;
  const chuaDoc = row?.chua_doc ?? 0;
  return c.json({ tong, chuaDoc, daDoc: tong - chuaDoc });
});

// GET /api/thong-bao?filter=unread|read|all&limit=10&before_ngay_tao=...&before_id=...
// Phan trang kieu cuon vo han (giong Facebook): mac dinh 10 dong gan nhat, cuon xuong moi goi lai
// voi cursor (ngay_tao, id) cua dong cuoi cung da co - tranh LIMIT/OFFSET (bi lech trang neu co
// thong bao moi phat sinh giua luc dang cuon).
app.get("/", async (c) => {
  const user = c.get("user");
  const filter = c.req.query("filter") ?? "all";
  const cond = filter === "unread" ? "AND da_doc = 0" : filter === "read" ? "AND da_doc = 1" : "";

  const limitParam = Number(c.req.query("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  const beforeNgayTao = c.req.query("before_ngay_tao");
  const beforeId = c.req.query("before_id");
  const hasCursor = !!beforeNgayTao && !!beforeId;
  const cursorCond = hasCursor ? "AND (ngay_tao < ? OR (ngay_tao = ? AND id < ?))" : "";

  const binds: unknown[] = [user.email];
  if (hasCursor) binds.push(beforeNgayTao, beforeNgayTao, beforeId);
  binds.push(limit + 1);

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM thong_bao WHERE nguoi_nhan = ? ${cond} ${cursorCond}
     ORDER BY ngay_tao DESC, id DESC LIMIT ?`,
  ).bind(...binds).all<ThongBaoRow>();

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;
  const last = items[items.length - 1];

  return c.json({
    items,
    nextCursor: hasMore && last ? { ngay_tao: last.ngay_tao, id: last.id } : null,
  });
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
