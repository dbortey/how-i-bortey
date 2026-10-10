export interface StoredVector {
  entryId: string;
  vector: Float32Array;
}

function decodeVector(raw: ArrayBuffer | ArrayLike<number>): Float32Array {
  if (raw instanceof ArrayBuffer) return new Float32Array(raw);
  return new Float32Array(Uint8Array.from(raw).buffer);
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
    .bind(
      entryId,
      model,
      vector.length,
      vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength),
      new Date().toISOString(),
    )
    .run();
}

export async function getEmbedding(
  db: D1Database,
  entryId: string,
): Promise<Float32Array | null> {
  const row = await db
    .prepare("SELECT vector FROM entry_embeddings WHERE entry_id = ?")
    .bind(entryId)
    .first<{ vector: ArrayBuffer | ArrayLike<number> }>();
  return row ? decodeVector(row.vector) : null;
}

export async function getAllEmbeddings(db: D1Database): Promise<StoredVector[]> {
  const { results } = await db
    .prepare("SELECT entry_id, vector FROM entry_embeddings")
    .all<{ entry_id: string; vector: ArrayBuffer | ArrayLike<number> }>();
  return results.map((r) => ({ entryId: r.entry_id, vector: decodeVector(r.vector) }));
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
