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
