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
