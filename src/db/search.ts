import type { Entry, EntryKind, EntryStatus } from "./types";
import { getEntry } from "./entries";

export function toFtsQuery(raw: string): string {
  const terms = raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return terms.join(" ");
}

export async function searchEntries(
  db: D1Database,
  query: string,
  opts: { kind?: EntryKind; status?: EntryStatus; tags?: string[]; limit?: number } = {},
): Promise<Entry[]> {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  const limit = Math.min(opts.limit ?? 25, 100);
  const { results } = await db
    .prepare(
      `SELECT entry_id FROM entries_fts
       WHERE entries_fts MATCH ? ORDER BY rank LIMIT ?`,
    )
    .bind(fts, limit * 4)
    .all<{ entry_id: string }>();

  const entries: Entry[] = [];
  for (const r of results) {
    const entry = await getEntry(db, r.entry_id);
    if (!entry) continue;
    if (opts.kind && entry.kind !== opts.kind) continue;
    if (opts.status && entry.status !== opts.status) continue;
    if (opts.tags?.length && !opts.tags.every((t) => entry.tags.includes(t))) continue;
    entries.push(entry);
    if (entries.length >= limit) break;
  }
  return entries;
}
