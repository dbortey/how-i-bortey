import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import { createEntry } from "../src/db/entries";
import { putEmbedding } from "../src/embeddings/store";
import { searchEntries } from "../src/db/search";
import type { AiLike } from "../src/embeddings/ai";

beforeEach(resetDb);

// Fake AI: embeds by a fixed table so "photo" maps near the Capture One vector.
function ai(): AiLike {
  const vec = (seed: number) => Float32Array.from({ length: 384 }, (_, i) => (i === 0 ? seed : 0));
  return {
    run: async (_m: string, input: { text: string[] }) => ({
      data: input.text.map((t) => {
        if (t.includes("photo") || t.includes("photo")) return Array.from(vec(1));
        if (t.includes("invoice")) return Array.from(vec(2));
        return Array.from(vec(0));
      }),
    }),
  };
}

describe("hybrid search", () => {
  it("finds a pair by meaning when keywords don't overlap", async () => {
    const e = await createEntry(env.DB, { title: "Capture One", body: "raw image development" });
    await putEmbedding(env.DB, e.id, Float32Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0)), "m");
    const results = await searchEntries(env.DB, "editing a photo", { ai: ai() });
    expect(results.map((r) => r.title)).toContain("Capture One");
  });

  it("falls back to FTS when ai is omitted", async () => {
    await createEntry(env.DB, { title: "Darktable", body: "open source raw editor" });
    const results = await searchEntries(env.DB, "open source");
    expect(results.map((r) => r.title)).toContain("Darktable");
  });

  it("returns FTS results (no throw) when the ai call fails", async () => {
    await createEntry(env.DB, { title: "Lightroom", body: "adobe subscription" });
    const broken: AiLike = { run: async () => { throw new Error("ai down"); } };
    const results = await searchEntries(env.DB, "adobe", { ai: broken });
    expect(results.map((r) => r.title)).toContain("Lightroom");
  });
});
