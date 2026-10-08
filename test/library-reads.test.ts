import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import { createEntry } from "../src/db/entries";
import { getRelations } from "../src/db/relations";
import { getLinks } from "../src/db/links";
import { listTags } from "../src/db/tags";

beforeEach(resetDb);

describe("library read helpers", () => {
  it("returns relations pointing at the related entry", async () => {
    const winner = await createEntry(env.DB, { title: "Capture One", kind: "tool" });
    const loser = await createEntry(env.DB, { title: "Lightroom", kind: "tool" });
    await env.DB
      .prepare(
        "INSERT INTO entry_relations (id, from_entry, to_entry, type, verdict, reason) VALUES (?, ?, ?, 'alternative_of', 'rejected', 'subscription only')",
      )
      .bind(crypto.randomUUID(), winner.id, loser.id)
      .run();

    const relations = await getRelations(env.DB, winner.id);
    expect(relations).toHaveLength(1);
    expect(relations[0].verdict).toBe("rejected");
    expect(relations[0].related?.title).toBe("Lightroom");
  });

  it("returns links for an entry", async () => {
    const e = await createEntry(env.DB, { title: "Darktable" });
    await env.DB
      .prepare("INSERT INTO links (id, entry_id, url, title, kind) VALUES (?, ?, ?, ?, 'tutorial')")
      .bind(crypto.randomUUID(), e.id, "https://example.com/t", "Getting started")
      .run();

    const links = await getLinks(env.DB, e.id);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://example.com/t");
    expect(links[0].kind).toBe("tutorial");
  });

  it("lists tags with usage counts", async () => {
    await createEntry(env.DB, { title: "A", tags: ["photo"] });
    await createEntry(env.DB, { title: "B", tags: ["photo", "oss"] });
    const tags = await listTags(env.DB);
    const photo = tags.find((t) => t.name === "photo");
    const oss = tags.find((t) => t.name === "oss");
    expect(photo?.count).toBe(2);
    expect(oss?.count).toBe(1);
  });
});
