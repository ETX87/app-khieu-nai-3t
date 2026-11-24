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
import { writeDailySnapshot } from "./lib/baoCaoSnapshot";
import { chayDongBoTuDong } from "./lib/dongBoTuDong";
import { layCuaSoThongTin } from "./lib/cuaSoThongTin";

// Phai KHOP CHINH XAC chuoi cron trong wrangler.jsonc ("triggers.crons") - phut 15 moi gio tu 6h den 22h
// gio VN (23h-15h UTC), tranh trung phut 0 cua cron 3h sang.
const CRON_DONG_BO = "15 0-15,23 * * *";

const app = new Hono<{ Bindings: Env }>();
// Cua so thong tin eOffice (2026-11-24, lib/cuaSoThongTin.ts): khong can dang nhap - hien ca o man dang nhap.
app.get("/api/cua-so", async (c) => c.json(await layCuaSoThongTin(c.env.CUA_SO_KHOA)));

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
  scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    // Cron moi gio (them 28/10/2026): dong bo tu dong CRM + Lada phat sinh cho ca ton (lib/dongBoTuDong.ts).
    if (event.cron === CRON_DONG_BO) {
      ctx.waitUntil(chayDongBoTuDong(env));
      return;
    }
    ctx.waitUntil(runEtxNhanSuSyncWithState(env, env.DB));
    // Chup nhanh ton dong hang ngay cho "Bao cao theo ngay" (xem lib/baoCaoSnapshot.ts).
    ctx.waitUntil(writeDailySnapshot(env.DB));
  },
};
