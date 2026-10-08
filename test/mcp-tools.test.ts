import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";
import { createEntry } from "../src/db/entries";

beforeEach(resetDb);

async function token(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "mcp", 2);
  return token;
}

async function callTool(t: string, name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const res = await SELF.fetch("https://example.com/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await res.json<{ result: { content: Array<{ type: string; text: string }>; isError?: boolean } }>();
  return body.result;
}

describe("mcp tools: search_library", () => {
  it("finds an entry and includes its relations", async () => {
    const winner = await createEntry(env.DB, { title: "Capture One", body: "preferred photo editor" });
    const loser = await createEntry(env.DB, { title: "Lightroom" });
    await env.DB
      .prepare("INSERT INTO entry_relations (id, from_entry, to_entry, type, verdict, reason) VALUES (?, ?, ?, 'alternative_of', 'rejected', 'subscription')")
      .bind(crypto.randomUUID(), winner.id, loser.id)
      .run();

    const result = await callTool(await token(), "search_library", { query: "photo editor" });
    const entries = JSON.parse(result.content[0].text) as Array<{ title: string; relations: Array<{ related: { title: string } }> }>;
    expect(entries.map((e) => e.title)).toContain("Capture One");
    expect(entries[0].relations[0].related.title).toBe("Lightroom");
  });

  it("does not throw on FTS syntax characters", async () => {
    await createEntry(env.DB, { title: "Lightroom", body: "adobe" });
    const result = await callTool(await token(), "search_library", { query: 'lightroom OR "x" *' });
    expect(result.isError).toBeFalsy();
  });

  it("returns a readable error when query is missing", async () => {
    const result = await callTool(await token(), "search_library", {});
    expect(result.isError).toBe(true);
  });
});

describe("mcp tools: get_entry", () => {
  it("returns an entry with links", async () => {
    const e = await createEntry(env.DB, { title: "Darktable" });
    await env.DB
      .prepare("INSERT INTO links (id, entry_id, url, title, kind) VALUES (?, ?, ?, ?, 'docs')")
      .bind(crypto.randomUUID(), e.id, "https://darktable.org", "Manual")
      .run();
    const result = await callTool(await token(), "get_entry", { id: e.id });
    const entry = JSON.parse(result.content[0].text) as { title: string; links: Array<{ url: string }> };
    expect(entry.title).toBe("Darktable");
    expect(entry.links[0].url).toBe("https://darktable.org");
  });

  it("returns a readable error for an unknown id", async () => {
    const result = await callTool(await token(), "get_entry", { id: "nope" });
    expect(result.isError).toBe(true);
  });
});

describe("mcp tools: list_tags", () => {
  it("returns tags with counts", async () => {
    await createEntry(env.DB, { title: "A", tags: ["photo"] });
    const result = await callTool(await token(), "list_tags", {});
    const tags = JSON.parse(result.content[0].text) as Array<{ name: string; count: number }>;
    expect(tags.find((t) => t.name === "photo")?.count).toBe(1);
  });
});
