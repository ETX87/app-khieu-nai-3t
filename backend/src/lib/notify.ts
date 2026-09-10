import type { Env } from "../types";
import { sendPushToUser } from "./webPush";

export type ThongBaoLoai = "cho_tiep_nhan" | "cho_chot";

const LOAI_TITLE: Record<ThongBaoLoai, string> = {
  cho_tiep_nhan: "Đơn mới cần tiếp nhận",
  cho_chot: "Đơn chờ chốt kết thúc",
};

// Bao cho TAT CA nguoi dung dang hoat dong (da duyet, khong bi khoa) thuoc 1 trong cac vai_tro chi
// dinh - ghi 1 dong thong_bao/nguoi + day Web Push song song. Goi trong executionCtx.waitUntil() o
// noi goi de khong lam cham response cua route chinh (tao don/dong ca...).
export async function notifyRoles(
  env: Env,
  loai: ThongBaoLoai,
  noiDung: string,
  khieuNaiId: string,
  roles: string[],
): Promise<void> {
  if (roles.length === 0) return;
  const placeholders = roles.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT email FROM users WHERE vai_tro IN (${placeholders}) AND bi_khoa = 0 AND trang_thai_duyet = 'Da duyet'`,
  ).bind(...roles).all<{ email: string }>();
  if (results.length === 0) return;

  await Promise.all(
    results.map(async ({ email }) => {
      await env.DB.prepare(
        "INSERT INTO thong_bao (nguoi_nhan, loai, noi_dung, khieu_nai_id) VALUES (?, ?, ?, ?)",
      ).bind(email, loai, noiDung, khieuNaiId).run();
      await sendPushToUser(env, email, { title: LOAI_TITLE[loai], body: noiDung, url: "/" });
    }),
  );
}
