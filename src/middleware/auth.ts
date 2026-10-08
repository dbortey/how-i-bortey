import type { MiddlewareHandler } from "hono";
import { getActiveSession } from "../auth/sessions";

export type AppEnv = {
  Bindings: Env;
  Variables: { userId: string; sessionId: string };
};

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readCookie(c.req.header("cookie") ?? null, "hib_session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const session = await getActiveSession(c.env.DB, token);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.userId);
  c.set("sessionId", session.id);
  await next();
};

export { readCookie };
