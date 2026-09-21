import { Hono } from "hono";
import type { Env } from "./types";
import authRoutes from "./routes/auth";
import khieuNaiRoutes from "./routes/khieuNai";
import settingsRoutes from "./routes/settings";
import usersRoutes from "./routes/users";
import thongBaoRoutes from "./routes/thongBao";
import pushRoutes from "./routes/push";
import etxNhanSuSyncRoutes from "./routes/etxNhanSuSync";
import { runEtxNhanSuSyncWithState } from "./lib/etxNhanSuSync";

const app = new Hono<{ Bindings: Env }>();
app.route("/api/auth", authRoutes);
app.route("/api/khieu-nai", khieuNaiRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/thong-bao", thongBaoRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/etx-nhan-su", etxNhanSuSyncRoutes);
app.onError((err, c) => { console.error(err); return c.json({ error: "INTERNAL_ERROR" }, 500); });
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default {
  fetch: app.fetch,
  // Cron Trigger (wrangler.jsonc "triggers.crons": "0 20 * * *" = 3h sang moi ngay GIO VN) - keo danh
  // ba "ETX nhan su" ve (xem lib/etxNhanSuSync.ts). waitUntil() de Cloudflare khong cat request truoc
  // khi cac lenh goi HTTP toi ETX hoan tat.
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runEtxNhanSuSyncWithState(env, env.DB));
  },
};
