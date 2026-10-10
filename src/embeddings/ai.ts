import { getEntry } from "../db/entries";
import { putEmbedding } from "./store";

export const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";

export interface AiLike {
  run(model: string, input: { text: string[] }): Promise<{ data: number[][] }>;
}

export async function embedTexts(ai: AiLike, texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const res = await ai.run(EMBEDDING_MODEL, { text: texts });
  return res.data.map((v) => Float32Array.from(v));
}

export function entryEmbeddingText(e: { title: string; tags: string[]; body: string }): string {
  return [e.title, e.tags.join(" "), e.body].join("\n").slice(0, 2000);
}

export async function embedEntry(db: D1Database, ai: AiLike, entryId: string): Promise<boolean> {
  const entry = await getEntry(db, entryId);
  if (!entry) return false;
  const [vector] = await embedTexts(ai, [entryEmbeddingText(entry)]);
  await putEmbedding(db, entryId, vector, EMBEDDING_MODEL);
  return true;
}
