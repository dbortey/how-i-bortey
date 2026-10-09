import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { listEntries } from "../src/db/entries";

// NOTE: this version of @cloudflare/vitest-pool-workers (0.23.0) no longer
// exports `fetchMock`. The default worker runs in the same isolate/context as
// the tests, so stubbing `globalThis.fetch` intercepts the Bot API call.
const SECRET = "test-webhook-secret";

interface FetchCall {
  url: string;
  body: unknown;
}

let calls: FetchCall[] = [];
let reply: (url: string) => Promise<Response>;

beforeEach(async () => {
  await resetDb();
  calls = [];
  reply = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return reply(url);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function post(body: unknown): Promise<Response> {
  return SELF.fetch("https://example.com/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
    body: JSON.stringify(body),
  });
}

function textUpdate(updateId: number, text: string): unknown {
  return { update_id: updateId, message: { message_id: 5, chat: { id: 42 }, text } };
}

describe("telegram text capture", () => {
  it("creates an inbox entry from a text message and replies", async () => {
    const res = await post(textUpdate(1, "Capture One\nprefer it over Lightroom"));
    expect(res.status).toBe(200);

    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("telegram");
    expect(entries[0].title).toBe("Capture One");
    expect(entries[0].body).toContain("Lightroom");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: 42 });
  });

  it("suppresses dispatch for a duplicate update_id (one entry)", async () => {
    const first = await post(textUpdate(7, "Capture One"));
    expect(first.status).toBe(200);

    const second = await post(textUpdate(7, "Capture One"));
    expect(second.status).toBe(200);

    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("still saves the entry and does not duplicate when the reply fails", async () => {
    reply = async () => {
      throw new Error("reply failed");
    };

    const res = await post(textUpdate(9, "still saved"));
    expect(res.status).toBe(200);

    let entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("still saved");

    let { results } = await env.DB.prepare("SELECT update_id FROM telegram_updates")
      .all<{ update_id: number }>();
    expect(results).toHaveLength(1);

    // A Telegram retry of the same update must not duplicate the capture.
    const retry = await post(textUpdate(9, "still saved"));
    expect(retry.status).toBe(200);

    entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    ({ results } = await env.DB.prepare("SELECT update_id FROM telegram_updates")
      .all<{ update_id: number }>());
    expect(results).toHaveLength(1);
  });
});
