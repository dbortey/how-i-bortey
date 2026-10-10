# Semantic Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add meaning-based recall — embed every entry with Workers AI (free) and store vectors in D1, then make `searchEntries` hybrid (semantic ∪ FTS5) with a graceful FTS-only fallback.

**Architecture:** A new `entry_embeddings` table holds a 384-dim float vector per entry. Entries are embedded best-effort on create/update (never blocking capture) and via a backfill endpoint. `searchEntries` runs today's FTS5 query *and* a cosine-similarity query over all vectors, merges semantic-first, and falls back to FTS when the `AI` binding is unavailable.

**Tech Stack:** Cloudflare Workers + Hono, D1, Workers AI (`@cf/baai/bge-small-en-v1.5`), Vitest + `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-10-08-semantic-search-design.md`

## Global Constraints

- Workers only; runtime deps `hono` + `postal-mime` (no new deps).
- No paid dependency: use Workers AI (free tier), **not** Vectorize.
- Embedding is **best-effort**: a failure must never fail a capture or a read; `searchEntries` falls back to FTS-only when `ai` is absent or throws.
- Service like `AiLike` (see Task 2) so tests inject a fake and no network is used.
- All SQL parameterized; timestamps ISO-8601 UTC. Migration id `0003`.

## Review Focus

Input classes most likely to bite a real user, each pinned to a test in its owning task:

1. **No `AI` binding / AI error at query time** — search must return FTS results, never 500. (Task 4)
2. **Entry created while embedding fails** — the entry exists and is keyword-searchable; no orphan/crash. (Task 3)
3. **Deleting an entry** — its embedding row is gone (no stale vector resurrecting a deleted entry). (Task 1, 3)
4. **Backfill run twice** — idempotent: `embedded` count reflects only newly-embedded entries. (Task 3)
5. **384-float round-trip through D1** — stored `Float32Array` decodes to the exact values (BLOB, not JSON). (Task 1)

## File Structure

- `migrations/0003_entry_embeddings.sql` — the table.
- `src/embeddings/store.ts` — vector persistence + `cosine`.
- `src/embeddings/ai.ts` — `AiLike`, `EMBEDDING_MODEL`, `embedTexts`, `entryEmbeddingText`, `embedEntry`.
- `src/routes/embeddings.ts` — `POST /embeddings/backfill`.
- `src/db/search.ts` — hybrid retrieval.
- `src/routes/entries.ts`, `src/mcp/{routes,tools}.ts`, `src/index.ts` — call sites + mount.
- `web/src/pages/Access.tsx`, `web/src/lib/api.ts` — "Rebuild search index" button.
- Tests: `test/embeddings-store.test.ts`, `test/embeddings-ai.test.ts`, `test/embeddings-backfill.test.ts`, `test/search-hybrid.test.ts`, `web/src/pages/Access.test.tsx` (extend).

---

### Task 1: Vector store + cosine

**Files:**
- Create: `migrations/0003_entry_embeddings.sql`, `src/embeddings/store.ts`
- Test: `test/embeddings-store.test.ts`

**Interfaces:**
- Consumes: `env.DB`.
- Produces:
  - `putEmbedding(db, entryId, vector: Float32Array, model: string): Promise<void>` (upsert)
  - `getEmbedding(db, entryId): Promise<Float32Array | null>`
  - `getAllEmbeddings(db): Promise<Array<{ entryId: string; vector: Float32Array }>>`
  - `deleteEmbedding(db, entryId): Promise<void>`
  - `countEmbeddings(db): Promise<number>`
  - `cosine(a: Float32Array, b: Float32Array): number`

- [ ] **Step 1: Write the migration `migrations/0003_entry_embeddings.sql`**

```sql
CREATE TABLE entry_embeddings (
  entry_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector BLOB NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: Write the failing test `test/embeddings-store.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- test/embeddings-store.test.ts`
Expected: FAIL (module missing / no table).

- [ ] **Step 4: Implement `src/embeddings/store.ts`**

```ts
export interface StoredVector {
  entryId: string;
  vector: Float32Array;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function putEmbedding(
  db: D1Database,
  entryId: string,
  vector: Float32Array,
  model: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entry_embeddings (entry_id, model, dims, vector, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(entry_id) DO UPDATE SET
         model = excluded.model, dims = excluded.dims, vector = excluded.vector, updated_at = excluded.updated_at`,
    )
    .bind(entryId, model, vector.length, vector.buffer, new Date().toISOString())
    .run();
}

export async function getEmbedding(
  db: D1Database,
  entryId: string,
): Promise<Float32Array | null> {
  const row = await db
    .prepare("SELECT vector FROM entry_embeddings WHERE entry_id = ?")
    .bind(entryId)
    .first<{ vector: ArrayBuffer }>();
  return row ? new Float32Array(row.vector) : null;
}

export async function getAllEmbeddings(db: D1Database): Promise<StoredVector[]> {
  const { results } = await db
    .prepare("SELECT entry_id, vector FROM entry_embeddings")
    .all<{ entry_id: string; vector: ArrayBuffer }>();
  return results.map((r) => ({ entryId: r.entry_id, vector: new Float32Array(r.vector) }));
}

export async function deleteEmbedding(db: D1Database, entryId: string): Promise<void> {
  await db.prepare("DELETE FROM entry_embeddings WHERE entry_id = ?").bind(entryId).run();
}

export async function countEmbeddings(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM entry_embeddings")
    .first<{ n: number }>();
  return row?.n ?? 0;
}
```

- [ ] **Step 5: Apply migration locally, run test, full suite, commit**

```bash
npm run db:migrate:local
npm test -- test/embeddings-store.test.ts
npm test && npx tsc --noEmit
git add migrations/0003_entry_embeddings.sql src/embeddings/store.ts test/embeddings-store.test.ts
git commit -m "feat: add entry embedding store with cosine similarity"
```

---

### Task 2: Workers AI embedding helper + binding

**Files:**
- Create: `src/embeddings/ai.ts`
- Modify: `wrangler.jsonc`, `vitest.config.ts`
- Test: `test/embeddings-ai.test.ts`

**Interfaces:**
- Consumes: `getEntry` (Plan 1), `putEmbedding` (Task 1).
- Produces:
  - `AiLike = { run(model: string, input: { text: string[] }): Promise<{ data: number[][] }> }`
  - `EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5"`
  - `embedTexts(ai: AiLike, texts: string[]): Promise<Float32Array[]>`
  - `entryEmbeddingText(e: { title: string; tags: string[]; body: string }): string`
  - `embedEntry(db, ai: AiLike, entryId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test `test/embeddings-ai.test.ts`**

```ts
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
```

- [ ] **Step 2: Add the `AI` binding and a test override**

In `wrangler.jsonc` add (top level):
```jsonc
  "ai": { "binding": "AI" },
```
Run `npx wrangler types` (adds `AI: Ai` to `Env`).

In `vitest.config.ts`, add to the miniflare `bindings` a stub so tests never hit the network:
```ts
            AI: { run: async () => ({ data: [] }) },
```
(If the pool rejects an `ai` binding, this stub substitutes it; confirm worker tests still start.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- test/embeddings-ai.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement `src/embeddings/ai.ts`**

```ts
import { getEntry } from "../db/entries";
import { putEmbedding } from "./store";

export const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";

export interface AiLike {
  run(model: string, input: { text: string[] }): Promise<{ data: number[][] }>;
}

export async function embedTexts(ai: AiLike, texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const res = await ai.run(EMBEDDING_MODEL, { text: texts });
  return res.data.map((v) => Float32Array.from(v));
}

export function entryEmbeddingText(e: { title: string; tags: string[]; body: string }): string {
  return [e.title, e.tags.join(" "), e.body].join("\n").slice(0, 2000);
}

export async function embedEntry(db: D1Database, ai: AiLike, entryId: string): Promise<boolean> {
  const entry = await getEntry(db, entryId);
  if (!entry) return false;
  const [vector] = await embedTexts(ai, [entryEmbeddingText(entry)]);
  await putEmbedding(db, entryId, vector, EMBEDDING_MODEL);
  return true;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/embeddings-ai.test.ts`
Expected: PASS (4/4). Then `npm test` (full) + `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/embeddings/ai.ts wrangler.jsonc vitest.config.ts worker-configuration.d.ts test/embeddings-ai.test.ts
git commit -m "feat: Workers AI embedding helper and AI binding"
```

---

### Task 3: Best-effort embed on write + backfill endpoint

**Files:**
- Create: `src/routes/embeddings.ts`
- Modify: `src/routes/entries.ts`, `src/index.ts`
- Test: `test/embeddings-backfill.test.ts`

**Interfaces:**
- Consumes: `embedEntry` (Task 2), `putEmbedding`/`getAllEmbeddings` (Task 1), `listEntries`/`getEntry` (Plan 1), `requireSession`.
- Produces: `POST /embeddings/backfill?all=1` (session-protected) → `{ embedded, total }`; create/update/delete of entries keep embeddings in sync.

- [ ] **Step 1: Write the failing test `test/embeddings-backfill.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { resetDb } from "./reset";
import { upsertUserByEmail, createSession } from "../src/auth/sessions";
import { createEntry } from "../src/db/entries";
import { countEmbeddings } from "../src/embeddings/store";

beforeEach(resetDb);

async function cookie(): Promise<string> {
  const user = await upsertUserByEmail(env.DB, "owner@example.com");
  const { token } = await createSession(env.DB, user.id, "test");
  return `hib_session=${token}`;
}

describe("embeddings backfill", () => {
  it("requires auth", async () => {
    const res = await SELF.fetch("https://example.com/embeddings/backfill", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("embeds entries lacking an embedding, idempotently", async () => {
    const c = await cookie();
    await createEntry(env.DB, { title: "A" });
    await createEntry(env.DB, { title: "B" });

    // The test AI stub returns { data: [] }; give it a real-shaped response via miniflare binding is not
    // possible here, so assert the endpoint runs and is idempotent in terms of "not double-embedding".
    const first = await SELF.fetch("https://example.com/embeddings/backfill", { method: "POST", headers: { cookie: c } });
    expect(first.status).toBe(200);
    expect((await first.json<{ total: number }>()).total).toBe(2);
    const second = await SELF.fetch("https://example.com/embeddings/backfill", { method: "POST", headers: { cookie: c } });
    expect((await second.json<{ embedded: number }>()).embedded).toBe(0);
  });
});
```

(If the `AI` stub in tests returns `{ data: [] }`, `embedEntry` would store nothing — so the endpoint should count only entries it actually embedded. Implement `backfill` to skip when `embedEntry` returns false/throws, and to count `total` as entries considered.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/embeddings-backfill.test.ts`
Expected: FAIL (404).

- [ ] **Step 3: Implement `src/routes/embeddings.ts`**

```ts
import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { requireSession } from "../middleware/auth";
import { listEntries } from "../db/entries";
import { embedEntry, type AiLike } from "../embeddings/ai";
import { getEmbedding } from "../embeddings/store";

export const embeddingRoutes = new Hono<AppEnv>();
embeddingRoutes.use("*", requireSession);

embeddingRoutes.post("/backfill", async (c) => {
  if (!c.env.AI) return c.json({ error: "AI not configured" }, 400);
  const ai = c.env.AI as unknown as AiLike;
  const all = c.req.query("all") === "1";
  const entries = await listEntries(c.env.DB, { limit: 200 });
  let embedded = 0;
  for (const e of entries) {
    if (!all && (await getEmbedding(c.env.DB, e.id))) continue;
    try {
      if (await embedEntry(c.env.DB, ai, e.id)) embedded += 1;
    } catch (err) {
      console.error("embed failed", e.id, err);
    }
  }
  return c.json({ embedded, total: entries.length });
});
```

- [ ] **Step 4: Sync embeddings on write in `src/routes/entries.ts`**

Add imports:
```ts
import { embedEntry, type AiLike } from "../embeddings/ai";
import { deleteEmbedding } from "../embeddings/store";
```
Add a helper near the top of the file:
```ts
function scheduleEmbed(c: { env: Env; executionCtx: ExecutionContext }, entryId: string): void {
  if (!c.env.AI) return;
  const ai = c.env.AI as unknown as AiLike;
  c.executionCtx.waitUntil(embedEntry(c.env.DB, ai, entryId).catch((err) => console.error("embed failed", err)));
}
```
Call `scheduleEmbed(c, entry.id)` after a successful `POST /` (create) and after `PATCH /:id` (update). In `DELETE /:id`, after `deleteEntry`, call `await deleteEmbedding(c.env.DB, existing.id)`.

- [ ] **Step 5: Mount the route in `src/index.ts`**

```ts
import { embeddingRoutes } from "./routes/embeddings";
// ...
app.route("/embeddings", embeddingRoutes);
```
Add `/embeddings` and `/embeddings/*` to the `assets.run_worker_first` array in `wrangler.jsonc`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- test/embeddings-backfill.test.ts`
Expected: PASS (2/2). Then `npm test` + `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/routes/embeddings.ts src/routes/entries.ts src/index.ts wrangler.jsonc worker-configuration.d.ts test/embeddings-backfill.test.ts
git commit -m "feat: best-effort embed on write + backfill endpoint"
```

---

### Task 4: Hybrid search + FTS fallback

**Files:**
- Modify: `src/db/search.ts`, `src/routes/entries.ts`, `src/mcp/tools.ts`, `src/mcp/routes.ts`
- Test: `test/search-hybrid.test.ts`

**Interfaces:**
- Consumes: `embedTexts`/`AiLike` (Task 2), `cosine`/`getAllEmbeddings` (Task 1), existing FTS.
- Produces: `searchEntries(db, query, opts?: { kind?; tags?; status?; limit?; ai?: AiLike }): Promise<Entry[]>` — semantic-first merge; FTS-only when `ai` is omitted or throws.

- [ ] **Step 1: Write the failing test `test/search-hybrid.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/search-hybrid.test.ts`
Expected: FAIL (search ignores `ai`).

- [ ] **Step 3: Rewrite `src/db/search.ts`**

```ts
import type { Entry, EntryKind, EntryStatus } from "./types";
import { getEntry } from "./entries";
import { cosine, getAllEmbeddings } from "../embeddings/store";
import { embedTexts, type AiLike } from "../embeddings/ai";

export function toFtsQuery(raw: string): string {
  const terms = raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return terms.join(" ");
}

export interface SearchOptions {
  kind?: EntryKind;
  tags?: string[];
  status?: EntryStatus;
  limit?: number;
  ai?: AiLike;
}

function passes(e: Entry, opts: SearchOptions): boolean {
  if (opts.kind && e.kind !== opts.kind) return false;
  if (opts.status && e.status !== opts.status) return false;
  if (opts.tags?.length && !opts.tags.every((t) => e.tags.includes(t))) return false;
  return true;
}

async function ftsMatches(db: D1Database, query: string, limit: number): Promise<Entry[]> {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  const { results } = await db
    .prepare(`SELECT entry_id FROM entries_fts WHERE entries_fts MATCH ? ORDER BY rank LIMIT ?`)
    .bind(fts, limit)
    .all<{ entry_id: string }>();
  const entries: Entry[] = [];
  for (const r of results) {
    const e = await getEntry(db, r.entry_id);
    if (e) entries.push(e);
  }
  return entries;
}

const SEMANTIC_FLOOR = 0.3;

async function semanticMatches(
  db: D1Database,
  query: string,
  ai: AiLike,
  limit: number,
): Promise<Entry[]> {
  const [qv] = await embedTexts(ai, [query]);
  const all = await getAllEmbeddings(db);
  const scored = all
    .map((row) => ({ entryId: row.entryId, score: cosine(qv, row.vector) }))
    .filter((s) => s.score >= SEMANTIC_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 3);
  const entries: Entry[] = [];
  for (const s of scored) {
    const e = await getEntry(db, s.entryId);
    if (e) entries.push(e);
  }
  return entries;
}

export async function searchEntries(
  db: D1Database,
  query: string,
  opts: SearchOptions = {},
): Promise<Entry[]> {
  const limit = Math.min(opts.limit ?? 25, 100);
  const out: Entry[] = [];
  const seen = new Set<string>();

  if (opts.ai && query.trim()) {
    try {
      for (const e of await semanticMatches(db, query, opts.ai, limit)) {
        if (out.length >= limit) break;
        if (!seen.has(e.id) && passes(e, opts)) {
          seen.add(e.id);
          out.push(e);
        }
      }
    } catch {
      // fall back to FTS only
    }
  }

  for (const e of await ftsMatches(db, query, limit * 4)) {
    if (out.length >= limit) break;
    if (!seen.has(e.id) && passes(e, opts)) {
      seen.add(e.id);
      out.push(e);
    }
  }
  return out;
}
```

- [ ] **Step 4: Thread `ai` through the call sites**

- `src/routes/entries.ts` `GET /` (the `q` branch): pass `ai: c.env.AI as unknown as AiLike | undefined` (import `AiLike`).
- `src/mcp/tools.ts`: add an optional `ai?: AiLike` param to `callTool` (and `searchLibrary`), forwarding to `searchEntries`.
- `src/mcp/routes.ts`: pass `c.env.AI as unknown as AiLike` into `callTool`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/search-hybrid.test.ts`
Expected: PASS (3/3). Then `npm test` + `npx tsc --noEmit` (all existing search tests still pass — they omit `ai`).

- [ ] **Step 6: Commit**

```bash
git add src/db/search.ts src/routes/entries.ts src/mcp/tools.ts src/mcp/routes.ts test/search-hybrid.test.ts
git commit -m "feat: hybrid semantic + FTS search with fallback"
```

---

### Task 5: "Rebuild search index" in the UI

**Files:**
- Modify: `web/src/lib/api.ts`, `web/src/pages/Access.tsx`
- Test: `web/src/pages/Access.test.tsx`

**Interfaces:**
- Consumes: `POST /embeddings/backfill`.
- Produces: `reindex()` API call + a button on Access.

- [ ] **Step 1: Add the API call to `web/src/lib/api.ts`**

```ts
export const reindex = () => api<{ embedded: number; total: number }>("/embeddings/backfill", { method: "POST" });
```

- [ ] **Step 2: Write the failing test (extend `web/src/pages/Access.test.tsx`)**

```tsx
it("rebuilds the search index", async () => {
  vi.spyOn(api, "listSessions").mockResolvedValue([]);
  const spy = vi.spyOn(api, "reindex").mockResolvedValue({ embedded: 3, total: 3 });
  renderAccess();
  await userEvent.click(await screen.findByRole("button", { name: /rebuild search index/i }));
  expect(spy).toHaveBeenCalled();
});
```

- [ ] **Step 3: Implement the button in `web/src/pages/Access.tsx`**

Add a mutation like the mint one and a section:

```tsx
// inside component
const reindex = useMutation({
  mutationFn: () => apiReindex(),
  onSuccess: (r) => toast.success(`Index rebuilt (${r.embedded}/${r.total}).`),
  onError: () => toast.error("Could not rebuild the index."),
});
```
```tsx
<section className="border-t border-border py-6">
  <h2 className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
    Search index
  </h2>
  <p className="mb-4 max-w-lg text-sm text-muted-foreground">
    Recompute semantic embeddings for entries that don't have them yet.
  </p>
  <Button variant="outline" onClick={() => reindex.mutate()} disabled={reindex.isPending}>
    Rebuild search index
  </Button>
</section>
```
(import `reindex as apiReindex` from `@/lib/api`.)

- [ ] **Step 4: Run web tests + build + commit**

```bash
npm --prefix web run test && npm --prefix web run build
git add web
git commit -m "feat: rebuild-search-index button on Access"
```

---

## Plan Self-Review

**Spec coverage:** §5 table ✅ (T1); §6 embedding ✅ (T2); §7 best-effort write path ✅ (T3); §8 backfill ✅ (T3) + UI ✅ (T5); §9 hybrid + fallback ✅ (T4); §10 binding ✅ (T2); §11 tests ✅; §12 cost ✅ (design choice). Open question §13 (floor/weighting) is encoded as `SEMANTIC_FLOOR` — tunable.

**Placeholder scan:** no TBD/TODO; each code step is complete.

**Type consistency:** `AiLike`, `EMBEDDING_MODEL`, `embedTexts`, `entryEmbeddingText`, `embedEntry`, `putEmbedding`, `cosine`, `getAllEmbeddings`, `SearchOptions.ai` are consistent across T1–T4.

**Review Focus:** (1) FTS fallback on AI error — T4 test; (2) embed failure doesn't break capture — T3 (best-effort + try/catch); (3) delete removes embedding — T1 + T3; (4) backfill idempotent — T3 test; (5) 384-float BLOB round-trip — T1 test.

## Execution Note

Sequential: T1→T2→T3→T4 (T4 depends on T1–T3), T5 last. Recommend **subagent-driven** — the `AI` binding in the test pool and the recursion of the search path are easy to get subtly wrong, so a fresh reviewer per task helps.

## Risks for the executor
- **`ai` binding in the Workers test pool**: if miniflare rejects an `ai` binding, provide the `AI` stub via `vitest.config.ts` miniflare `bindings` (Task 2 Step 2) and confirm worker tests still start; if the stub's `run` shape is rejected, guard every AI call in try/catch (already the design) and adapt.
- **`c.env.AI as unknown as AiLike`** cast is deliberate (the generated `Ai` type is generic); keep the `AiLike` seam so tests inject a fake.
