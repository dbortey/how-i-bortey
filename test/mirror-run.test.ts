import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { runMirror } from "../src/mirror/run";

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
