import type { Context, Next } from "hono";
import type { AppUser, Env, VaiTro } from "../types";

interface UserRow {
  email: string; ten: string | null; vai_tro: VaiTro | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi"; bi_khoa: number; xem_tat_ca: number;
  cong_ty: string | null; ngon_ngu: string;
}
const USER_COLUMNS = "email, ten, vai_tro, trang_thai_duyet, bi_khoa, xem_tat_ca, cong_ty, ngon_ngu";

export async function loadUser(c: Context<{ Bindings: Env }>, next: Next) {
  const email = c.get("email");
  let row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).bind(email).first<UserRow>();
  if (!row) {
    const isBootstrapAdmin = email === c.env.BOOTSTRAP_ADMIN_EMAIL;
    row = await c.env.DB.prepare(
      `INSERT INTO users (email, vai_tro, trang_thai_duyet) VALUES (?, ?, ?) RETURNING ${USER_COLUMNS}`,
    ).bind(email, isBootstrapAdmin ? "Admin" : null, isBootstrapAdmin ? "Da duyet" : "Cho duyet").first<UserRow>();
  }
  if (!row) return c.json({ error: "USER_LOAD_FAILED" }, 500);
  if (row.bi_khoa) return c.json({ error: "DISABLED" }, 403);
  if (row.trang_thai_duyet === "Cho duyet") return c.json({ error: "PENDING_APPROVAL" }, 403);
  if (row.trang_thai_duyet === "Tu choi") return c.json({ error: "REJECTED" }, 403);
  const user: AppUser = {
    email: row.email, ten: row.ten, vai_tro: row.vai_tro, trang_thai_duyet: row.trang_thai_duyet,
    bi_khoa: !!row.bi_khoa, xem_tat_ca: !!row.xem_tat_ca, cong_ty: row.cong_ty, ngon_ngu: row.ngon_ngu,
  };
  c.set("user", user);
  await next();
}
