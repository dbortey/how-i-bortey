import { listEntries } from "../db/entries";
import { embedEntry, type AiLike } from "./ai";
import { getEmbedding } from "./store";

export async function backfillEmbeddings(
  db: D1Database,
  ai: AiLike,
  opts: { all?: boolean } = {},
): Promise<{ embedded: number; total: number; failed: number }> {
  const entries = await listEntries(db, { limit: 200 });
  let embedded = 0;
  let failed = 0;
  for (const e of entries) {
    try {
      if (!opts.all && (await getEmbedding(db, e.id))) continue;
      if (await embedEntry(db, ai, e.id)) embedded += 1;
    } catch (err) {
      failed += 1;
      console.error("embed failed", e.id, err);
    }
  }
  return { embedded, total: entries.length, failed };
}
