import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { requireSession } from "../middleware/auth";
import { getMedia, putMedia } from "../media/store";
import { getEntry } from "../db/entries";

export const mediaRoutes = new Hono<AppEnv>();
mediaRoutes.use("*", requireSession);

mediaRoutes.post("/", async (c) => {
  const mime = c.req.header("content-type") ?? "application/octet-stream";
  const entryId = c.req.header("x-entry-id")?.trim() || null;
  if (entryId) {
    const entry = await getEntry(c.env.DB, entryId);
    if (!entry) return c.json({ error: "entry not found" }, 400);
  }
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "empty body" }, 400);
  const media = await putMedia(c.env.DB, c.env.MEDIA, { bytes, mime, entryId });
  return c.json(media, 201);
});

mediaRoutes.get("/:id", async (c) => {
  const media = await getMedia(c.env.DB, c.req.param("id"));
  if (!media) return c.json({ error: "not found" }, 404);
  const object = await c.env.MEDIA.get(media.storage_key);
  if (!object) return c.json({ error: "not found" }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": media.mime ?? "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
});
