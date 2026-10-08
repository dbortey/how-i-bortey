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

entryRoutes.get("/", async (c) => {
  const q = c.req.query("q");
  if (q) {
    const results = await searchEntries(c.env.DB, q, { limit: 50 });
    return c.json(results);
  }
  const status = c.req.query("status") as EntryStatus | undefined;
  const kind = c.req.query("kind") as EntryKind | undefined;
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
  const entry = await createEntry(c.env.DB, {
    ...body,
    title: body.title.trim(),
  } as CreateEntryInput);
  return c.json(entry, 201);
});

entryRoutes.get("/:id", async (c) => {
  const entry = await getEntry(c.env.DB, c.req.param("id"));
  if (!entry) return c.json({ error: "not found" }, 404);
  return c.json(entry);
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
