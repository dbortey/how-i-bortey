import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("schema", () => {
  it("creates every table", async () => {
    const expected = [
      "entries",
      "entry_relations",
      "entry_tags",
      "links",
      "magic_tokens",
      "media",
      "sessions",
      "tags",
      "users",
    ];
    const { results } = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const t of expected) expect(names).toContain(t);
  });

  it("creates the FTS5 virtual table", async () => {
    const { results } = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE name='entries_fts'")
      .all<{ name: string }>();
    expect(results).toHaveLength(1);
  });
});
