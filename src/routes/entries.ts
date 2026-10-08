import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { requireSession } from "../middleware/auth";
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  updateEntry,
} from "../db/entries";
import { searchEntries } from "../db/search";
import { createLink, deleteLink, getLinks } from "../db/links";
import { createRelation, deleteRelation, getRelations } from "../db/relations";
import type {
  CreateEntryInput,
  EntryKind,
  EntryStatus,
  UpdateEntryInput,
} from "../db/types";

export const entryRoutes = new Hono<AppEnv>();
entryRoutes.use("*", requireSession);

const KINDS: EntryKind[] = ["tool", "workflow", "decision", "note"];
const STATUSES: EntryStatus[] = ["inbox", "filed", "archived"];

function invalidTags(tags: unknown): boolean {
  return (
    tags !== undefined &&
    (!Array.isArray(tags) || !tags.every((t) => typeof t === "string"))
  );
}

entryRoutes.get("/", async (c) => {
  const q = c.req.query("q");
  const status = c.req.query("status") as EntryStatus | undefined;
  const kind = c.req.query("kind") as EntryKind | undefined;
  if (q) {
    const results = await searchEntries(c.env.DB, q, { status, kind, limit: 50 });
    return c.json(results);
  }
  return c.json(await listEntries(c.env.DB, { status, kind }));
});

entryRoutes.post("/", async (c) => {
  const body = await c.req.json<Partial<CreateEntryInput>>().catch(() => null);
  if (!body || typeof body.title !== "string" || body.title.trim() === "") {
    return c.json({ error: "title is required" }, 400);
  }
  if (body.kind && !KINDS.includes(body.kind)) {
    return c.json({ error: "invalid kind" }, 400);
  }
  if (body.status && !STATUSES.includes(body.status)) {
    return c.json({ error: "invalid status" }, 400);
  }
  if (invalidTags(body.tags)) return c.json({ error: "invalid tags" }, 400);
  const entry = await createEntry(c.env.DB, {
    ...body,
    title: body.title.trim(),
  } as CreateEntryInput);
  return c.json(entry, 201);
});

entryRoutes.get("/:id", async (c) => {
  const entry = await getEntry(c.env.DB, c.req.param("id"));
  if (!entry) return c.json({ error: "not found" }, 404);
  return c.json({
    ...entry,
    relations: await getRelations(c.env.DB, entry.id),
    links: await getLinks(c.env.DB, entry.id),
  });
});

entryRoutes.post("/:id/links", async (c) => {
  const entry = await getEntry(c.env.DB, c.req.param("id"));
  if (!entry) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ url?: unknown; title?: unknown; kind?: unknown; note?: unknown }>().catch(() => null);
  if (!body || typeof body.url !== "string" || !body.url.trim()) {
    return c.json({ error: "url is required" }, 400);
  }
  const link = await createLink(c.env.DB, entry.id, {
    url: body.url.trim(),
    title: typeof body.title === "string" ? body.title : undefined,
    kind: typeof body.kind === "string" ? body.kind : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  });
  return c.json(link, 201);
});

entryRoutes.delete("/:id/links/:linkId", async (c) => {
  const ok = await deleteLink(c.env.DB, c.req.param("id"), c.req.param("linkId"));
  return ok ? c.body(null, 204) : c.json({ error: "not found" }, 404);
});

entryRoutes.post("/:id/relations", async (c) => {
  const entry = await getEntry(c.env.DB, c.req.param("id"));
  if (!entry) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<{ to_entry?: unknown; type?: unknown; verdict?: unknown; reason?: unknown }>().catch(() => null);
  if (!body || typeof body.to_entry !== "string" || typeof body.type !== "string" || !body.type.trim()) {
    return c.json({ error: "to_entry and type are required" }, 400);
  }
  const target = await getEntry(c.env.DB, body.to_entry);
  if (!target) return c.json({ error: "target entry not found" }, 400);
  const relation = await createRelation(c.env.DB, entry.id, {
    to_entry: body.to_entry,
    type: body.type,
    verdict: typeof body.verdict === "string" ? body.verdict : undefined,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  });
  return c.json(relation, 201);
});

entryRoutes.delete("/:id/relations/:relationId", async (c) => {
  const ok = await deleteRelation(c.env.DB, c.req.param("id"), c.req.param("relationId"));
  return ok ? c.body(null, 204) : c.json({ error: "not found" }, 404);
});

entryRoutes.patch("/:id", async (c) => {
  const body = await c.req.json<Partial<UpdateEntryInput>>().catch(() => null);
  if (!body) return c.json({ error: "invalid body" }, 400);
  if (body.kind && !KINDS.includes(body.kind)) {
    return c.json({ error: "invalid kind" }, 400);
  }
  if (body.status && !STATUSES.includes(body.status)) {
    return c.json({ error: "invalid status" }, 400);
  }
  if (invalidTags(body.tags)) return c.json({ error: "invalid tags" }, 400);
  const existing = await getEntry(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "not found" }, 404);
  return c.json(await updateEntry(c.env.DB, existing.id, body));
});

entryRoutes.delete("/:id", async (c) => {
  const existing = await getEntry(c.env.DB, c.req.param("id"));
  if (!existing) return c.json({ error: "not found" }, 404);
  await deleteEntry(c.env.DB, existing.id);
  return c.body(null, 204);
});
