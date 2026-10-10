import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { requireSession } from "../middleware/auth";
import { backfillEmbeddings } from "../embeddings/backfill";
import type { AiLike } from "../embeddings/ai";

export const embeddingRoutes = new Hono<AppEnv>();
embeddingRoutes.use("*", requireSession);

embeddingRoutes.post("/backfill", async (c) => {
  const ai = c.env.AI as unknown as AiLike | undefined;
  if (!ai) return c.json({ error: "AI not configured" }, 400);
  const all = c.req.query("all") === "1";
  return c.json(await backfillEmbeddings(c.env.DB, ai, { all }));
});
