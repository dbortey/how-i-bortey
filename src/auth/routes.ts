import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { readCookie } from "../middleware/auth";
import { consumeMagicToken, createMagicToken } from "./magic";
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

authRoutes.post("/request", async (c) => {
  const body = await c.req
    .json<{ email?: unknown }>()
    .catch(() => ({} as { email?: unknown }));
  if (!isValidEmail(body.email)) return c.json({ error: "invalid email" }, 400);
  const token = await createMagicToken(c.env.DB, body.email);
  const origin = new URL(c.req.url).origin;
  const devLink = `${origin}/auth/verify?token=${token}`;
  const isProd = c.env.APP_ENV === "production";
  if (isProd) {
    if (!c.env.RESEND_API_KEY) return c.json({ error: "email not configured" }, 500);
    await sendMagicEmail(c.env.RESEND_API_KEY, body.email, devLink);
    return c.json({ ok: true });
  }
  return c.json({ ok: true, devLink });
});

authRoutes.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "missing token" }, 400);
  const email = await consumeMagicToken(c.env.DB, token);
  if (!email) return c.json({ error: "invalid or expired token" }, 400);
  const user = await upsertUserByEmail(c.env.DB, email);
  const { token: sessionToken } = await createSession(
    c.env.DB,
    user.id,
    c.req.header("user-agent") ?? null,
  );
  const secure = c.env.APP_ENV === "production" ? "; Secure" : "";
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

async function sendMagicEmail(apiKey: string, email: string, link: string): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "How I Bortey <login@switgh.com>",
      to: email,
      subject: "Your How I Bortey sign-in link",
      text: `Sign in: ${link}`,
    }),
  });
}
