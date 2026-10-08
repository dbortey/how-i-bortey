import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";
import { listEntries } from "../src/db/entries";

beforeEach(resetDb);

async function token(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "mcp", 2);
  return token;
}

async function call(t: string, name: string, args: unknown): Promise<{ content: Array<{ text: string }>; isError?: boolean }> {
  const res = await SELF.fetch("https://example.com/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await res.json<{ result: { content: Array<{ text: string }>; isError?: boolean } }>();
  return body.result;
}

describe("mcp tool: add_entry", () => {
  it("creates an inbox entry sourced from mcp", async () => {
    const result = await call(await token(), "add_entry", {
      title: "RawTherapee",
      body: "open-source raw editor",
      tags: ["photo"],
    });
    expect(result.isError).toBeFalsy();
    const entries = (await listEntries(env.DB)).filter((e) => e.source === "mcp");
    expect(entries.map((e) => e.title)).toContain("RawTherapee");
    expect(entries[0].status).toBe("inbox");
  });

  it("returns a readable error when title is missing", async () => {
    const result = await call(await token(), "add_entry", { body: "no title" });
    expect(result.isError).toBe(true);
  });

  it("returns a readable error for an unknown tool", async () => {
    const result = await call(await token(), "nope", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unknown tool");
  });

  it("handles null arguments without crashing", async () => {
    const res = await SELF.fetch("https://example.com/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_tags", arguments: null } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ result: { isError?: boolean } }>();
    expect(body.result.isError).toBeFalsy();
  });
});
