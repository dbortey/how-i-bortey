import { describe, it, expect, beforeEach, vi } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { runMirror } from "../src/mirror/run";
import { createEntry } from "../src/db/entries";

describe("mirror: unconfigured is a no-op", () => {
  it("returns configured:false and does not touch the network", async () => {
    const result = await runMirror(env.DB, { repo: "", branch: "main", token: "" });
    expect(result).toEqual({ written: 0, skipped: 0, configured: false });
  });
});

describe("scheduled handler", () => {
  it("is exported and runs without throwing when unconfigured", async () => {
    // The Worker default export exposes a scheduled() handler.
    const worker = (await import("../src/index")).default as {
      scheduled?: (e: unknown, env2: unknown, ctx: unknown) => Promise<void>;
    };
    expect(typeof worker.scheduled).toBe("function");
    await worker.scheduled!({}, env, { waitUntil: (p: Promise<unknown>) => p });
  });
});

const cfg = { repo: "owner/library", branch: "main", token: "ghp_test" };

// Buffer is available at runtime under nodejs_compat but has no type definitions,
// so the mock store encodes/decodes base64 with the Worker globals instead.
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}

describe("mirror run", () => {
  beforeEach(() => {
    resetDb();
    vi.restoreAllMocks();
  });

  it("writes an entry file and an index on the first run", async () => {
    await createEntry(env.DB, { title: "Capture One", body: "raw editor ✨" });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      if ((init?.method ?? "GET") === "GET") return new Response("", { status: 404 });
      return new Response(JSON.stringify({ content: {} }), { status: 200 });
    });

    const result = await runMirror(env.DB, cfg);
    expect(result.configured).toBe(true);
    expect(result.written).toBeGreaterThanOrEqual(2); // entry + index
    expect(calls.some((c) => c.startsWith("PUT") && c.includes("contents/entries/"))).toBe(true);
    expect(calls.some((c) => c.startsWith("PUT") && c.includes("contents/index.md"))).toBe(true);
  });

  it("skips unchanged files on a second run", async () => {
    await createEntry(env.DB, { title: "Capture One" });
    const store = new Map<string, string>();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      const path = decodeURIComponent(u.split("/contents/")[1]?.split("?")[0] ?? "");
      const method = init?.method ?? "GET";
      if (method === "GET") {
        const content = store.get(path);
        if (!content) return new Response("", { status: 404 });
        return new Response(JSON.stringify({ sha: "s", content: toBase64(content) }), { status: 200 });
      }
      const body = JSON.parse(String(init!.body));
      store.set(path, fromBase64(body.content));
      return new Response(JSON.stringify({ content: {} }), { status: 200 });
    });

    const first = await runMirror(env.DB, cfg);
    const second = await runMirror(env.DB, cfg);
    expect(first.written).toBeGreaterThan(0);
    expect(second.written).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
  });
});
