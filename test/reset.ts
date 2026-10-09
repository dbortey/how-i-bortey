import { env } from "cloudflare:test";

export async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM entries_fts"),
    env.DB.prepare("DELETE FROM entry_relations"),
    env.DB.prepare("DELETE FROM entry_tags"),
    env.DB.prepare("DELETE FROM links"),
    env.DB.prepare("DELETE FROM media"),
    env.DB.prepare("DELETE FROM entries"),
    env.DB.prepare("DELETE FROM tags"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM magic_tokens"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM telegram_updates"),
  ]);
}
