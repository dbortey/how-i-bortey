import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";

beforeEach(resetDb);

const SECRET = "test-webhook-secret"; // set in vitest.config.ts bindings

function post(secret: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-telegram-bot-api-secret-token"] = secret;
  return SELF.fetch("https://example.com/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("telegram webhook plumbing", () => {
  it("rejects a wrong secret", async () => {
    const res = await post("nope", { update_id: 1 });
    expect(res.status).toBe(401);
  });

  it("rejects a missing secret", async () => {
    const res = await post(null, { update_id: 1 });
    expect(res.status).toBe(401);
  });

  it("accepts a valid secret and records the update", async () => {
    const res = await post(SECRET, { update_id: 101 });
    expect(res.status).toBe(200);
    const { results } = await env.DB.prepare("SELECT update_id FROM telegram_updates").all<{ update_id: number }>();
    expect(results.map((r) => r.update_id)).toEqual([101]);
  });

  it("dedupes a repeated update_id", async () => {
    await post(SECRET, { update_id: 202, message: { text: "hi" } });
    const res = await post(SECRET, { update_id: 202, message: { text: "hi" } });
    expect(res.status).toBe(200);
    const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM telegram_updates").all<{ n: number }>();
    expect(results[0].n).toBe(1);
  });
});
