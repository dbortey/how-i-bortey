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

interface DetailedEntry {
  id: string;
  links: Array<{ url: string }>;
  relations: Array<{ related: { title: string } | null }>;
  media: Array<{ mime: string | null }>;
}

describe("GET /entries includes details", () => {
  it("attaches links, relations and media to each entry", async () => {
    const c = await cookie();
    const winner = await createEntry(env.DB, { title: "Capture One" });
    const loser = await createEntry(env.DB, { title: "Lightroom" });

    await SELF.fetch(`https://example.com/entries/${winner.id}/links`, {
      method: "POST",
      headers: { cookie: c, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/tutorial" }),
    });
    await SELF.fetch(`https://example.com/entries/${winner.id}/relations`, {
      method: "POST",
      headers: { cookie: c, "content-type": "application/json" },
      body: JSON.stringify({ to_entry: loser.id, type: "alternative_of", verdict: "rejected" }),
    });

    const res = await SELF.fetch("https://example.com/entries", { headers: { cookie: c } });
    const entries = await res.json<DetailedEntry[]>();
    const found = entries.find((e) => e.id === winner.id)!;
    expect(found.links).toHaveLength(1);
    expect(found.relations).toHaveLength(1);
    expect(found.relations[0].related?.title).toBe("Lightroom");
    expect(found.media).toEqual([]);
  });
});
