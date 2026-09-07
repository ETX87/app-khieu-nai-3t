import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { verifySession, signSession } from "../lib/jwt";
import type { Env } from "../types";

export const SESSION_COOKIE = "khieunai_session";
export const SESSION_TTL_SECONDS = 72 * 60 * 60;

export async function verifySessionMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "MISSING_TOKEN" }, 401);
  const payload = await verifySession(token, c.env.SESSION_SECRET);
  if (!payload) return c.json({ error: "INVALID_TOKEN" }, 401);
  c.set("email", payload.email);
  const now = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - now;
  if (remaining < SESSION_TTL_SECONDS / 2) {
    const freshToken = await signSession({ email: payload.email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
    setCookie(c, SESSION_COOKIE, freshToken, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: SESSION_TTL_SECONDS, path: "/" });
  }
  await next();
}
