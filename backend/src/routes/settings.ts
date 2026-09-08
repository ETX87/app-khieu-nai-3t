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
  // active: "1" (mặc định) chỉ mục đang dùng · "0" mục đã ẩn · "all" tất cả (cho màn Cấu hình)
  const active = c.req.query("active") ?? "1";
  const where =
    active === "all" ? "" : active === "0" ? " AND active = 0" : " AND active = 1";
  const rows = await c.env.DB.prepare(
    `SELECT id, nhom, gia_tri, parent, active FROM settings_option WHERE nhom = ?${where} ORDER BY gia_tri`,
  ).bind(nhom).all();
  return c.json({ items: rows.results });
});

// Đếm số bản ghi khiếu nại đang tham chiếu 1 giá trị danh mục (cảnh báo trước khi ẩn).
const USAGE_COLUMN: Record<string, string> = {
  muc_do: "muc_do", nhom_yeu_cau: "nhom_yeu_cau", nhom_van_de: "nhom_van_de",
  van_de_dau_vao: "van_de_dau_vao", phan_loai_kh: "phan_loai_kh", sale_khu_vuc: "sale_khu_vuc",
  model: "model", hang: "hang", tinh: "tinh", quan_huyen: "quan_huyen", phuong_xa: "phuong_xa",
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
