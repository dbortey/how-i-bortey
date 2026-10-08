import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession, getActiveSession } from "../src/auth/sessions";
import { resolveBearer } from "../src/mcp/auth";

beforeEach(resetDb);

async function ownerCookie(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "web");
  return `hib_session=${token}`;
}

describe("mcp tokens", () => {
  it("requires a session to mint a token", async () => {
    const res = await SELF.fetch("https://example.com/access/tokens", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("mints a token that resolves to a live session", async () => {
    const cookie = await ownerCookie();
    const res = await SELF.fetch("https://example.com/access/tokens", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ label: "claude", ttlHours: 2 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ token: string; id: string; expiresAt: string }>();
    expect(typeof body.token).toBe("string");

    const session = await getActiveSession(env.DB, body.token);
    expect(session?.id).toBe(body.id);
  });

  it("falls back to the default TTL for a non-numeric ttlHours", async () => {
    const cookie = await ownerCookie();
    const res = await SELF.fetch("https://example.com/access/tokens", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ttlHours: "abc" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ token: string; expiresAt: string }>();
    expect(typeof body.expiresAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
  });

  it("tolerates a null JSON body", async () => {
    const cookie = await ownerCookie();
    const res = await SELF.fetch("https://example.com/access/tokens", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "null",
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ token: string; expiresAt: string }>();
    expect(typeof body.expiresAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
  });

  it("resolves a bearer token from a request header", async () => {
    const user = await upsertUserByEmail(env.DB, "owner@example.com");
    const { token, id } = await createSession(env.DB, user.id, "cli", 2);
    const request = new Request("https://example.com/mcp", {
      headers: { authorization: `Bearer ${token}` },
    });
    const resolved = await resolveBearer(env.DB, request);
    expect(resolved?.sessionId).toBe(id);
    expect(resolved?.userId).toBe(user.id);
  });

  it("returns null for a missing or garbage bearer token", async () => {
    expect(await resolveBearer(env.DB, new Request("https://example.com/mcp"))).toBeNull();
    const bad = new Request("https://example.com/mcp", { headers: { authorization: "Bearer nope" } });
    expect(await resolveBearer(env.DB, bad)).toBeNull();
  });
});
