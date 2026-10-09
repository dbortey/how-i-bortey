import { Hono } from "hono";
import { handleUpdate } from "./handlers";

export const telegramRoutes = new Hono<{ Bindings: Env }>();

telegramRoutes.post("/webhook", async (c) => {
  const secret = c.req.header("x-telegram-bot-api-secret-token");
  if (!c.env.TELEGRAM_WEBHOOK_SECRET || secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const update = await c.req.json<{ update_id?: number }>().catch(() => null);
  if (!update || typeof update.update_id !== "number") return c.json({ ok: true });

  const inserted = await c.env.DB
    .prepare("INSERT OR IGNORE INTO telegram_updates (update_id, received_at) VALUES (?, ?)")
    .bind(update.update_id, new Date().toISOString())
    .run();
  if ((inserted.meta.changes ?? 0) === 0) return c.json({ ok: true }); // already processed

  try {
    await handleUpdate(c.env, update as Record<string, unknown>);
  } catch {
    // Release the claim so Telegram's retry can reprocess the update.
    await c.env.DB
      .prepare("DELETE FROM telegram_updates WHERE update_id = ?")
      .bind(update.update_id)
      .run();
    return c.json({ error: "processing failed" }, 500);
  }
  return c.json({ ok: true });
});
