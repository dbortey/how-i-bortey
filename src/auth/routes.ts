import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { readCookie } from "../middleware/auth";
import { sendMagicLinkEmail } from "./email";
import {
  consumeMagicToken,
  createMagicToken,
  hasPendingMagicToken,
} from "./magic";
import {
  createSession,
  getActiveSession,
  revokeSession,
  upsertUserByEmail,
} from "./sessions";

export const authRoutes = new Hono<AppEnv>();

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isOwner(env: Env, email: string): boolean {
  const owner = env.OWNER_EMAIL?.trim().toLowerCase();
  return !!owner && email.trim().toLowerCase() === owner;
}

function confirmPage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in</title></head>
<body style="font-family:system-ui;max-width:28rem;margin:4rem auto;text-align:center">
<h1>Confirm sign-in</h1>
<form method="post" action="/auth/verify">
<input type="hidden" name="token" value="${token.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">
<button type="submit" style="padding:.6rem 1.2rem;font-size:1rem">Sign in</button>
</form>
</body>
</html>`;
}

authRoutes.post("/request", async (c) => {
  const body = await c.req
    .json<{ email?: unknown }>()
    .catch(() => ({} as { email?: unknown }));
  if (!isValidEmail(body.email)) return c.json({ error: "invalid email" }, 400);
  if (!c.env.OWNER_EMAIL) return c.json({ error: "auth not configured" }, 500);
  if (!isOwner(c.env, body.email)) return c.json({ error: "not allowed" }, 403);

  if (await hasPendingMagicToken(c.env.DB, body.email)) return c.json({ ok: true });

  const token = await createMagicToken(c.env.DB, body.email);
  const origin = new URL(c.req.url).origin;
  const devLink = `${origin}/auth/verify?token=${token}`;
  if (c.env.APP_ENV === "development") return c.json({ ok: true, devLink });
  if (!c.env.EMAIL) return c.json({ error: "email not configured" }, 500);
  await sendMagicLinkEmail(c.env.EMAIL, body.email, devLink);
  return c.json({ ok: true });
});

authRoutes.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "missing token" }, 400);
  return c.html(confirmPage(token));
});

authRoutes.post("/verify", async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const token = typeof form.token === "string" ? form.token : "";
  if (!token) return c.json({ error: "missing token" }, 400);
  const email = await consumeMagicToken(c.env.DB, token);
  if (!email) return c.json({ error: "invalid or expired token" }, 400);
  if (!isOwner(c.env, email)) return c.json({ error: "not allowed" }, 403);
  const user = await upsertUserByEmail(c.env.DB, email);
  const { token: sessionToken } = await createSession(
    c.env.DB,
    user.id,
    c.req.header("user-agent") ?? null,
  );
  const secure = c.env.APP_ENV === "development" ? "" : "; Secure";
  c.header(
    "Set-Cookie",
    `hib_session=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
  );
  return c.redirect("/");
});

authRoutes.post("/logout", async (c) => {
  const token = readCookie(c.req.header("cookie") ?? null, "hib_session");
  if (token) {
    const session = await getActiveSession(c.env.DB, token);
    if (session) await revokeSession(c.env.DB, session.id);
  }
  c.header("Set-Cookie", "hib_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  return c.json({ ok: true });
});

