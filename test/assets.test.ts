import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("API routes survive asset wiring", () => {
  it("serves /health from the Worker", async () => {
    const res = await SELF.fetch("https://example.com/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
