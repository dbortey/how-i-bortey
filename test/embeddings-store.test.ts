import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./reset";
import { createEntry } from "../src/db/entries";
import {
  putEmbedding,
  getEmbedding,
  getAllEmbeddings,
  deleteEmbedding,
  countEmbeddings,
  cosine,
} from "../src/embeddings/store";

beforeEach(resetDb);

function vec(values: number[]): Float32Array {
  const f = new Float32Array(384);
  values.forEach((v, i) => (f[i] = v));
  return f;
}

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine(vec([1]), vec([1]))).toBeCloseTo(1);
    expect(cosine(vec([1]), vec([0, 1]))).toBeCloseTo(0);
    expect(cosine(vec([1]), vec([-1]))).toBeCloseTo(-1);
  });
});

describe("embedding store", () => {
  it("round-trips a 384-float vector through D1 (BLOB)", async () => {
    const e = await createEntry(env.DB, { title: "X" });
    const v = vec([0.5, -0.25, 1]);
    await putEmbedding(env.DB, e.id, v, "m");
    const got = await getEmbedding(env.DB, e.id);
    expect(got).not.toBeNull();
    expect(got!.length).toBe(384);
    expect(got![0]).toBeCloseTo(0.5);
    expect(got![1]).toBeCloseTo(-0.25);
    expect(got![2]).toBeCloseTo(1);
  });

  it("upserts (one row per entry) and lists all", async () => {
    const e = await createEntry(env.DB, { title: "X" });
    await putEmbedding(env.DB, e.id, vec([1]), "m");
    await putEmbedding(env.DB, e.id, vec([2]), "m");
    expect(await countEmbeddings(env.DB)).toBe(1);
    const all = await getAllEmbeddings(env.DB);
    expect(all[0].vector[0]).toBeCloseTo(2);
  });

  it("deletes an embedding", async () => {
    const e = await createEntry(env.DB, { title: "X" });
    await putEmbedding(env.DB, e.id, vec([1]), "m");
    await deleteEmbedding(env.DB, e.id);
    expect(await getEmbedding(env.DB, e.id)).toBeNull();
  });
});
