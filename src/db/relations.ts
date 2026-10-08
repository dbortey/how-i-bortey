export interface RelatedEntry {
  id: string;
  title: string;
  kind: string;
  status: string;
  verdict: string | null;
}

export interface Relation {
  id: string;
  type: string;
  verdict: string | null;
  reason: string | null;
  related: RelatedEntry | null;
}

interface RelationRow {
  id: string;
  type: string;
  verdict: string | null;
  reason: string | null;
  rid: string | null;
  rtitle: string | null;
  rkind: string | null;
  rstatus: string | null;
  rverdict: string | null;
}

export async function getRelations(
  db: D1Database,
  entryId: string,
): Promise<Relation[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id AS id, r.type AS type, r.verdict AS verdict, r.reason AS reason,
              e.id AS rid, e.title AS rtitle, e.kind AS rkind, e.status AS rstatus, e.verdict AS rverdict
       FROM entry_relations r
       LEFT JOIN entries e ON e.id = r.to_entry
       WHERE r.from_entry = ?
       ORDER BY r.type, r.id`,
    )
    .bind(entryId)
    .all<RelationRow>();
  return results.map((r) => ({
    id: r.id,
    type: r.type,
    verdict: r.verdict,
    reason: r.reason,
    related: r.rid
      ? { id: r.rid, title: r.rtitle ?? "", kind: r.rkind ?? "", status: r.rstatus ?? "", verdict: r.rverdict }
      : null,
  }));
}

export async function createRelation(
  db: D1Database,
  fromEntry: string,
  input: { to_entry: string; type: string; verdict?: string; reason?: string },
): Promise<Relation> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO entry_relations (id, from_entry, to_entry, type, verdict, reason) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, fromEntry, input.to_entry, input.type, input.verdict ?? null, input.reason ?? null)
    .run();
  const all = await getRelations(db, fromEntry);
  return all.find((r) => r.id === id)!;
}

export async function deleteRelation(
  db: D1Database,
  entryId: string,
  relationId: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM entry_relations WHERE id = ? AND from_entry = ?")
    .bind(relationId, entryId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
