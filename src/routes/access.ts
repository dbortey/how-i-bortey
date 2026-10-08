import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { requireSession } from "../middleware/auth";
import { createSession, revokeAllSessions } from "../auth/sessions";

export const accessRoutes = new Hono<AppEnv>();
accessRoutes.use("*", requireSession);

accessRoutes.get("/sessions", async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT id, device_label, created_at, last_used_at, expires_at
       FROM sessions WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC`,
    )
    .bind(c.get("userId"))
    .all();
  return c.json(results);
});

accessRoutes.post("/revoke-all", async (c) => {
  const revoked = await revokeAllSessions(c.env.DB, c.get("userId"));
  return c.json({ revoked });
});

accessRoutes.post("/tokens", async (c) => {
  const body = await c.req
    .json<{ label?: string; ttlHours?: number }>()
    .catch(() => ({} as { label?: string; ttlHours?: number }));
  const ttl = Math.min(Math.max(Math.floor(body.ttlHours ?? 12), 1), 168);
  const label =
    typeof body.label === "string" && body.label.trim() ? body.label.trim() : "mcp client";
  const created = await createSession(c.env.DB, c.get("userId"), label, ttl);
  return c.json({ token: created.token, id: created.id, expiresAt: created.expiresAt }, 201);
});
