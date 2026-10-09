export interface Media {
  id: string;
  entry_id: string | null;
  storage_key: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
}

export async function putMedia(
  db: D1Database,
  r2: R2Bucket,
  input: { bytes: ArrayBuffer; mime: string; entryId?: string | null; caption?: string | null },
): Promise<Media> {
  const id = crypto.randomUUID();
  const storageKey = `media/${id}`;
  await r2.put(storageKey, input.bytes, { httpMetadata: { contentType: input.mime } });
  await db
    .prepare(
      "INSERT INTO media (id, entry_id, storage_key, mime, caption) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, input.entryId ?? null, storageKey, input.mime, input.caption ?? null)
    .run();
  return (await getMedia(db, id))!;
}

export async function getMedia(db: D1Database, id: string): Promise<Media | null> {
  return db
    .prepare("SELECT id, entry_id, storage_key, mime, width, height, caption FROM media WHERE id = ?")
    .bind(id)
    .first<Media>();
}

export async function getMediaForEntry(db: D1Database, entryId: string): Promise<Media[]> {
  const { results } = await db
    .prepare("SELECT id, entry_id, storage_key, mime, width, height, caption FROM media WHERE entry_id = ? ORDER BY id")
    .bind(entryId)
    .all<Media>();
  return results;
}
