import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession, revokeSession } from "../src/auth/sessions";

beforeEach(resetDb);

async function newToken(): Promise<{ token: string; id: string; userId: string }> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token, id } = await createSession(env.DB, user.id, "mcp", 2);
  return { token, id, userId: user.id };
}

async function rpc(token: string | null, payload: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return SELF.fetch("https://example.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

describe("mcp transport", () => {
  it("rejects requests without a token", async () => {
    const res = await rpc(null, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rejects a revoked token", async () => {
    const { token, id } = await newToken();
    await revokeSession(env.DB, id);
    const res = await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(401);
  });

  it("initializes, echoing the client's protocol version", async () => {
    const { token } = await newToken();
    const res = await rpc(token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ result: { protocolVersion: string; capabilities: { tools: unknown }; serverInfo: { name: string } } }>();
    expect(body.result.protocolVersion).toBe("2024-11-05");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.serverInfo.name).toBe("how-i-bortey");
  });

  it("defaults the protocol version when none is requested", async () => {
    const { token } = await newToken();
    const res = await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    const body = await res.json<{ result: { protocolVersion: string } }>();
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("acknowledges notifications with 202 and no body", async () => {
    const { token } = await newToken();
    const res = await rpc(token, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
  });

  it("lists the four tools", async () => {
    const { token } = await newToken();
    const res = await rpc(token, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const body = await res.json<{ result: { tools: Array<{ name: string }> } }>();
    expect(body.result.tools.map((t) => t.name).sort()).toEqual([
      "add_entry",
      "get_entry",
      "list_tags",
      "search_library",
    ]);
  });

  it("returns -32601 for an unknown method", async () => {
    const { token } = await newToken();
    const res = await rpc(token, { jsonrpc: "2.0", id: 3, method: "does/notexist" });
    const body = await res.json<{ error: { code: number } }>();
    expect(body.error.code).toBe(-32601);
  });

  it("returns -32700 with 400 for malformed JSON", async () => {
    const { token } = await newToken();
    const res = await SELF.fetch("https://example.com/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: number } }>();
    expect(body.error.code).toBe(-32700);
  });

  it("rejects GET with 405", async () => {
    const res = await SELF.fetch("https://example.com/mcp");
    expect(res.status).toBe(405);
  });
});
