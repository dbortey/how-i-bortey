import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import { createEntry } from "../src/db/entries";
import { embedTexts, entryEmbeddingText, embedEntry, EMBEDDING_MODEL, type AiLike } from "../src/embeddings/ai";
import { getEmbedding } from "../src/embeddings/store";

beforeEach(resetDb);

function fakeAi(dims = 384): AiLike {
  return {
    run: async (model: string, input: { text: string[] }) => {
      expect(model).toBe(EMBEDDING_MODEL);
      return { data: input.text.map((t) => Array.from({ length: dims }, (_, i) => (t.length + i) / 1000)) };
    },
  };
}

describe("embedTexts", () => {
  it("returns one Float32Array per input text", async () => {
    const out = await embedTexts(fakeAi(), ["a", "bb"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeInstanceOf(Float32Array);
    expect(out[0].length).toBe(384);
  });
});

describe("entryEmbeddingText", () => {
  it("joins title, tags and body", () => {
    expect(entryEmbeddingText({ title: "Capture One", tags: ["photo", "raw"], body: "notes" })).toBe("Capture One\nphoto raw\nnotes");
  });
});

describe("embedEntry", () => {
  it("stores the vector for an entry", async () => {
    const e = await createEntry(env.DB, { title: "Capture One", tags: ["photo"] });
    expect(await embedEntry(env.DB, fakeAi(), e.id)).toBe(true);
    expect(await getEmbedding(env.DB, e.id)).not.toBeNull();
  });
  it("returns false for a missing entry", async () => {
    expect(await embedEntry(env.DB, fakeAi(), "nope")).toBe(false);
  });
});
