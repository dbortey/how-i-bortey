import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { listEntries } from "../src/db/entries";
import { getMediaForEntry } from "../src/media/store";

// NOTE: this version of @cloudflare/vitest-pool-workers (0.23.0) no longer
// exports `fetchMock`. The default worker runs in the same isolate/context as
// the tests, so stubbing `globalThis.fetch` intercepts the Bot API calls.
const SECRET = "test-webhook-secret";

interface FetchCall {
  url: string;
  method: string;
}

let calls: FetchCall[] = [];
// Per-test knobs for the Bot API stubs.
let filePath: string | null;
let photoBytes: Uint8Array | null;
let throwOnDownload: boolean;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(async () => {
  await resetDb();
  calls = [];
  filePath = "photos/file_1.jpg";
  photoBytes = new Uint8Array([7, 7, 7]);
  throwOnDownload = false;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/getFile")) {
      if (filePath === null) return json({ ok: false }, 400);
      return json({ ok: true, result: { file_path: filePath } });
    }
    if (url.includes("/file/bot")) {
      if (throwOnDownload) throw new Error("network down");
      if (photoBytes === null) return new Response("nope", { status: 404 });
      return new Response(photoBytes, { status: 200 });
    }
    if (url.includes("/sendMessage")) {
      return json({ ok: true });
    }
    return new Response("unexpected", { status: 500 });
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

describe("telegram photo capture", () => {
  it("stores the largest photo in R2 and links it to a new entry", async () => {
    const res = await post({
      update_id: 7,
      message: {
        message_id: 9,
        chat: { id: 42 },
        caption: "Darktable export",
        photo: [{ file_id: "small" }, { file_id: "big" }],
      },
    });
    expect(res.status).toBe(200);

    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Darktable export");
    expect(entries[0].body).toBe("Darktable export");
    expect(entries[0].source).toBe("telegram");

    const media = await getMediaForEntry(env.DB, entries[0].id);
    expect(media).toHaveLength(1);
    expect(media[0].mime).toBe("image/jpeg");
    expect(media[0].caption).toBe("Darktable export");

    // the largest photo (last entry) is the one requested from Telegram
    const getFile = calls.find((c) => c.url.includes("/getFile"));
    expect(getFile?.url).toContain("file_id=big");
  });

  it("defaults the title to 'Photo' when there is no caption", async () => {
    const res = await post({
      update_id: 8,
      message: { message_id: 10, chat: { id: 42 }, photo: [{ file_id: "only" }] },
    });
    expect(res.status).toBe(200);

    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Photo");
    expect(entries[0].body).toBe("");

    const media = await getMediaForEntry(env.DB, entries[0].id);
    expect(media).toHaveLength(1);
    expect(media[0].caption).toBeNull();
  });

  it("keeps the caption entry when the photo download fails", async () => {
    filePath = null; // getFile returns a non-ok response

    const res = await post({
      update_id: 11,
      message: {
        message_id: 11,
        chat: { id: 42 },
        caption: "No bytes available",
        photo: [{ file_id: "big" }],
      },
    });
    expect(res.status).toBe(200);

    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("No bytes available");
    expect(entries[0].body).toBe("No bytes available");

    const media = await getMediaForEntry(env.DB, entries[0].id);
    expect(media).toHaveLength(0);
  });

  it("keeps the entry when the photo download throws", async () => {
    throwOnDownload = true; // file fetch rejects

    const res = await post({
      update_id: 12,
      message: {
        message_id: 12,
        chat: { id: 42 },
        caption: "Still saved",
        photo: [{ file_id: "big" }],
      },
    });
    expect(res.status).toBe(200);

    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Still saved");
    const media = await getMediaForEntry(env.DB, entries[0].id);
    expect(media).toHaveLength(0);
  });

  it("keeps the entry when media storage fails after a successful download", async () => {
    // Bytes download fine, but R2 put rejects - the capture must still survive
    // so Telegram's retry (triggered by a 500) cannot duplicate the entry.
    const put = vi.spyOn(env.MEDIA, "put").mockRejectedValueOnce(new Error("R2 down"));

    const res = await post({
      update_id: 13,
      message: {
        message_id: 13,
        chat: { id: 42 },
        caption: "Media failed",
        photo: [{ file_id: "big" }],
      },
    });
    put.mockRestore();
    expect(res.status).toBe(200);

    const entries = await listEntries(env.DB, { status: "inbox" });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Media failed");
    expect(entries[0].body).toBe("Media failed");
    const media = await getMediaForEntry(env.DB, entries[0].id);
    expect(media).toHaveLength(0);

    // The claim was not released, so a Telegram retry is a no-op.
    const again = await post({
      update_id: 13,
      message: {
        message_id: 13,
        chat: { id: 42 },
        caption: "Media failed",
        photo: [{ file_id: "big" }],
      },
    });
    expect(again.status).toBe(200);
    expect(await listEntries(env.DB, { status: "inbox" })).toHaveLength(1);
  });
});
