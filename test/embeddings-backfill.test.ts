import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";
import { createEntry } from "../src/db/entries";
import { backfillEmbeddings } from "../src/embeddings/backfill";
import { embeddingRoutes } from "../src/routes/embeddings";
import { EMBEDDING_MODEL, type AiLike } from "../src/embeddings/ai";
import { putEmbedding, getEmbedding } from "../src/embeddings/store";

beforeEach(resetDb);

function fakeAi(dims = 384): AiLike {
  return {
    run: async (model: string, input: { text: string[] }) => {
      expect(model).toBe(EMBEDDING_MODEL);
      return {
        data: input.text.map((t) =>
          Array.from({ length: dims }, (_, i) => (t.length + i) / 1000),
        ),
      };
    },
  };
}

async function cookie(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "test");
  return `hib_session=${token}`;
}

describe("backfillEmbeddings", () => {
  it("embeds entries lacking an embedding, idempotently", async () => {
    const a = await createEntry(env.DB, { title: "A" });
    await createEntry(env.DB, { title: "B" });

    const first = await backfillEmbeddings(env.DB, fakeAi());
    expect(first).toEqual({ embedded: 2, total: 2 });
    expect(await getEmbedding(env.DB, a.id)).not.toBeNull();

    const second = await backfillEmbeddings(env.DB, fakeAi());
    expect(second).toEqual({ embedded: 0, total: 2 });
  });

  it("skips entries that already have an embedding", async () => {
    const a = await createEntry(env.DB, { title: "A" });
    const b = await createEntry(env.DB, { title: "B" });
    await putEmbedding(
      env.DB,
      a.id,
      Float32Array.from({ length: 384 }, () => 0.1),
      EMBEDDING_MODEL,
    );

    const res = await backfillEmbeddings(env.DB, fakeAi());
    expect(res).toEqual({ embedded: 1, total: 2 });
    expect(await getEmbedding(env.DB, b.id)).not.toBeNull();
  });

  it("re-embeds everything when all=true", async () => {
    const a = await createEntry(env.DB, { title: "A" });
    await putEmbedding(
      env.DB,
      a.id,
      Float32Array.from({ length: 384 }, () => 0.1),
      EMBEDDING_MODEL,
    );

    const res = await backfillEmbeddings(env.DB, fakeAi(), { all: true });
    expect(res).toEqual({ embedded: 1, total: 1 });
  });
});

describe("POST /embeddings/backfill", () => {
  it("requires auth (401)", async () => {
    const res = await SELF.fetch("https://example.com/embeddings/backfill", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when AI is not configured", async () => {
    const c = await cookie();
    const res = await embeddingRoutes.request(
      "https://example.com/backfill",
      { method: "POST", headers: { cookie: c } },
      { DB: env.DB } as unknown as Env,
    );
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe("AI not configured");
  });
});
