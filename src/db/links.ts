export interface Link {
  id: string;
  url: string;
  title: string | null;
  kind: string | null;
  note: string | null;
}

export async function getLinks(db: D1Database, entryId: string): Promise<Link[]> {
  const { results } = await db
    .prepare(
      `SELECT id, url, title, kind, note FROM links
       WHERE entry_id = ? ORDER BY id`,
    )
    .bind(entryId)
    .all<Link>();
  return results;
}

export async function createLink(
  db: D1Database,
  entryId: string,
  input: { url: string; title?: string; kind?: string; note?: string },
): Promise<Link> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO links (id, entry_id, url, title, kind, note) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, entryId, input.url, input.title ?? null, input.kind ?? null, input.note ?? null)
    .run();
  const row = await db
    .prepare("SELECT id, url, title, kind, note FROM links WHERE id = ?")
    .bind(id)
    .first<Link>();
  return row!;
}

export async function deleteLink(
  db: D1Database,
  entryId: string,
  linkId: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM links WHERE id = ? AND entry_id = ?")
    .bind(linkId, entryId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}
