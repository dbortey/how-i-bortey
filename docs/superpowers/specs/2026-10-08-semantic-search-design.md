# Semantic Search — Design Spec

**Date:** 2026-10-08
**Status:** Approved design (approach A), pending written-spec review
**Depends on:** Plan 1 (D1 + entry repository + `searchEntries`), Plan 2 (MCP `search_library`)

## 1. Purpose

Make the library recall entries by **meaning**, not just keywords — "editing a photo"
should surface the *Capture One* entry even though those words don't appear. This upgrades
the existing tags + FTS5 retrieval with a semantic layer, unchanged on the outside: the
Library search box and the MCP `search_library` tool simply return better matches.

## 2. Goal & success criteria

- A fuzzy task query ("editing a photo", "raw editor") returns the intended entry ranked at
  or near the top, even with zero keyword overlap.
- No regression: keyword search and all existing filters still work; if the AI service is
  unavailable, retrieval falls back to FTS5 and the app keeps working.
- No new paid dependency. Runs within Workers AI's free allocation for a personal library.

## 3. Non-goals

- Vectorize / a hosted vector DB (rejected: Workers Paid only).
- Cross-encoder reranking, query expansion, or an LLM in the retrieval path.
- Multimodal (image) embeddings.
- Re-embedding backfill on a schedule (manual/backfill endpoint only for now).

## 4. Decisions

| Area | Decision |
| --- | --- |
| Embedding model | `@cf/baai/bge-small-en-v1.5` (384-dim) via the `AI` binding |
| Vector store | D1 — a new `entry_embeddings` table (no Vectorize) |
| Similarity | Cosine, computed in the Worker over all stored vectors |
| Retrieval | Hybrid: semantic ∪ FTS5, semantic-first, filters preserved |
| Write path | Best-effort embed after create/update, via `waitUntil` |
| Fallback | FTS5-only when the `AI` binding is missing or errors |
| Cost | Free at personal scale (Workers AI 10k neurons/day) |

## 5. Data model

New migration `0003_entry_embeddings.sql`:

```sql
CREATE TABLE entry_embeddings (
  entry_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector BLOB NOT NULL,        -- Float32Array bytes, little-endian
  updated_at TEXT NOT NULL
);
```

- `vector` is the raw `Float32Array` buffer (384 floats = 1536 bytes) — compact and fast to
  decode. Chosen over JSON for size and round-trip fidelity.
- Rows are removed with their entry (`ON DELETE CASCADE`); `deleteEntry` also deletes the
  embedding explicitly (D1 enforces FKs, but the explicit delete keeps the repo self-contained).

## 6. Embedding

- **Text to embed:** `title + "\n" + tags.join(" ") + "\n" + body` (truncated to a sane
  length, e.g. 2000 chars — bge-small handles ~512 tokens).
- **Call:** `env.AI.run("@cf/baai/bge-small-en-v1.5", { text: [t1, t2, ...] })` →
  `{ data: number[][] }`; one call can batch several texts (backfill).
- **Write:** a new `src/embeddings/store.ts`:
  - `embedTexts(ai, texts, model): Promise<Float32Array[]>`
  - `putEmbedding(db, entryId, vector, model): Promise<void>` (upsert)
  - `getAllEmbeddings(db): Promise<Array<{ entryId: string; vector: Float32Array }>>`
  - `hasEmbedding(db, entryId): Promise<boolean>`
  - `cosine(a: Float32Array, b: Float32Array): number`

## 7. Write path

- In `createEntry`/`updateEntry` **callers** (the entry routes) — not inside the repository,
  to keep the repo free of I/O side effects — schedule a best-effort embed:
  `ctx.waitUntil(embedOne(env, entryId))` after a successful create/update.
- `embedOne` recomputes the text from the stored entry, embeds, and upserts. Errors are caught
  and logged; a failed embed leaves the entry fully usable (FTS still matches it).
- MCP `add_entry` and the Telegram/email capture paths go through the same route/repository,
  so they're covered automatically.

## 8. Backfill

- `POST /embeddings/backfill` (session-protected): embeds every entry that lacks an embedding
  (or all, with `?all=1`), in batches of e.g. 20 texts per `AI` call, upserting each. Returns
  `{ embedded, total }`. Best-effort per batch; a partial run is safe to re-run (idempotent).
- Exposed in the UI (Access page: a "Rebuild search index" button) — small addition.

## 9. Retrieval (hybrid)

New `src/db/search.ts` behavior (replacing the current FTS-only body):

1. Run the existing FTS5 query → `fts: Entry[]` (unchanged).
2. If `AI` is available: embed the query; load all embeddings; compute cosine; keep the top-K
   (K = limit) above a floor (e.g. 0.30); map ids → entries; apply `kind`/`status`/`tags` filters.
3. Merge: result = semantic matches first, then FTS matches not already included, capped at `limit`.
4. If AI is unavailable or embedding fails: return FTS results only (today's behavior).

`searchEntries(db, query, { ai, kind, tags, status, limit })` gains an optional `ai`; when
omitted (or the binding is absent), it behaves exactly as today. This keeps the MCP tool and
the REST route call sites tiny.

## 10. Bindings & config

- `wrangler.jsonc`: add `"ai": { "binding": "AI" }`.
- `npx wrangler types` regenerates `Env` with `AI: Ai`.
- No new secrets.

## 11. Testing

- **Unit:** `cosine` (identical, orthogonal, opposite); `embedTexts` with a fake `AI`
  (`{ run: async () => ({ data: [[...384 floats]] }) }`); hybrid ranker put a semantically-matching
  entry ahead of a non-matching one when keywords don't overlap; FTS fallback when `ai` omitted.
- **Integration:** create entries, run backfill with a fake `AI`, then `searchEntries` returns the
  intended entry for a synonym query; deleting an entry removes its embedding.
- The Workers test pool provides a fake `AI` binding or the code path is exercised by passing a
  fake `ai`; no live network.

## 12. Cost & limits

- Model `@cf/baai/bge-small-en-v1.5`: 1,841 neurons/M input tokens. Embedding a personal
  library is a few thousand neurons total — inside the 10k/day free allocation.
- Query-time: one embed per search (a few neurons) + O(N·384) float ops in the Worker.
- These are text embedding calls; they do not use image CPU, so the media CPU caveat is unrelated.

## 13. Open questions (resolve during implementation)

1. Exact cosine floor + whether to weight semantic vs FTS — tune with a small recorded query set.
2. Whether to also embed the `attributes.why_i_chose_it` text (default: no; title+tags+body only).

## 14. Next step

On written-spec approval, invoke `writing-plans` to produce the implementation plan.
