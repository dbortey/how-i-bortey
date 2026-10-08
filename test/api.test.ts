import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";

beforeEach(resetDb);

async function authCookie(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "test");
  return `hib_session=${token}`;
}

describe("entry API", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await SELF.fetch("https://example.com/entries");
    expect(res.status).toBe(401);
  });

  it("creates, lists, reads, updates and deletes an entry when authed", async () => {
    const cookie = await authCookie();
    const created = await SELF.fetch("https://example.com/entries", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "Capture One", tags: ["photography"] }),
    });
    expect(created.status).toBe(201);
    const entry = await created.json<{ id: string; title: string }>();
    expect(entry.title).toBe("Capture One");

    const list = await SELF.fetch("https://example.com/entries", {
      headers: { cookie },
    });
    expect((await list.json<unknown[]>()).length).toBe(1);

    const patched = await SELF.fetch(`https://example.com/entries/${entry.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "filed" }),
    });
    expect((await patched.json<{ status: string }>()).status).toBe("filed");

    const del = await SELF.fetch(`https://example.com/entries/${entry.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(204);
  });

  it("validates the create body", async () => {
    const cookie = await authCookie();
    const res = await SELF.fetch("https://example.com/entries", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("searches with ?q=", async () => {
    const cookie = await authCookie();
    await SELF.fetch("https://example.com/entries", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "Capture One", body: "photo editor" }),
    });
    const res = await SELF.fetch("https://example.com/entries?q=photo", {
      headers: { cookie },
    });
    const results = await res.json<Array<{ title: string }>>();
    expect(results.map((e) => e.title)).toEqual(["Capture One"]);
  });
});

describe("auth flow", () => {
  it("requests a magic link (dev returns link) and verifies it into a session", async () => {
    const req = await SELF.fetch("https://example.com/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com" }),
    });
    const body = await req.json<{ ok: boolean; devLink: string }>();
    expect(body.ok).toBe(true);
    const token = new URL(body.devLink).searchParams.get("token")!;

    const verify = await SELF.fetch(`https://example.com/auth/verify?token=${token}`, {
      redirect: "manual",
    });
    expect(verify.status).toBe(302);
    const setCookie = verify.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("hib_session=");

    const me = await SELF.fetch("https://example.com/me", {
      headers: { cookie: setCookie.split(";")[0] },
    });
    expect((await me.json<{ userId: string }>()).userId).toBeTruthy();
  });

  it("rejects an invalid magic token", async () => {
    const res = await SELF.fetch("https://example.com/auth/verify?token=nope", {
      redirect: "manual",
    });
    expect(res.status).toBe(400);
  });
});
