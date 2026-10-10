import { Hono } from "hono";
import { authRoutes } from "./auth/routes";
import { entryRoutes } from "./routes/entries";
import { mediaRoutes } from "./routes/media";
import { accessRoutes } from "./routes/access";
import { mcpRoutes } from "./mcp/routes";
import { telegramRoutes } from "./telegram/routes";
import { requireSession, type AppEnv } from "./middleware/auth";
import { handleInboundEmail } from "./email/inbound";
import { runMirror } from "./mirror/run";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json({ error: "internal error" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);
app.get("/me", requireSession, (c) => c.json({ userId: c.get("userId") }));
app.route("/entries", entryRoutes);
app.route("/media", mediaRoutes);
app.route("/access", accessRoutes);
app.route("/mcp", mcpRoutes);
app.route("/telegram", telegramRoutes);

export default {
  fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleInboundEmail(
      { from: message.from, headers: message.headers, raw: message.raw },
      env,
    );
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runMirror(env.DB, {
        repo: env.MIRROR_REPO ?? "",
        branch: env.MIRROR_BRANCH || "main",
        token: env.GITHUB_MIRROR_TOKEN ?? "",
      }).catch((err) => {
        console.error("mirror failed", err);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
