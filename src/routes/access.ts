import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { requireSession } from "../middleware/auth";
import { revokeAllSessions } from "../auth/sessions";

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
