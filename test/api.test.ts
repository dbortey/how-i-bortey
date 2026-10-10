import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";
import { putEmbedding, getEmbedding } from "../src/embeddings/store";

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

  it("removes the embedding when an entry is deleted", async () => {
    const cookie = await authCookie();
    const created = await SELF.fetch("https://example.com/entries", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "Capture One" }),
    });
    const entry = await created.json<{ id: string }>();
    await putEmbedding(
      env.DB,
      entry.id,
      Float32Array.from({ length: 384 }, () => 0.1),
      "m",
    );
    expect(await getEmbedding(env.DB, entry.id)).not.toBeNull();

    const del = await SELF.fetch(`https://example.com/entries/${entry.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(204);
    expect(await getEmbedding(env.DB, entry.id)).toBeNull();
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

  it("rejects non-string tags with 400", async () => {
    const cookie = await authCookie();
    const res = await SELF.fetch("https://example.com/entries", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "X", tags: "photo" }),
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

  it("applies the status filter to ?q= search", async () => {
    const cookie = await authCookie();
    const create = (title: string, status: string) =>
      SELF.fetch("https://example.com/entries", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ title, body: "photo editor", status }),
      });
    await create("Filed One", "filed");
    await create("Inbox One", "inbox");

    const res = await SELF.fetch("https://example.com/entries?q=photo&status=filed", {
      headers: { cookie },
    });
    const results = await res.json<Array<{ title: string; status: string }>>();
    expect(results.map((e) => e.title)).toEqual(["Filed One"]);
  });
});

describe("auth flow", () => {
  async function requestLink(email: string): Promise<Response> {
    return SELF.fetch("https://example.com/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  it("returns a dev link for the owner and refuses strangers", async () => {
    const ok = await requestLink("owner@example.com");
    expect(ok.status).toBe(200);
    const body = await ok.json<{ ok: boolean; devLink: string }>();
    expect(body.devLink).toContain("/auth/verify?token=");

    const denied = await requestLink("stranger@example.com");
    expect(denied.status).toBe(403);
  });

  it("GET verify renders a confirm page without consuming the token; POST consumes it", async () => {
    const req = await requestLink("owner@example.com");
    const devLink = (await req.json<{ devLink: string }>()).devLink;
    const token = new URL(devLink).searchParams.get("token")!;

    const page = await SELF.fetch(`https://example.com/auth/verify?token=${token}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type") ?? "").toContain("text/html");
    const html = await page.text();
    expect(html.toLowerCase()).toContain("confirm");

    const post = await SELF.fetch("https://example.com/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `token=${token}`,
      redirect: "manual",
    });
    expect(post.status).toBe(302);
    const setCookie = post.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("hib_session=");

    const me = await SELF.fetch("https://example.com/me", {
      headers: { cookie: setCookie.split(";")[0] },
    });
    expect((await me.json<{ userId: string }>()).userId).toBeTruthy();
  });

  it("rejects a reused magic token", async () => {
    const req = await requestLink("owner@example.com");
    const devLink = (await req.json<{ devLink: string }>()).devLink;
    const token = new URL(devLink).searchParams.get("token")!;
    const headers = { "content-type": "application/x-www-form-urlencoded" };
    const first = await SELF.fetch("https://example.com/auth/verify", {
      method: "POST",
      headers,
      body: `token=${token}`,
      redirect: "manual",
    });
    expect(first.status).toBe(302);
    const second = await SELF.fetch("https://example.com/auth/verify", {
      method: "POST",
      headers,
      body: `token=${token}`,
      redirect: "manual",
    });
    expect(second.status).toBe(400);
  });

  it("does not stack pending tokens for the same email", async () => {
    const first = await requestLink("owner@example.com");
    const firstBody = await first.json<{ ok: boolean; devLink?: string }>();
    expect(firstBody.devLink).toBeTruthy();

    const second = await requestLink("owner@example.com");
    const secondBody = await second.json<{ ok: boolean; devLink?: string }>();
    expect(secondBody.ok).toBe(true);
    expect(secondBody.devLink).toBeUndefined();

    const { results } = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM magic_tokens")
      .all<{ n: number }>();
    expect(results[0].n).toBe(1);
  });

  it("rejects an invalid magic token on POST", async () => {
    const res = await SELF.fetch("https://example.com/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "token=nope",
      redirect: "manual",
    });
    expect(res.status).toBe(400);
  });
});
