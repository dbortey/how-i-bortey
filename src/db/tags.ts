export interface TagCount {
  name: string;
  kind: string;
  count: number;
}

export async function listTags(db: D1Database): Promise<TagCount[]> {
  const { results } = await db
    .prepare(
      `SELECT t.name AS name, t.kind AS kind, COUNT(et.entry_id) AS count
       FROM tags t
       LEFT JOIN entry_tags et ON et.tag_id = t.id
       GROUP BY t.id
       ORDER BY count DESC, t.name ASC`,
    )
    .all<TagCount>();
  return results;
}
