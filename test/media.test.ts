import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";
import { createEntry } from "../src/db/entries";

beforeEach(resetDb);

async function cookie(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "test");
  return `hib_session=${token}`;
}

describe("media", () => {
  it("requires auth", async () => {
    const res = await SELF.fetch("https://example.com/media", { method: "POST", body: "hi" });
    expect(res.status).toBe(401);
  });

  it("uploads bytes and serves them back with the mime type", async () => {
    const c = await cookie();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const up = await SELF.fetch("https://example.com/media", {
      method: "POST",
      headers: { cookie: c, "content-type": "image/png" },
      body: bytes,
    });
    expect(up.status).toBe(201);
    const media = await up.json<{ id: string; mime: string }>();
    expect(media.mime).toBe("image/png");

    const get = await SELF.fetch(`https://example.com/media/${media.id}`, { headers: { cookie: c } });
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toContain("image/png");
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(bytes);
  });

  it("attaches media to an entry and includes it in GET /entries/:id", async () => {
    const c = await cookie();
    const e = await createEntry(env.DB, { title: "Photo note" });
    const up = await SELF.fetch("https://example.com/media", {
      method: "POST",
      headers: { cookie: c, "content-type": "image/jpeg", "x-entry-id": e.id },
      body: new Uint8Array([9, 9]),
    });
    expect(up.status).toBe(201);
    const entryRes = await SELF.fetch(`https://example.com/entries/${e.id}`, { headers: { cookie: c } });
    const entry = await entryRes.json<{ media: Array<{ mime: string }> }>();
    expect(entry.media).toHaveLength(1);
    expect(entry.media[0].mime).toBe("image/jpeg");
  });

  it("404s an unknown media id", async () => {
    const c = await cookie();
    const res = await SELF.fetch("https://example.com/media/nope", { headers: { cookie: c } });
    expect(res.status).toBe(404);
  });
});
