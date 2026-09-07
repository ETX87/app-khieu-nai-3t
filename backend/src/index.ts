import { Hono } from "hono";
import type { Env } from "./types";
import authRoutes from "./routes/auth";
import khieuNaiRoutes from "./routes/khieuNai";
import settingsRoutes from "./routes/settings";
import usersRoutes from "./routes/users";

const app = new Hono<{ Bindings: Env }>();
app.route("/api/auth", authRoutes);
app.route("/api/khieu-nai", khieuNaiRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/users", usersRoutes);
app.onError((err, c) => { console.error(err); return c.json({ error: "INTERNAL_ERROR" }, 500); });
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default { fetch: app.fetch };
