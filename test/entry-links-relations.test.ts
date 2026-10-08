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

function json(cookie: string, body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("entry links & relations", () => {
  it("adds and removes a link", async () => {
    const c = await cookie();
    const e = await createEntry(env.DB, { title: "Darktable" });
    const created = await SELF.fetch(`https://example.com/entries/${e.id}/links`, json(c, { url: "https://darktable.org", kind: "docs" }));
    expect(created.status).toBe(201);
    const link = await created.json<{ id: string; url: string }>();
    expect(link.url).toBe("https://darktable.org");

    const del = await SELF.fetch(`https://example.com/entries/${e.id}/links/${link.id}`, { method: "DELETE", headers: { cookie: c } });
    expect(del.status).toBe(204);

    const list = await SELF.fetch(`https://example.com/entries/${e.id}`, { headers: { cookie: c } });
    const entry = await list.json<{ links: unknown[] }>();
    expect(entry.links).toEqual([]);
  });

  it("rejects a link without a url", async () => {
    const c = await cookie();
    const e = await createEntry(env.DB, { title: "X" });
    const res = await SELF.fetch(`https://example.com/entries/${e.id}/links`, json(c, { title: "no url" }));
    expect(res.status).toBe(400);
  });

  it("adds and removes a relation", async () => {
    const c = await cookie();
    const winner = await createEntry(env.DB, { title: "Capture One" });
    const loser = await createEntry(env.DB, { title: "Lightroom" });
    const created = await SELF.fetch(`https://example.com/entries/${winner.id}/relations`, json(c, { to_entry: loser.id, type: "alternative_of", verdict: "rejected", reason: "subscription" }));
    expect(created.status).toBe(201);
    const rel = await created.json<{ id: string; related: { title: string } }>();
    expect(rel.related.title).toBe("Lightroom");

    const del = await SELF.fetch(`https://example.com/entries/${winner.id}/relations/${rel.id}`, { method: "DELETE", headers: { cookie: c } });
    expect(del.status).toBe(204);
  });

  it("rejects a relation to a missing entry", async () => {
    const c = await cookie();
    const e = await createEntry(env.DB, { title: "X" });
    const res = await SELF.fetch(`https://example.com/entries/${e.id}/relations`, json(c, { to_entry: "nope", type: "alternative_of" }));
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    const e = await createEntry(env.DB, { title: "X" });
    const res = await SELF.fetch(`https://example.com/entries/${e.id}/links`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
  });
});
